#!/usr/bin/env node
import "dotenv/config";
import { PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import mime from "mime";
import fs from "fs";
import { CloudFront } from "@aws-sdk/client-cloudfront";
import { Config } from "./parseConfig.js";
export { Config };

const s3Client = new S3Client({
  region: Config.BucketRegion,
  credentials: Config.AwsCredentials,
});

const uploadFile = async (file: string) => {
  const contentType = mime.getType(file);
  if (!contentType)
    throw new Error("Could not get content type for file: " + file);
  const stream = fs.createReadStream(file);
  let key = file.replace(Config.SourcePath, Config.BucketPath);
  if (Config.RemoveHtmlExtension) key = key.replace(/\.html$/, "");
  return s3Client.send(
    new PutObjectCommand({
      Key: key,
      ContentType: contentType,
      Body: stream,
      Bucket: Config.BucketName,
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

const invalidateCache = async () => {
  const cloudfront = new CloudFront({
    credentials: Config.AwsCredentials,
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

uploadDir(Config.SourcePath)
  .then(async () => (Config.CloudfrontId ? invalidateCache() : 0))
  .then(() => console.log("Uploaded"));
