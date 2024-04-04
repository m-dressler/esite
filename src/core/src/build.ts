import fs from "fs/promises";
import { Config } from "./config.js";
import log from "loglevel";

export type Build = typeof build;
export type LoadedBuildStep = Omit<BuildConfig, "step"> & { name: string };

/** A sorted array of individual build steps grouped by steps that can be run in parallel */
const buildSteps: LoadedBuildStep[][] = [[]];

export const addBuildSteps = (...steps: (BuildConfig & { name: string })[]) => {
  // Sort builds by build step
  steps.sort((a, b) => a.step - b.step);
  // Group builds in the same step
  for (let i = 0; i < steps.length; ++i) {
    const { step, ...other } = steps[i];
    buildSteps[buildSteps.length - 1].push(other);
    if (i !== steps.length - 1 && step !== steps[i + 1].step)
      buildSteps.push([]);
  }
};

const runBuildSteps = async (
  steps: LoadedBuildStep[],
  type: "dev" | "prod",
  config: BaseConfiguration
) => {
  // If we are building for dev but it's not required, skip
  if (type === "dev") steps = steps.filter((s) => s.devRequired);
  log.debug(
    "Running build step(s)",
    steps.map((s) => s.name)
  );
  // Skip immediately if not necessary
  if (steps.length === 0) return;

  // Run all steps in parallel and wait for result
  const result = await Promise.allSettled(
    steps.map((step) => step.build(config, { log }))
  );
  log.debug("Build step(s) complete");
  const failed = result.filter(
    (res) => res.status === "rejected"
  ) as PromiseRejectedResult[];
  if (failed.length > 0) log.debug(failed.length, "build steps failed");
  // If step failed abort build
  if (failed.length === 1) throw failed[0].reason;
  else if (failed.length > 0) throw failed.map((f) => f.reason);
};

const exists = async (path: string) =>
  fs.access(path, fs.constants.F_OK).then(
    () => true,
    () => false
  );

export const build = async (type: "dev" | "prod") => {
  log.debug("Ensuring build folder exists");
  if (!(await exists(Config.BuildPath)))
    await fs.mkdir(Config.BuildPath, { recursive: true });

  // Clear build directory
  log.debug("Clearing build folder");
  const files = await fs.readdir(Config.BuildPath);
  await Promise.all(
    files.map((file) =>
      fs.rm(Config.BuildPath + "/" + file, { recursive: true })
    )
  );

  // Copy all files to build
  log.debug("Copying files from source to build");
  await fs.cp(Config.SourcePath, Config.BuildPath, { recursive: true });

  log.debug("Running", buildSteps.length, "build steps");
  for (let i = 0; i < buildSteps.length; ++i)
    await runBuildSteps(buildSteps[i], type, Config);
};
