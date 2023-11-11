import * as child_process from "child_process";
import fs, { readdirSync } from "fs";
import inquirer from "inquirer";
import { minify } from "terser";
import { promisify } from "util";
import "dotenv/config";
import crypto from "crypto";

const exec = promisify(child_process.exec);

const args = process.argv.slice(2);
const projectIndex = args.indexOf("--project");
let project = projectIndex ? void 0 : args[projectIndex + 1];
if (!project) {
  console.log("Select project:");
  const files = await fs.promises.readdir(".");
  const projects = files.filter(
    (f) => f !== "node_modules" && !f.includes(".")
  );
  const result = (await inquirer.prompt({
    type: "list",
    name: "project",
    message: "Select a project to build:",
    choices: projects,
  })) as { project: (typeof projects)[number] };
  project = result.project;
}

const projectPath = `./${project}/`;
const buildFolderName = projectPath + "lib/";

if (args.includes("--version")) {
  let version = args[args.indexOf("--version") + 1];
  const versions = ["patch", "minor", "major"];
  if (!versions.includes(version))
    version = await inquirer
      .prompt({
        type: "list",
        name: "version",
        message: "Select a version:",
        choices: versions,
      })
      .then((res) => res.version);
  const { stdout } = await exec("pnpm version " + version, {
    cwd: projectPath,
  });
  console.log(stdout);
  process.exit(0);
}

if (!(args.includes("--build") || args.includes("--publish"))) {
  console.error(
    "No action defined, did you forget adding '--build' or '--publish'?"
  );
  process.exit(1);
}

const listFiles = (path: string, type?: string | string[]) => {
  let files = readdirSync(path, {
    recursive: true,
    encoding: "utf-8",
  });
  if (type) {
    const options =
      typeof type === "string" ? ["." + type] : type.map((t) => "." + t);
    files = files.filter((f) => options.some((o) => f.endsWith(o)));
  }
  return files.map((f) => path + f);
};

/**
 * @param {string} path
 */
const clearDirectory = async (path: string) => {
  await fs.promises
    .access(path, fs.constants.F_OK)
    .catch(() => fs.mkdirSync(path));
  const files = fs.readdirSync(path);

  const removals: Promise<void>[] = [];
  for (const file of files)
    removals.push(
      fs.promises.rm(`${path}/${file}`, { recursive: true, force: true })
    );
  await Promise.all(removals);
};

const tsCompile = async () => {
  fs.copyFileSync("./tsconfig.json", projectPath + "tsconfig.json");
  try {
    await exec("tsc", { cwd: projectPath });

    // Check index.js exists
    await fs.promises
      .access(buildFolderName + "/index.js", fs.constants.F_OK)
      .catch(async () => {
        // If it doesn't exist, try to extract folder
        const moduleFolder = `${buildFolderName}${project}/src/`;
        const tempFolder = `${projectPath}temp/`;
        const folderExists = await fs.promises
          .access(moduleFolder, fs.constants.F_OK)
          .then(
            () => true,
            () => false
          );
        fs.rmSync(tempFolder, { recursive: true, force: true });
        fs.renameSync(moduleFolder, tempFolder);
        fs.rmSync(buildFolderName, { recursive: true });
        fs.renameSync(tempFolder, buildFolderName);
        if (!folderExists) throw { stdout: "Unexpected build error (TS1)" };
      });
    fs.rmSync(projectPath + "tsconfig.json");
  } catch (error) {
    fs.rmSync(projectPath + "tsconfig.json");
    if (error && typeof error === "object" && "stdout" in error) {
      console.error(error.stdout);
      process.exit(1);
    } else throw error;
  }
};

const minifyScript = async (file: string) => {
  const content = await fs.promises.readFile(file, { encoding: "utf-8" });

  let { code } = await minify(content, {
    compress: true,
    output: { comments: false },
    mangle: {
      toplevel: true,
    },
    module: true,
  });
  if (!code) throw new Error("Couldn't minify " + file);
  await fs.promises.writeFile(file, code);
};

const minifyJs = async () => {
  const files = listFiles(buildFolderName, ["js", "cjs"]);
  await Promise.all(files.map(minifyScript));
};

const getTotp = () => {
  const secret = process.env.OTP_KEY_HEX;
  if (!secret) throw new Error("Missing env-var 'OTP_KEY_HEX'");
  const counterBuffer = Buffer.alloc(8);
  counterBuffer.writeBigInt64BE(BigInt(Math.floor(Date.now() / 30_000)), 0);
  const hmac = crypto
    .createHmac("sha1", Buffer.from(secret, "hex"))
    .update(counterBuffer)
    .digest();
  const offset = hmac[hmac.length - 1] & 0x0f;
  const otpPart = hmac.readUInt32BE(offset) & 0x7fffffff;
  const otp = otpPart % Math.pow(10, 6);
  return otp.toString().padStart(6, "0");
};

await clearDirectory(buildFolderName);
console.log("Compiling Typescript");
await tsCompile();
console.log("Minifying scripts");
await minifyJs();
if (args.includes("--publish")) {
  console.log("Publishing to npmjs.org");
  const otp = getTotp();

  let command = "pnpm publish --access public --otp " + otp;
  if (args.includes("--no-git")) command += " --git-check false";

  const { stdout, stderr } = await exec(command, { cwd: projectPath });
  console.log(stdout, stderr);
}
