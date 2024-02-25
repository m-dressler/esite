import * as child_process from "child_process";
import fs, { readdirSync } from "fs";
import { minify } from "terser";
import { promisify } from "util";
import "dotenv/config";
import crypto from "crypto";

const exec = promisify(child_process.exec);

const args = process.argv.slice(2);

const getModuleNames = () => {
  const files = fs.readdirSync(".");
  return files.filter(
    (f) =>
      f !== "node_modules" &&
      !f.includes(".") &&
      fs.existsSync("./" + f + "/package.json")
  );
};

const buildProject = async (projectName: string) => {
  const projectPath = `./${projectName}/`;
  const buildFolderName = projectPath + "lib/";

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
          const moduleFolder = `${buildFolderName}${projectName}/src/`;
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

  await clearDirectory(buildFolderName);
  console.log(projectName + " | Compiling Typescript");
  await tsCompile();
  console.log(projectName + " | Minifying scripts");
  await minifyJs();
};

const publishProject = async (projectName: string) => {
  const projectPath = `./${projectName}/`;
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
  if (args.includes("--no-git")) command += " --git-check false";

  const { stdout, stderr } = await exec(command, { cwd: projectPath });
  console.log(stdout, stderr);
};

const executers = {
  version: async () => {
    if (args.length !== 2) {
      console.error("Unexpected argument count, expected only 1");
      process.exit(1);
    }
    const versions = ["major", "minor", "patch"] as const;
    const versionChange = args[1] as (typeof versions)[number];
    if (!versions.includes(versionChange)) {
      console.error("Invalid version provided, use one of", versions);
      process.exit(1);
    }
    const indexJs = JSON.parse(fs.readFileSync("./package.json", "utf-8"));
    const version = indexJs.version.split(".").map(Number) as number[];
    const versionIndex = versions.indexOf(versionChange);
    version[versionIndex]++;
    for (let i = versionIndex + 1; i < version.length; ++i) version[i] = 0;
    const versionStr = version.join(".");
    indexJs.version = versionStr;
    fs.writeFileSync("./package.json", JSON.stringify(indexJs, null, 2));

    const updateVersion = (module: string) => {
      const path = `./${module}/package.json`;
      const pckg = JSON.parse(fs.readFileSync(path, "utf-8"));
      pckg.version = versionStr;
      fs.writeFileSync(path, JSON.stringify(pckg, null, 2));
    };
    getModuleNames().forEach(updateVersion);
  },
  build: async () => {
    if (args.length > 2) {
      console.error("Unexpected argument count, expected only 0 or 1");
      process.exit(1);
    }
    const project = args[1];
    if (project) {
      if (!fs.existsSync("./" + project)) {
        console.error(`Cannot build project ${project} as it doesn't exist`);
        process.exit(1);
      }
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
  console.error(`${error}. For further detail run with command "help"`);
  process.exit(1);
}

Promise.resolve(executer()).catch((e: any) => {
  console.error("Unexpected exception", e);
});
