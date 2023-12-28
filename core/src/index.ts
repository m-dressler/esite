#!/usr/bin/env node
import "dotenv/config";
import { PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import mime from "mime";
import fs from "fs";
import { CloudFront } from "@aws-sdk/client-cloudfront";
import { Config, build, RunFunction, BuildConfig } from "./parseConfig.js";
import type { Configuration } from "./parseConfig.js";
export { Config, Configuration, RunFunction, BuildConfig };

// If a awsw module set this env var we execute it, not the standard logic
if (process.env.AWSW_EXEC_MODULE) {
  const moduleName = process.env.AWSW_EXEC_MODULE;
  const module = await import("@awsw/" + moduleName).catch(() => {
    console.error(
      `Invalid env AWSW_EXEC_MODULE @awsw/${moduleName} not installed`
    );
  });
  if (module && "run" in module) (module.run as RunFunction)({ Config, build });
  else {
    console.error(
      `Invalid env AWSW_EXEC_MODULE module @awsw/${moduleName} has no export "run"`
    );
  }
}
// If there's no exec module run the standard logic
else {
  try {
    await build("prod");
  } catch (err) {
    if (err instanceof Error) console.error(err.message);
    else console.error(err);
    process.exit(-1);
  }
  const s3Client = new S3Client({
    region: Config.BucketRegion,
    credentials: Config.AwsCredentials,
  });

  const uploadFile = async (file: string) => {
    const contentType = mime.getType(file) || "application/octet-stream";
    const stream = fs.createReadStream(file);
    let key = file.replace(Config.BuildPath, Config.BucketPath);
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
    const files = fs
      .readdirSync(dir, { recursive: true, encoding: "utf-8" })
      // Ignore non-content files
      .filter((path) => !path.endsWith("/.DS_Store"));
    const promises: Promise<any>[] = [];
    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      const promise = fs.promises.stat(dir + file).then(async (res) => {
        if (!res.isDirectory()) await uploadFile(dir + file);
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

  uploadDir(Config.BuildPath)
    .then(async () => (Config.CloudfrontId ? invalidateCache() : 0))
    .then(() => console.log("Uploaded"));
}
