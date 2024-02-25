#!/usr/bin/env node
import readline from "readline";
import fs from "fs/promises";
import { fileURLToPath } from "url";
import path from "path";
import { exec as execCb } from "child_process";
import { promisify } from "util";

const exec = promisify(execCb);

export const abort = (reason?: "error") => {
  let message = "Aborting";
  if (reason === "error") message += " - an unexpected error occurred";
  console.error(message);
  process.exit(0);
};

const currentDir = path.dirname(fileURLToPath(import.meta.url));
const defaults = {
  "esite.yaml": `SourcePath: "./src/"
BuildPath: "./build/"
RemoveHtmlExtension: true
PreviewPort: 8080

BucketName: <MY_BUCKET>
BucketRegion: <AWS_BUCKET_REGION>
CloudfrontId: <CLOUDFRONT_ID>
`,
  "package.json": {
    name: "placeholder",
    version: "0.0.1",
    description: "Your newly created esite project",
    scripts: {
      preview: "esite-preview",
      publish: "esite-core",
    },
    dependencies: {
      "@esite/core": "0.0.0",
      "@esite/preview": "0.0.0",
      "@esite/minify": "0.0.0",
      "@esite/deploy-s3": "0.0.0",
    },
  },
  "src/index.html": "<h1>Hello World</h1>",
  "src/error.html": "<h1>Oh no, an error occurred</h1>",
  "src/.env": "AWS_ACCESS_KEY_ID=<MISSING>\nAWS_SECRET_ACCESS_KEY=<MISSING>",
};

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

export const prompt = (query: string) =>
  new Promise<string>((resolve) => rl.question(query + "\n> ", resolve));

const projectNamePromise = prompt("Project Name");
const versionPromise = fs
  .readFile(path.resolve(currentDir, "../package.json"), "utf-8")
  .then((res) => JSON.parse(res).version as string);
const projectName = await projectNamePromise;

const projectFolder = "./" + projectName;
console.log("Setting up project", projectName, "in folder", projectFolder);
await fs.mkdir(projectFolder + "/src", { recursive: true });

const packageJson = defaults["package.json"];
packageJson.name = projectName;
for (const dependency in packageJson.dependencies) {
  packageJson.dependencies[
    dependency as keyof typeof packageJson.dependencies
  ] = await versionPromise;
}

const fsOperations = Object.entries(defaults).map(([path, value]) => {
  const string =
    typeof value === "string" ? value : JSON.stringify(value, null);
  fs.writeFile(projectFolder + "/" + path, string);
});
await Promise.all(fsOperations);

console.log("\nProject created successfully");
const install = await prompt("Do you want to install the dependencies? (y/n)");
if (["y", "ye", "yes", "yup"].includes(install.toLowerCase())) {
  const hasPnpm = await exec("pnpm --version").then(
    () => true,
    () => false
  );
  if (hasPnpm) {
    console.log("Installing with pnpm");
    await exec("pnpm i", { cwd: projectFolder });
  } else {
    console.log("Installing with npm");
    await exec("npm i", { cwd: projectFolder });
  }
} else {
  console.log(
    "Skipping install — install dependencies manually by running `npm i` inside the project folder"
  );
}

console.log("\n\nYour project", projectName, "is all set up!");
console.log();
console.log("Run `npm run preview` to start a development server locally");
console.log("And `npm run publish` to upload your project to the cloud");
console.log();
console.log(
  "Make sure you configure `esite.yaml` and `.env` correctly for your project"
);

process.exit(0);
