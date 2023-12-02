import * as fsSync from "fs";
import { promises as fs } from "fs";
import { spawn, exec as execCb, ChildProcess } from "child_process";
import { promisify } from "util";
const exec = promisify(execCb);

const runModule = "preview";

const exists = (path: string) =>
  fs.stat(path).then(
    () => true,
    () => false
  );

const packageJson = {
  name: "debug",
  version: "0.0.0",
  type: "module",
  dependencies: {} as { [key: string]: string },
};

const loadModule = async (module: string) => {
  const moduleFolder = "./.debug/node_modules/@awsw/" + module + "/";
  // TS Build
  if (await exists(moduleFolder))
    await fs.rm(moduleFolder, { recursive: true });
  await exec("npm run build -- --project " + module, { cwd: "." });

  await fs.mkdir(moduleFolder, { recursive: true });
  const copy = fs.cp(`./${module}/`, moduleFolder, { recursive: true });

  const packageStr = await fs.readFile(`./${module}/package.json`, "utf-8");
  const pckg = JSON.parse(packageStr);
  packageJson.dependencies["@awsw/" + module] = pckg.version;
  await copy;
};

let currentProcess: ChildProcess | null = null;

const startProcess = async () => {
  const binary = `./node_modules/@awsw/${runModule}/lib/index.js`;
  await exec("chmod +x " + binary, { cwd: "./.debug" });
  currentProcess = spawn(binary, { cwd: "./.debug", stdio: "inherit" });
  await new Promise((res) => currentProcess?.on("exit", res));
};

let rebuildId = Number.MIN_SAFE_INTEGER;
let rebuilds: { [key: string]: Promise<any>[] } = {};
const rebuild = (module: string) => {
  if (currentProcess && !currentProcess.killed) currentProcess.kill();
  const builds = (rebuilds[module] = rebuilds[module] || []);
  const previousBuild = builds.length > 0 ? builds[builds.length - 1] : null;
  const id = rebuildId + 1;
  rebuildId = id;
  const promise = new Promise(async (res) => {
    if (previousBuild) await previousBuild;
    console.log("Rebuilding", module);
    await loadModule(module);
    console.log("Rebuilt", module);
    builds.splice(builds.indexOf(promise), 1);
    // Only restart if we're the latest build
    if (rebuildId === id) startProcess();
    res(0);
  });
  builds.push(promise);
};

(async () => {
  const clearModules = fs
    .rm("./.debug/node_modules", { recursive: true })
    .catch(() => {});
  const dirs = await fs.readdir(".", { encoding: "utf-8" });
  await clearModules;

  const modulePromises = [] as Promise<any>[];
  for (let i = 0; i < dirs.length; ++i) {
    const dir = dirs[i];
    // Filter any files (with .), starter
    if (dir.includes(".") || dir === "starter") continue;
    // Filter out unimplemented modules
    if (!(await exists(`./${dir}/src/`))) continue;
    console.log("Building module", dir);
    modulePromises.push(loadModule(dir));
    fsSync
      .watch("./" + dir + "/src", { recursive: true })
      .addListener("change", () => rebuild(dir));
  }
  await Promise.all(modulePromises);

  // await fs.writeFile(
  //   "./.debug/package.json",
  //   JSON.stringify(packageJson, null, 2)
  // );
  await startProcess();
})();

process.on("SIGTERM", () => currentProcess?.kill());
