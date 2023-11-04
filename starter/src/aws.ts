import {
  type HostedZone,
  Route53,
  type ResourceRecordSet,
} from "@aws-sdk/client-route-53";
import {
  ACM,
  type ListCertificatesCommandOutput,
  type CertificateSummary,
} from "@aws-sdk/client-acm";
import { S3 } from "@aws-sdk/client-s3";
import {
  CloudFront,
  type DistributionConfig,
  type ViewerCertificate,
} from "@aws-sdk/client-cloudfront";
import type { AwsCredentialIdentity } from "@aws-sdk/types/dist-types/identity";

export type Domain = {
  /**  E.g., my.domain.example.com */
  fqdn: string;
  /**  E.g., example.com */
  baseDomain: string;
  /**  E.g., my.domain */
  subdomain: string;
  /**  E.g., com */
  tld: string;
};

export const AWS_REGIONS = [
  "us-east-1",
  "us-east-2",
  "us-west-1",
  "us-west-2",
  "ap-south-1",
  "ap-northeast-3",
  "ap-northeast-2",
  "ap-southeast-1",
  "ap-southeast-2",
  "ap-northeast-1",
  "ca-central-1",
  "eu-central-1",
  "eu-west-1",
  "eu-west-2",
  "eu-west-3",
  "eu-north-1",
  "sa-east-1",
] as const;

export type AwsRegion = (typeof AWS_REGIONS)[number];

/**
 * @param {} region
 * @param {} credentials
 */
