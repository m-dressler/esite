#!/usr/bin/env node
import fs from "fs/promises";
import { Config, RunFunction, BuildConfig } from "./config.js";
import { build } from "./build.js";
import type { Configuration } from "./config.js";
import { DeployFunction } from "./config.js";
export type { Config, Configuration, RunFunction, BuildConfig };

// If a esite module set this env var we execute it, not the standard logic
if (process.env.ESITE_EXEC_MODULE) {
  const moduleName = process.env.ESITE_EXEC_MODULE;
  const module = await import("@esite/" + moduleName).catch(() => {
    console.error(
      `Invalid env ESITE_EXEC_MODULE @esite/${moduleName} not installed`
    );
  });
  if (module && "run" in module) (module.run as RunFunction)({ Config, build });
  else {
    console.error(
      `Invalid env ESITE_EXEC_MODULE module @esite/${moduleName} has no export "run"`
    );
  }
}
// If there's no exec module run the standard logic
else {
  try {
    await build("prod");
  } catch (err) {
    console.error("Build failed:");
    if (err instanceof Error) console.error(err.message);
    else if (Array.isArray(err))
      err.forEach((error) =>
        console.error(error instanceof Error ? error.message : error)
      );
    else console.error(err);
    process.exit(-1);
  }

  console.log("Build successful");

  if (Config.Deploy === "NONE")
    console.log("Skipping deploy as none specified");
  else {
    const deployModule = "@esite/deploy-" + Config.Deploy;
    const deployer = await import(deployModule).catch(() => {
      console.error(
        `Deploy setting in esite.yaml. ${deployModule} not installed`
      );
      process.exit(-1);
    });
    if (!(deployer && "deploy" in deployer)) {
      console.error(
        `Invalid Deploy module ${deployModule} has no export "deploy"`
      );
      process.exit(-1);
    }

    const deploy = deployer.deploy as DeployFunction;

    const directoryFiles = await fs.readdir(Config.BuildPath, {
      recursive: true,
      encoding: "utf-8",
    });

    const toFilteredFullPaths = async (dirPath: string) => {
      if (dirPath.endsWith("/.DS_Store")) return [];
      const path = Config.BuildPath + dirPath;
      const { isDirectory } = await fs.stat(path);
      if (isDirectory()) return [];
      return [path];
    };
    const files = await Promise.all(directoryFiles.map(toFilteredFullPaths));
    deploy(files.flat(), { Config });
  }
}
