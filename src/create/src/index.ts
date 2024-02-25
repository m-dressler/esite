#!/usr/bin/env node
import type { AwsRegion, Domain } from "./aws.js";
import readline from "readline";
import psl from "psl";
import { AWS_REGIONS, createAwsInfrastructure } from "./aws.js";
import { createProject } from "./createProject.js";
import type { AwsCredentialIdentity } from "@aws-sdk/types/dist-types/identity";

export const abort = (reason?: "error") => {
  let message = "Aborting";
  if (reason === "error") message += " - an unexpected error occured";
  console.error(message);
  process.exit(0);
};

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});
export const prompt = (query: string, lowerTrim: boolean): Promise<string> =>
  new Promise((resolve: (res: string) => void) =>
    rl.question(query, (res: string) =>
      resolve(lowerTrim ? res.trim().toLowerCase() : res)
    )
  );

const startPrompting = async () => {
  let region: undefined | AwsRegion;
  let website: import("psl").ParsedDomain = {
    tld: null,
    sld: null,
    domain: null,
    subdomain: null,
    listed: false,
    input: "",
    error: undefined,
  };
  let subpath: string | undefined;
  let awsAccessKeyId: string | undefined;
  let awsSecretAccessKey: string | undefined;
  let awsSessionToken: string | undefined;
  while (!region) {
    const input =
      (await prompt("AWS Region [eu-west-1]: ", true)) || "eu-west-1";
    if (AWS_REGIONS.indexOf(input as AwsRegion) !== -1)
      region = input as AwsRegion;
  }
  while (!(website.domain && website.subdomain && website.tld)) {
    let input = await prompt("Website name (e.g. hello.mysite.com): ", true);
    const res = psl.parse(input);
    if (!res.error) website = res;
  }
  while (subpath === undefined)
    awsAccessKeyId = (await prompt("Folder [NONE]: ", true)) || "";
  while (!awsAccessKeyId)
    awsAccessKeyId = await prompt("AWS Access Key ID: ", true);
  while (!awsSecretAccessKey)
    awsSecretAccessKey = await prompt("AWS Secret Access Key: ", true);
  while (awsSessionToken === undefined)
    awsSessionToken = (await prompt("AWS Session Token [NONE]: ", true)) || "";
  if (awsSessionToken === "") awsSessionToken = undefined;

  const awsCredentials: AwsCredentialIdentity = {
    accessKeyId: awsAccessKeyId,
    secretAccessKey: awsSecretAccessKey,
    ...(awsSessionToken && { sessionToken: awsSessionToken }),
  };

  const domain: Domain = {
    fqdn: website.input,
    subdomain: website.subdomain,
    baseDomain: website.domain,
    tld: website.tld,
  };
  const awsResult = await createAwsInfrastructure(
    domain,
    region,
    awsCredentials
  );

  const config = Object.assign(awsResult, { subpath });
  await createProject(website.domain, config, awsCredentials);

  console.log("Successfully created website");

  rl.close();
};

startPrompting()
  .catch((e) => console.error("Unable to prompt", e))
  .then(rl.close);
rl.on("close", () => process.exit(0));
