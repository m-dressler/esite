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

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

export const prompt = (query: string) =>
  new Promise<string>((resolve) => rl.question(query + "\n> ", resolve));

const projectNamePromise = prompt("Project Name");
const esiteVersionPromise = fs
  .readFile(path.resolve(currentDir, "../package.json"), "utf-8")
  .then((res) => JSON.parse(res).version as string);
const projectName = await projectNamePromise;

const projectFolder = "./" + projectName;
console.log("Setting up project", projectName, "in folder", projectFolder);

// Copy scaffold to folder
await fs.cp(path.resolve(currentDir, "./scaffold/"), projectFolder, {
  recursive: true,
});

const files = await fs.readdir(projectFolder, {
  recursive: true,
  withFileTypes: true,
});
const fsOperations = files.map(async (dirent) => {
  if (!dirent.isFile()) return;

  const path = projectFolder + "/" + dirent.path;
  let content = await fs.readFile(path, "utf-8");
  content = content.replaceAll("{{PROJECT_NAME}}", projectName);
  content = content.replaceAll("{{VERSION}}", await esiteVersionPromise);
  // Just write back if normal file
  if (!(path.endsWith(".mts") || path.includes("/__dot__")))
    await fs.writeFile(path, content);
  else {
    const newPath = path.replace(/\.mts$/, ".ts").replace("/__dot__", "/.");
    await Promise.all([fs.rm(path), fs.writeFile(newPath, content)]);
  }
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