const createSetupFunctions = (
  region: AwsRegion,
  credentials: AwsCredentialIdentity
) => {
  const route53 = new Route53({ region, credentials });
  const acm = new ACM({ region, credentials });
  const s3 = new S3({ region, credentials });
  const cloudfront = new CloudFront({ region, credentials });

  const createS3BucketPermission = (bucketArn: string) =>
    JSON.stringify({
      Version: "2012-10-17",
      Statement: [
        {
          Sid: "PublicReadGetObject",
          Effect: "Allow",
          Principal: "*",
          Action: "s3:GetObject",
          Resource: `arn:aws:s3:::${bucketArn}/*`,
        },
      ],
    });

  const searchRoute53Domain = async (domain: Domain) => {
    const zones = await route53
      .listHostedZones({})
      .then((res) => res.HostedZones || []);
    return zones.find((zone) => zone.Name === `${domain.baseDomain}.`);
  };

  const getCertificate = async ({
    fqdn,
    baseDomain,
  }: Domain): Promise<string> => {
    let certificate: CertificateSummary | undefined = undefined;
    let queryNext:
      | undefined
      | (() => Promise<ListCertificatesCommandOutput>) = () =>
      acm.listCertificates({});
    while (!certificate && queryNext) {
      const { CertificateSummaryList, NextToken } = await queryNext();
      certificate = CertificateSummaryList?.find(
        (e) =>
          e.DomainName === fqdn ||
          e.DomainName === `*.${baseDomain}` ||
          (e.SubjectAlternativeNameSummaries &&
            e.SubjectAlternativeNameSummaries.indexOf(fqdn) !== -1)
      );

      if (NextToken)
        queryNext = (): Promise<ListCertificatesCommandOutput> =>
          acm.listCertificates({ NextToken });
      else queryNext = undefined;
    }

    if (certificate) {
      if (!certificate.CertificateArn)
        throw new Error("Certificate somehow doesn't have an ARN");
      return certificate.CertificateArn;
    }

    console.log("Creating new ACM certificate");
    const certificateCreateResult = await acm.requestCertificate({
      SubjectAlternativeNames: [],
      DomainName: fqdn,
      DomainValidationOptions: [{ DomainName: fqdn, ValidationDomain: fqdn }],
      ValidationMethod: "DNS",
    });
    if (!certificateCreateResult.CertificateArn)
      throw new Error("Certificate somehow doesn't have an ARN");
    return certificateCreateResult.CertificateArn;
  };

  const createBucket = async ({
    fqdn,
  }: Domain): Promise<{ bucketName: string; bucketArn: string }> => {
    const bucketName = fqdn;
    const bucketArn = `arn:aws:s3:::${bucketName}`;

    try {
      await s3.createBucket({ Bucket: fqdn });
    } catch (error) {
      if (
        !(
          error instanceof Error &&
          "Code" in error &&
          typeof error.Code === "string"
        )
      )
        throw error;
      if (error.Code === "BucketAlreadyOwnedByYou")
        throw new Error("Bucket already exists, clear it?");
      // TODO proper handle (also policy)
      else if (error.Code === "BucketAlreadyExists")
        throw new Error(
          "Bucket owned by different account - search other names?"
        );
    }

    await s3.putBucketPolicy({
      Bucket: bucketName,
      Policy: createS3BucketPermission(bucketArn),
    });

    return { bucketName, bucketArn };
  };

  const createCloudfrontDistribution = async (
    domain: Domain,
    certificateArn: string
  ): Promise<{ id: string; domainName: string }> => {
    const Origins = {
      Quantity: 1,
      Items: [
        {
          Id: `S3-${domain.fqdn}`,
          DomainName: `${domain.fqdn}.s3.amazonaws.com`,
          S3OriginConfig: {
            OriginAccessIdentity: "",
          },
        },
      ],
    };
    const methods = ["GET", "HEAD"];
    const DefaultCacheBehavior = {
      TargetOriginId: `S3-${domain}`,
      ViewerProtocolPolicy: "redirect-to-https",
      AllowedMethods: {
        Quantity: methods.length,
        Items: methods,
        CachedMethods: {
          Quantity: methods.length,
          Items: methods,
        },
      },
      ForwardedValues: {
        QueryString: false,
        Cookies: {
          Forward: "none",
        },
      },
    };
    const ViewerCertificate: ViewerCertificate = {
      ACMCertificateArn: certificateArn,
      SSLSupportMethod: "sni-only",
    };
    const DistributionConfig: DistributionConfig = {
      Enabled: true,
      DefaultRootObject: "index.html",
      Comment: domain.fqdn,
      CallerReference: `${Date.now()}`,
      Origins,
      DefaultCacheBehavior,
      ViewerCertificate,
    };
    const createDistributionResult = await cloudfront.createDistribution({
      DistributionConfig,
    });
    const distribution = createDistributionResult.Distribution;
    if (distribution && distribution.Id && distribution.DomainName)
      return { id: distribution.Id, domainName: distribution.DomainName };
    throw new Error("Distribution couldn't be created");
  };

  const listRoute53RecordSet = async (hostedZone: HostedZone) => {
    const records: ResourceRecordSet[] = [];
    let hasMore = true;
    let nextRecordName: string | undefined;
    while (hasMore) {
      const recordSets = await route53.listResourceRecordSets({
        HostedZoneId: hostedZone.Id,
        ...(nextRecordName && { StartRecordName: nextRecordName }),
      });
      if (recordSets.ResourceRecordSets)
        records.push(...recordSets.ResourceRecordSets);
      nextRecordName = recordSets.NextRecordName;
      hasMore = recordSets.IsTruncated || false;
    }
    return records;
  };

  const createRoute53Record = async (
    hostedZone: HostedZone,
    cloudfront: { id: string; domainName: string },
    domain: Domain
  ) => {
    const records = await listRoute53RecordSet(hostedZone);
    if (records.find((record) => record.Name === `${domain.fqdn}.`))
      // TODO confirm changes should be overridden

      await route53.changeResourceRecordSets({
        HostedZoneId: hostedZone.Id,
        ChangeBatch: {
          Changes: [
            {
              Action: "UPSERT", // TODO
              ResourceRecordSet: {
                Name: domain.fqdn,
                Type: "A",
                AliasTarget: {
                  HostedZoneId: cloudfront.id,
                  DNSName: cloudfront.domainName,
                  EvaluateTargetHealth: false,
                },
              },
            },
          ],
          Comment: "Programmatically created by create-aws-website",
        },
      });
    // TODO
  };

  return {
    searchRoute53Domain,
    createBucket,
    getCertificate,
    createCloudfrontDistribution,
    createRoute53Record,
  };
};

export const createAwsInfrastructure = async (
  domain: Domain,
  region: AwsRegion,
  awsCredentials: AwsCredentialIdentity
) => {
  const {
    searchRoute53Domain,
    createBucket,
    getCertificate,
    createCloudfrontDistribution,
    createRoute53Record,
  } = createSetupFunctions(region, awsCredentials);
  let hostedZone = await searchRoute53Domain(domain);
  if (!hostedZone) {
    console.log(
      "You don't own that domain - buy it here https://us-east-1.console.aws.amazon.com/route53/home#DomainRegistration:"
    );
    process.exit(-1);
  }

  const bucket = await createBucket(domain);
  const certificateArn = await getCertificate(domain);
  const cloudfront = await createCloudfrontDistribution(domain, certificateArn);
  await createRoute53Record(hostedZone, cloudfront, domain);
  return {
    bucketName: bucket.bucketName,
    cloudfrontId: cloudfront.id,
  };
};
