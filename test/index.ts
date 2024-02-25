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

const loadModule = async (module: string) => {
  const moduleFolder = "./test/node_modules/@esite/" + module + "/";
  // TS Build
  if (await exists(moduleFolder))
    await fs.rm(moduleFolder, { recursive: true });
  await exec("npm run build " + module, { cwd: "." });

  await fs.mkdir(moduleFolder, { recursive: true });
  await fs.cp(`./src/${module}/`, moduleFolder, { recursive: true });
};

let currentProcess: ChildProcess | null = null;

const startProcess = async () => {
  const binary = `./node_modules/@esite/${runModule}/lib/index.js`;
  await exec("chmod +x " + binary, { cwd: "./test" });
  currentProcess = spawn(binary, { cwd: "./test", stdio: "inherit" });
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
    .rm("./test/node_modules", { recursive: true })
    .catch(() => {});
  const dirs = await fs.readdir("./src", { encoding: "utf-8" });
  await clearModules;

  const modulePromises = [] as Promise<any>[];
  for (let i = 0; i < dirs.length; ++i) {
    const dir = dirs[i];
    // Filter out starter & unimplemented modules
    if (dir === "create" || !(await exists(`./src/${dir}/src/`))) continue;
    console.log("Building module", dir);
    modulePromises.push(loadModule(dir));
    fsSync
      .watch("./src/" + dir + "/src", { recursive: true })
      .addListener("change", () => rebuild(dir));
  }
  await Promise.all(modulePromises);

  await startProcess();
})();

process.on("SIGTERM", () => currentProcess?.kill());
