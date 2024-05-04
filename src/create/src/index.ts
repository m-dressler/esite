#!/usr/bin/env node
import inquirer from "inquirer";
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

const commandWorks = (command: string) =>
  exec(command).then(
    () => true,
    () => false
  );

const currentDir = path.dirname(fileURLToPath(import.meta.url));
const packageManager = await commandWorks("pnpm --version").then((hasPnpm) =>
  hasPnpm ? "pnpm" : "npm"
);

const projectNamePromise = inquirer.prompt<{ projectName: string }>({
  type: "input",
  name: "projectName",
  message: "Project Name",
});
const esiteVersionPromise = fs
  .readFile(path.resolve(currentDir, "../package.json"), "utf-8")
  .then((res) => JSON.parse(res).version as string);
const { projectName } = await projectNamePromise;

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

  const filePath = path.resolve(dirent.path, dirent.name);
  let content = await fs.readFile(filePath, "utf-8");
  content = content.replaceAll("{{PROJECT_NAME}}", projectName);
  content = content.replaceAll("{{VERSION}}", await esiteVersionPromise);
  // Just write back if normal file
  if (!(dirent.name.endsWith(".mts") || dirent.name.startsWith("__dot__")))
    await fs.writeFile(filePath, content);
  else {
    const newName = dirent.name
      .replace(/\.mts$/, ".ts")
      .replace(/^__dot__/, ".");
    const newPath = path.resolve(dirent.path, newName);
    await Promise.all([fs.rm(filePath), fs.writeFile(newPath, content)]);
  }
});
await Promise.all(fsOperations);

console.log("\nProject created successfully");

// If typescript isn't installed, offer to install globally
if (!(await commandWorks("tsc --version"))) {
  console.log("Installing typescript globally with " + packageManager);
  await exec(packageManager + " i -g typescript", { cwd: projectFolder });
}

const { install } = await inquirer.prompt({
  type: "confirm",
  name: "install",
  message: "Do you want to install the dependencies?",
});
if (install) {
  console.log("Installing dependencies with " + packageManager);
  await exec(packageManager + " i", { cwd: projectFolder });
} else {
  console.log(
    "Skipping install — install dependencies manually by running `npm i` inside the project folder"
  );
}

console.log("\n\nYour project", projectName, "is all set up!");
console.log();
console.log(
  `Run \`${packageManager} run preview\` to start a development server locally`
);
console.log(
  `And \`${packageManager} run publish\` to upload your project to the cloud`
);
console.log();
console.log(
  "Make sure you configure `esite.yaml` and `.env` correctly for your project"
);

process.exit(0);
