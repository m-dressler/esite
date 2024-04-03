import * as child_process from "child_process";
import fs from "fs";
import { minify } from "terser";
import { promisify } from "util";
import "dotenv/config";
import crypto from "crypto";

const exec = promisify(child_process.exec);

const args = process.argv.slice(2).filter((arg) => !arg.startsWith("--"));
const flags = process.argv.slice(2).filter((arg) => arg.startsWith("--"));

const abort = (reason: string) => {
  console.error(reason);
  process.exit(1);
};

const getModuleNames = () => {
  const files = fs.readdirSync("./src");
  return files.filter((f) => fs.existsSync("./src/" + f + "/package.json"));
};

const buildProject = async (projectName: string) => {
  const projectPath = `./src/${projectName}/`;
  const buildFolderName = projectPath + "lib/";

  const listFiles = (path: string, type?: string | string[]) => {
    let files = fs.readdirSync(path, {
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
    let tsconfig = fs.readFileSync("./tsconfig.json", "utf-8");
    tsconfig = tsconfig.replace("./src/core/", "../core/");
    fs.writeFileSync(projectPath + "tsconfig.json", tsconfig);

    try {
      await exec("tsc", { cwd: projectPath });
      let tscOutputFolder = projectPath + "build/";

      // Check index.js exists
      const hasIndex = await fs.promises
        .access(buildFolderName + "index.js", fs.constants.F_OK)
        .then(
          () => true,
          () => false
        );
      // Copy files from subfolder
      if (!hasIndex) {
        if (projectName !== "core") tscOutputFolder += projectName + "/src/";
        else {
          tscOutputFolder += "src/";
          await fs.promises.rm(buildFolderName, { recursive: true });
        }
        const files = listFiles(tscOutputFolder);
        for (const file of files) {
          const target = file.replace(tscOutputFolder, buildFolderName);
          fs.cpSync(file, target, {
            recursive: true,
            mode: fs.constants.COPYFILE_EXCL,
          });
        }
      }
      fs.rmSync(projectPath + "build", { recursive: true });
      fs.rmSync(projectPath + "tsconfig.json");
    } catch (error) {
      fs.rmSync(projectPath + "tsconfig.json");
      if (error && typeof error === "object" && "stdout" in error) {
        const { stdout } = error;
        console.error("The following tsc error ocurred in", projectPath);
        abort(typeof stdout === "string" ? stdout : String(stdout));
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

  await clearDirectory(buildFolderName);
  fs.cpSync(projectPath + "src", buildFolderName, { recursive: true });
  console.log(projectName + " | Compiling Typescript");
  await tsCompile();
  console.log(projectName + " | Minifying scripts");
  await minifyJs();
};

const publishProject = async (projectName: string) => {
  const projectPath = `./src/${projectName}/`;
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

  console.log(projectName + " | Publishing to npmjs.org");
  const otp = getTotp();

  let command = "pnpm publish --access public --otp " + otp;
  if (flags.includes("--no-git")) command += " --git-check false";

  const { stdout, stderr } = await exec(command, { cwd: projectPath });
  console.log(stdout, stderr);
};

const executers = {
  version: async () => {
    if (args.length !== 2)
      throw abort("Unexpected argument count, expected exactly 1 argument");
    const versions = ["major", "minor", "patch"] as const;
    const versionChange = args[1] as (typeof versions)[number];
    if (!versions.includes(versionChange))
      throw abort(
        "Invalid version provided, use one of " + versions.join(", ")
      );

    const indexJs = JSON.parse(fs.readFileSync("./package.json", "utf-8"));
    const version = indexJs.version.split(".").map(Number) as number[];
    const versionIndex = versions.indexOf(versionChange);
    version[versionIndex]++;
    for (let i = versionIndex + 1; i < version.length; ++i) version[i] = 0;
    const versionStr = version.join(".");
    indexJs.version = versionStr;
    fs.writeFileSync("./package.json", JSON.stringify(indexJs, null, 2));
    await exec("git add ./package.json");

    for (const module of getModuleNames()) {
      const path = `./src/${module}/package.json`;
      const pckg = JSON.parse(fs.readFileSync(path, "utf-8"));
      pckg.version = versionStr;
      fs.writeFileSync(path, JSON.stringify(pckg, null, 2));
      await exec("git add " + path);
    }
    await exec(`git commit -m ` + versionStr);
    await exec("git tag v" + versionStr);
  },
  build: async () => {
    if (args.length > 2)
      throw abort("Unexpected argument count, expected only 0 or 1");
    const project = args[1];
    if (project) {
      if (!fs.existsSync("./src/" + project))
        throw abort(`Cannot build project ${project} as it doesn't exist`);
      await buildProject(project);
    } else await Promise.all(getModuleNames().map(buildProject));
  },
  publish: async () => {
    await executers.build();
    await Promise.all(getModuleNames().map(publishProject));
  },
  help: () =>
    console.log(
      "Use either of ",
      Object.keys(executers).filter((k) => k !== "help")
    ),
};

const command = args[0];
const executer = executers[command as keyof typeof executers];
if (!executer) {
  const error = command
    ? `Command "${command}" does not exist`
    : "Missing a command";
  abort(`${error}. For further detail run with command "help"`);
}

Promise.resolve(executer()).catch((e: any) => {
  console.error("Unexpected exception", e);
});
