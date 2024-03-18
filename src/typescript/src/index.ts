import fs from "fs/promises";
import { exec as execCb } from "child_process";
import { promisify } from "util";

const exec = promisify(execCb);

export const CustomConfig = {} as const satisfies Configuration;

const listTsFiles = async (path: string) => {
  const allFiles = await fs.readdir(path, { recursive: true });
  return allFiles.filter((f) => f.endsWith(".ts")).map((f) => path + f);
};

export const buildConfig: BuildConfig<typeof CustomConfig> = {
  step: 50_000,
  devRequired: true,
  build: async (Config) => {
    await fs
      .copyFile("./tsconfig.json", Config.BuildPath + "tsconfig.json")
      // If file doesn't exist ignore and compile with default options 
      .catch(() => {});

    const tsFilesPromise = listTsFiles(Config.BuildPath);
    await exec("tsc", { cwd: Config.BuildPath });
    
    // Delete all the ts files from build
    const tsFiles = await tsFilesPromise;
    await Promise.all(tsFiles.map((f) => fs.rm(f)));

    // Delete tsconfig.json if present
    await fs.rm(Config.BuildPath + "tsconfig.json").catch(() => {});
  },
};
