#!/usr/bin/env node
import "dotenv/config";
import { PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import mime from "mime";
import fs from "fs";
import yaml from "yaml";
import { CloudFront } from "@aws-sdk/client-cloudfront";

const terminate = (message: string) => {
  console.error(message);
  process.exit(1);
};

const { AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY } = process.env;

if (!(AWS_ACCESS_KEY_ID && AWS_SECRET_ACCESS_KEY))
  throw terminate(
    "Missing environment variables AWS_ACCESS_KEY_ID and/or AWS_SECRET_ACCESS_KEY"
  );

const credentials = {
  accessKeyId: AWS_ACCESS_KEY_ID,
  secretAccessKey: AWS_SECRET_ACCESS_KEY,
};

// Load config from aws-website-config.yaml
const config = (() => {
  let configString: string;
  try {
    configString = fs.readFileSync("aws-website-config.yaml", {
      encoding: "utf-8",
    });
  } catch (error) {
    throw terminate("Could not read aws-website-config.yaml");
  }

  const unsafeConfig = yaml.parse(configString);
  const configValidator = {
    BucketName: {
      optional: false,
    },
    BucketRegion: {
      optional: false,
    },
    CloudfrontId: {
      optional: true,
      default: "__NONE__",
    },
    BucketPath: {
      optional: true,
      default: "",
    },
    SourcePath: {
      optional: true,
      default: "./src/",
    },
    RemoveHtmlExtension: {
      optional: true,
      default: true,
    },
  } as const;

  const config = Object.fromEntries(
    Object.entries(configValidator).map(([key, expected]) => [
      key,
      expected.optional ? expected.default : "",
    ])
  ) as { -readonly [key in keyof typeof configValidator]: string };

  const alienKeys: string[] = [];

  for (const key in unsafeConfig) {
    if (key in configValidator)
      config[key as keyof typeof config] = unsafeConfig[key];
    else alienKeys.push(key);
  }

  const missingKeys = Object.entries(configValidator)
    .filter(
      ([key, { optional }]) => !optional && unsafeConfig[key] === undefined
    )
    .map(([key]) => key);

  if (alienKeys.length || missingKeys.length) {
    throw terminate(
      `Invalid aws-website-config.yaml${
        alienKeys.length
          ? "\nFound the following unknown keys: " + alienKeys.join(", ")
          : ""
      }${
        missingKeys.length
          ? "\nMissing the following keys: " + missingKeys.join(", ")
          : ""
      }`
    );
  }
  return config;
})();

if (config.CloudfrontId === "__NONE__") {
  console.warn(
    "It's highly recommended to use a CloudFront distribution to serve your website"
  );
  config.CloudfrontId = "";
}
if (config.BucketPath.startsWith("/"))
  config.BucketPath = config.BucketPath.substring(1);
if (config.SourcePath === "/") config.SourcePath = "";
if (config.BucketPath !== "" && !config.BucketPath.endsWith("/"))
  config.BucketPath = config.BucketPath += "/";
if (!config.SourcePath.endsWith("/"))
  config.SourcePath = config.SourcePath += "/";
if (!config.SourcePath.startsWith("./"))
  throw terminate("SourcePath must be a relative path in the project.");
if (typeof config.RemoveHtmlExtension !== "boolean")
  throw terminate("RemoveHtmlExtension must be a boolean");

const s3Client = new S3Client({
  region: config.BucketRegion,
  credentials,
});

const uploadFile = async (file: string) => {
  const contentType = mime.getType(file);
  if (!contentType)
    throw new Error("Could not get content type for file: " + file);
  const stream = fs.createReadStream(file);
  let key = file.replace(config.SourcePath, config.BucketPath);
  if (config.RemoveHtmlExtension) key = key.replace(/\.html$/, "");
  return s3Client.send(
    new PutObjectCommand({
      Key: key,
      ContentType: contentType,
      Body: stream,
      Bucket: config.BucketName,
    })
  );
};

const uploadDir = async (dir: string) => {
  const files = fs.readdirSync(dir);
  const promises: Promise<any>[] = [];
  for (let i = 0; i < files.length; i++) {
    const file = files[i];
    const promise = fs.promises.stat(dir + file).then(async (res) => {
      if (res.isDirectory()) await uploadDir(dir + file + "/");
      else await uploadFile(dir + file);
    });
    promises.push(promise);
  }
  const result = await Promise.allSettled(promises);
  for (let i = 0; i < result.length; i++) {
    const element = result[i];
    if (element.status === "rejected")
      console.error("Couldn't upload element:", element.reason);
  }
  return result;
};

uploadDir(config.SourcePath).then(async () => {
  if (config.CloudfrontId) {
    const cloudfront = new CloudFront({
      credentials,
      region: config.BucketRegion,
    });
    await cloudfront.createInvalidation({
      DistributionId: config.CloudfrontId,
      InvalidationBatch: {
        CallerReference: Date.now().toString(),
        Paths: {
          Quantity: 1,
          Items: ["/" + config.BucketPath + "*"],
        },
      },
    });
  }
  console.log("Uploaded");
});
