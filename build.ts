import * as child_process from "child_process";
import fs, { readdirSync } from "fs";
import inquirer from "inquirer";
import { minify } from "terser";
import { promisify } from "util";

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
const buildFolderName = projectPath + "lib";

if (args.includes("--version")) {
  const version = args[args.indexOf("--version") + 1];
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
  return files.map((f) => projectPath + f);
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
  });
  if (!code) throw new Error("Couldn't minify " + file);
  await fs.promises.writeFile(file, code);
};

const minifyJs = async () => {
  const files = listFiles(projectPath, ["js", "cjs"]);
  await Promise.all(files.map(minifyScript));
};

await clearDirectory(buildFolderName);
await tsCompile();
await minifyJs();
if (args.includes("--publish")) {
  console.log("Publishing")
  const { stdout, stderr } = await exec("pnpm publish", { cwd: projectPath });
  console.log(stdout, stderr);
}
