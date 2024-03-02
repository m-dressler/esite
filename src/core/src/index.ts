#!/usr/bin/env node
import fs from "fs/promises";
import { Config } from "./config.js";
import { build } from "./build.js";
import { logError, terminate } from "./util.js";

const args = process.argv.slice(2);

const runModule = async () => {
  const moduleName = args[1];
  if (!moduleName)
    throw terminate(
      "Please add an executable esite module as the second argument"
    );
  const module = await import("@esite/" + moduleName).catch(() => {
    throw terminate(
      `Executable esite module @esite/${moduleName} not installed`
    );
  });
  if ("run" in module) (module.run as RunFunction)({ Config, build });
  else
    throw terminate(
      `Invalid Executable esite module @esite/${moduleName} has no export "run"`
    );
};

const deploy = async () => {
  try {
    await build("prod");
  } catch (err) {
    logError("Build failed:");
    if (err instanceof Error) logError(err.message);
    else if (Array.isArray(err))
      err.forEach((error) =>
        logError(error instanceof Error ? error.message : error)
      );
    else logError(err);
    process.exit(1);
  }

  console.log("Build successful");

  const deployModules = Config.Modules.filter((name) =>
    name.startsWith("deploy-")
  );
  if (deployModules.length === 0)
    console.log("Skipping deploy as no deploy modules installed");
  else {
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

    for (const module of deployModules) {
      const deployModule = "@esite/" + module;
      const deployer = await import(deployModule).catch(() => {
        console.error(
          `Deploy setting in esite.yaml. ${deployModule} not installed`
        );
        process.exit(1);
      });
      if (!(deployer && "deploy" in deployer)) {
        console.error(
          `Invalid Deploy module ${deployModule} has no export "deploy"`
        );
        process.exit(1);
      }

      const deploy = deployer.deploy as DeployFunction;
      console.log("Deploying to", module.replace("deploy-", ""));
      await deploy(files.flat(), { Config });
    }
  }
};

const commands = {
  deploy,
  publish: deploy,
  run: runModule,
  exec: runModule,
  help: () => {
    console.log(
      "Commands:\n\n\tdeploy: Builds for production and uploads via any deploy modules present\n\texec <MODULE>: Run a runnable esite module"
    );
  },
};

if (args.length === 0)
  terminate('Please add a command. For more information run "esite help"');

const command = commands[args[0] as keyof typeof commands];
if (!command)
  terminate(
    `Invalid command "${args[0]}". For a list of valid commands run "esite help"`
  );
command();
