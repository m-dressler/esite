import "dotenv/config";
import { S3 } from "@aws-sdk/client-s3";
import mime from "mime";
import fs from "fs";
import { CloudFront } from "@aws-sdk/client-cloudfront";

const AwsCredentials = (() => {
  const { AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY } = process.env;

  if (AWS_ACCESS_KEY_ID && AWS_SECRET_ACCESS_KEY)
    return {
      accessKeyId: AWS_ACCESS_KEY_ID,
      secretAccessKey: AWS_SECRET_ACCESS_KEY,
    } as const;

  console.error(
    "Missing environment variables AWS_ACCESS_KEY_ID and/or AWS_SECRET_ACCESS_KEY"
  );
  process.exit(-1);
})();

export const CustomConfig = {
  BucketName: {
    optional: false,
  },
  BucketRegion: {
    optional: false,
  },
  CloudfrontId: {
    optional: true,
    default: "__NONE__",
    parser: (str) => {
      if (str !== "__NONE__") return str;
      // Warns about using S3 w/o cloudfront
      console.warn(
        "It's highly recommended to use a CloudFront distribution to serve your website"
      );
      return "";
    },
  },
  BucketPath: {
    optional: true,
    default: "",
    parser: (str: string) => {
      // Guarantees doesn't start with a slash
      while (str.startsWith("/")) str = str.substring(1);
      // Guarantees ends with a slash if not empty
      if (str !== "" && !str.endsWith("/")) str += "/";
      return str;
    },
  },
} satisfies Configuration;

export const deploy: DeployFunction<typeof CustomConfig> = async (
  files,
  { Config }
) => {
  const trace = process.argv.includes("--trace");

  const s3Client = new S3({
    region: Config.BucketRegion,
    credentials: AwsCredentials,
  });

  const uploadFile = async (file: string) => {
    if (trace) console.log("Uploading", file);
    const contentType = mime.getType(file) || "application/octet-stream";
    const stream = fs.createReadStream(file);
    let key = file.replace(Config.BuildPath, Config.BucketPath);
    if (Config.RemoveHtmlExtension) key = key.replace(/\.html$/, "");
    return s3Client.putObject({
      Key: key,
      ContentType: contentType,
      Body: stream,
      Bucket: Config.BucketName,
    });
  };

  const invalidateCache = async () => {
    const cloudfront = new CloudFront({
      credentials: AwsCredentials,
      region: Config.BucketRegion,
    });
    await cloudfront.createInvalidation({
      DistributionId: Config.CloudfrontId,
      InvalidationBatch: {
        CallerReference: Date.now().toString(),
        Paths: {
          Quantity: 1,
          Items: ["/" + Config.BucketPath + "*"],
        },
      },
    });
  };

  const result = await Promise.allSettled(files.map(uploadFile));
  const failed = result.filter(
    (r): r is PromiseRejectedResult => r.status === "rejected"
  );
  if (failed.length) {
    console.error(
      "Deploy failed: Couldn't update the following objects:" +
        failed.map(({ reason }) => "\n\t" + reason).join("")
    );
    process.exit(-1);
  }

  console.log("Successfully deployed to Bucket");
  if (Config.CloudfrontId) {
    console.log("Invalidating Cloudflare cache");
    invalidateCache();
    console.log("Cache invalidated");
  }
};
