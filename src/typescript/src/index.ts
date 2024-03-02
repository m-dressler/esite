import fs from "fs/promises";
import { exec as execCb } from "child_process";
import { promisify } from "util";

const exec = promisify(execCb);

export const CustomConfig = {} as const satisfies Configuration;

export const buildConfig: BuildConfig<typeof CustomConfig> = {
  step: 50_000,
  devRequired: true,
  build: async (Config) => {
    const allFiles = await fs.readdir(Config.BuildPath, { recursive: true });
    const tsFiles = allFiles
      .filter((f) => f.endsWith(".ts"))
      .map((f) => Config.BuildPath + f);
    if (!tsFiles.length) return;
    await exec("tsc " + tsFiles.map((f) => `"${f}"`).join(" "));
    await Promise.all(tsFiles.map((f) => fs.rm(f)));
  },
};
