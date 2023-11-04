import type { AwsCredentialIdentity } from "@aws-sdk/types/dist-types/identity";
import fs from "fs/promises";
import { prompt } from "./index.js";
import { exec } from "child_process";

const createSourceDir = async (dirPath: string) => {
  const existsType: "DIR" | "FILE" | "NONE" = await fs.stat(dirPath).then(
    (r) => (r.isDirectory() ? "DIR" : "FILE"),
    () => "NONE"
  );
  if (existsType === "DIR") {
    let shouldRemove;
    while (shouldRemove !== "y" && shouldRemove !== "n")
      shouldRemove = await prompt(
        "Directory already exists, do you want to delete it? (y/n)",
        true
      );
    if (shouldRemove === "n") process.exit(0);
    await fs.rm(dirPath, { recursive: true });
  } else if (existsType === "FILE") {
    let shouldRemove;
    while (shouldRemove !== "y" && shouldRemove !== "n")
      shouldRemove = await prompt(
        "File already exists, do you want to delete it? (y/n)",
        true
      );
    if (shouldRemove === "n") process.exit(0);
    await fs.rm(dirPath);
  }
  await fs.mkdir(dirPath);
};

const createDotEnv = async (
  dirPath: string,
  credentials: AwsCredentialIdentity
) => {
  const file = `AWS_ACCESS_KEY_ID="${credentials.accessKeyId}"
AWS_SECRET_ACCESS_KEY="${credentials.secretAccessKey}"
AWS_SESSION_TOKEN="${credentials.sessionToken}"`;
  await fs.writeFile(dirPath + ".env", file);
};

const createConfigFile = async (
  dirPath: string,
  config: { subpath: string; bucketName: string; cloudfrontId: string }
) => {
  let configFile = await fs.readFile("./defaultConfig.yaml", "utf-8");
  configFile = configFile.replace(/{{SUBPATH}}/g, config.subpath);
  configFile = configFile.replace(/{{BUCKET_NAME}}/g, config.bucketName);
  configFile = configFile.replace(/{{CLOUDFRONT_ID}}/g, config.cloudfrontId);
  await fs.writeFile(dirPath + "aws-website-config.yaml", configFile);
};

const createGitIgnore = async (dirPath: string) => {
  const file = `node_modules
.env`;
  fs.writeFile(dirPath + ".gitignore", file);
};

const createPackageJson = async (dirPath: string, bucketName: string) => {
  const file = `{
  "name": "${bucketName}",
  "version": "1.0.0",
  "description": "An AWS hosted website",
  "main": "index.js",
  "scripts": {
    "dev": "pnpm run serve",
    "publish": "pnpm run build && pnpm run s3-publish",
    "build": "pnpm run build-prod"
  },
  "dependencies": {
    "aws-website": "^1.0.0",
    "dotenv": "^16.0.3",
  }
}`;
  await fs.writeFile(dirPath + "package.json", file);
};

const execute = async (command: string) =>
  new Promise((resolve, reject) =>
    exec(command, (err, stdout) => (err ? reject(err) : resolve(stdout)))
  );

export const createProject = async (
  name: string,
  config: { subpath: string; bucketName: string; cloudfrontId: string },
  credentials: AwsCredentialIdentity
) => {
  const dirPath = `./${name}/`;

  await createSourceDir(dirPath);
  createDotEnv(dirPath, credentials);
  createConfigFile(dirPath, config);
  createGitIgnore(dirPath);
  await createPackageJson(dirPath, config.bucketName);
  const hasYarn = await execute("yarn --version").then(
    () => true,
    () => false
  );
  const hasPnpm = await execute("pnpm --version").then(
    () => true,
    () => false
  );
  const packageManager = hasYarn ? "yarn" : hasPnpm ? "pnpm" : "npm";
  await execute(packageManager + " install");
  await execute("git init").catch(() =>
    console.error("GIT repository not initialized")
  );
  await fs.mkdir(dirPath + "src");
};

execute("pnpm --version").then(console.log, console.error);
