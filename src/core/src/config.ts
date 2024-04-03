import fs from "fs/promises";
import yaml from "yaml";
import { addBuildSteps } from "./build.js";
import { Types } from "./types.js";
import { terminate } from "./util.js";
import log from "loglevel";

export type CoreConfigValidator = typeof configValidator;

const configFile = "esite.yaml";

const validateLocalPath = (str: string) => {
  // Guarantees ends with a slash
  if (!str.endsWith("/")) str += "/";
  // Guarantees is relative
  if (!str.startsWith("./"))
    throw {
      expected: 'a relative in the project (start with "./")',
    };
  return str;
};

const configValidator = {
  SourcePath: {
    optional: true,
    default: "./src",
    parser: validateLocalPath,
  },
  BuildPath: {
    optional: true,
    default: "./build",
    parser: validateLocalPath,
  },
  RemoveHtmlExtension: {
    optional: true,
    type: "boolean",
    default: true,
  },
  Modules: {
    optional: false,
    type: "string[]",
  },
} as const satisfies Configuration;

const loadOtherModules = async () => {
  let moduleNames = await fs.readdir("./node_modules/@esite/");
  moduleNames = moduleNames.filter(
    (name) => !name.startsWith(".") && name !== "core"
  );
  let hadErrors = false;
  /** The build steps loaded from @esite/* modules */
  const loadedBuildSteps: BuildConfig[] = [];

  for (let i = 0; i < moduleNames.length; ++i) {
    const moduleName = moduleNames[i];
    const module = await import("@esite/" + moduleName).catch(() => {
      log.error(`Couldn't load module @esite/${moduleName} not installed`);
      hadErrors = true;
    });
    if (!module) continue;
    if ("buildConfig" in module) loadedBuildSteps.push(module.buildConfig);
    if ("CustomConfig" in module)
      Object.assign(configValidator, module.CustomConfig);
    else {
      log.error(
        `Invalid module @esite/${moduleName} has no export "CustomConfig"`
      );
      hadErrors = true;
    }
  }

  addBuildSteps(...loadedBuildSteps);
  if (hadErrors) terminate();

  return moduleNames;
};

const loadConfigFile = async (): Promise<{ [key: string]: string }> => {
  const configString = await fs
    .readFile(configFile, {
      encoding: "utf-8",
    })
    .catch(() => {
      throw terminate("Could not read " + configFile);
    });
  const config = yaml.parse(configString);
  if (!(config && typeof config === "object"))
    terminate(`${configFile} must be a valid key-value object`);

  config.Modules = await loadOtherModules();
  return config;
};

const isOfType = <T extends Types>(value: unknown, type: T): value is any => {
  if (type.endsWith("[]")) {
    const innerType = type.substring(0, type.length - 2) as Types;
    return (
      Array.isArray(value) && value.every((entry) => isOfType(entry, innerType))
    );
  } else return typeof value === type;
};

const validateConfig = (unsafeConfig: {
  [key: string]: any;
}): BaseConfiguration => {
  type ConfigurationValidators = keyof typeof configValidator;
  const configKeys = Object.keys(configValidator) as ConfigurationValidators[];
  const alienKeys = Object.keys(unsafeConfig).filter(
    (key) => !configKeys.includes(key as any)
  );
  const missingKeys: ConfigurationValidators[] = [];
  const invalidKeys: {
    key: ConfigurationValidators;
    expected: string;
    value: any;
  }[] = [];

  type Writeable<T> = { -readonly [P in keyof T]: T[P] };
  const config: Partial<Writeable<BaseConfiguration>> = {};
  for (let i = 0; i < configKeys.length; ++i) {
    const key = configKeys[i];
    const validator = configValidator[key];
    let value = unsafeConfig[key];
    if (!value) {
      if (validator.optional) value = validator.default;
      else {
        missingKeys.push(key);
        continue;
      }
    }
    const type = "type" in validator ? validator.type : "string";
    if (isOfType(value, type)) {
      if ("parser" in validator) {
        try {
          config[key] = validator.parser(value) as any;
        } catch (err) {
          if (
            err &&
            typeof err === "object" &&
            "expected" in err &&
            typeof err.expected === "string"
          )
            invalidKeys.push({ key, expected: err.expected, value });
          else throw err;
        }
      } else config[key] = value;
    } else invalidKeys.push({ key, expected: "of type " + type, value });
  }

  if (missingKeys.length | invalidKeys.length) {
    log.error(`Invalid ${configFile}:`);
    if (missingKeys.length) log.error("Missing keys:", missingKeys);
    if (invalidKeys.length) {
      log.error("Invalid keys:");
      for (const { key, expected, value } of invalidKeys)
        log.error(`\t- "${key}" should be ${expected} but got "${value}"`);
    }
    terminate();
  }
  if (alienKeys.length) log.warn(`Unknown keys in ${configFile}:`, alienKeys);
  return config as BaseConfiguration;
};

const unsafeConfig = await loadConfigFile();
export const Config = validateConfig(unsafeConfig);
