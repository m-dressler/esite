import fs from "fs/promises";
import yaml from "yaml";

type Types = "string" | "boolean" | "number" | "string[]";
type TypeMapper = {
  string: string;
  number: number;
  boolean: boolean;
  "string[]": string[];
};
type ConfigurationValidator<
  T extends Types = "string",
  Type = TypeMapper[T]
> = {
  type?: T;
  parser?: (str: Type) => any;
} & ({ optional: false } | { optional: true; default: Type });
export type Configuration = {
  [key: string]:
    | ConfigurationValidator<"boolean">
    | ConfigurationValidator<"number">
    | ConfigurationValidator<"string">
    | ConfigurationValidator<"string[]">;
};
type ConfigValue<T extends Configuration> = {
  [key in keyof T]: "parser" extends keyof T[key]
    ? // @ts-expect-error
      ReturnType<T[key]["parser"]>
    : "type" extends keyof T[key]
    ? // @ts-expect-error
      TypeMapper[T[key]["type"]]
    : string;
};
export type BuildConfig<T extends Configuration = {}> = {
  /** The function that builds the step */
  build: (config: typeof Config & ConfigValue<T>) => any;
  /** Low step BuildConfigs run before high step BuildConfigs while all same step configs may be run in parallel */
  step: number;
  /** If this step is required to create the dev version of the project */
  devRequired: boolean;
};
export type RunFunction<T extends Configuration = {}> = (params: {
  Config: typeof Config & ConfigValue<T>;
  build: typeof build;
}) => any;

const configFile = "aws-website-config.yaml";

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
  BucketName: {
    optional: false,
  },
  BucketRegion: {
    optional: false,
  },
  CloudfrontId: {
    optional: true,
    default: "__NONE__",
    parser: (str) => {
      if (str !== "__NONE__") return str;
      // Warns about using S3 w/o cloudfront
      console.warn(
        "It's highly recommended to use a CloudFront distribution to serve your website"
      );
      return "";
    },
  },
  BucketPath: {
    optional: true,
    default: "",
    parser: (str: string) => {
      // Guarantees doesn't start with a slash
      while (str.startsWith("/")) str = str.substring(1);
      // Guarantees ends with a slash if not empty
      if (str !== "" && !str.endsWith("/")) str += "/";
      return str;
    },
  },
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
    optional: true,
    type: "string[]",
    default: [] as string[],
  },
} as const satisfies Configuration;

const logError = (...args: [any, ...any[]]) =>
  console.error("\x1b[31m" + args[0].toString(), ...args.slice(1), "\x1b[31m");
const terminate = (message?: string) => {
  if (message) logError(message);
  process.exit(1);
};

const getAwsCredentials = () => {
  const { AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY } = process.env;

  if (!(AWS_ACCESS_KEY_ID && AWS_SECRET_ACCESS_KEY))
    throw terminate(
      "Missing environment variables AWS_ACCESS_KEY_ID and/or AWS_SECRET_ACCESS_KEY"
    );
  return {
    accessKeyId: AWS_ACCESS_KEY_ID,
    secretAccessKey: AWS_SECRET_ACCESS_KEY,
  } as const;
};

/** A sorted array of individual build steps grouped by parallelizable steps */
const buildSteps: Omit<BuildConfig, "step">[][] = [[]];

const loadOtherModules = async (modules: string[]) => {
  let hadErrors = false;
  /** The build steps loaded from @awsw/* modules */
  const loadedBuildSteps: BuildConfig[] = [];

  for (let i = 0; i < modules.length; ++i) {
    const moduleName = modules[i];
    const module = await import("@awsw/" + moduleName).catch(() => {
      logError(`Couldn't load module @awsw/${moduleName} not installed`);
      hadErrors = true;
    });
    if (!module) continue;
    if ("buildConfig" in module) loadedBuildSteps.push(module.buildConfig);
    if ("CustomConfig" in module)
      Object.assign(configValidator, module.CustomConfig);
    else {
      logError(
        `Invalid module @awsw/${moduleName} has no export "CustomConfig"`
      );
      hadErrors = true;
    }
  }
  // Sort builds by build step
  loadedBuildSteps.sort((a, b) => a.step - b.step);
  // Group builds in the same step
  for (let i = 0; i < loadedBuildSteps.length; ++i) {
    const { step, build, devRequired } = loadedBuildSteps[i];
    buildSteps[buildSteps.length - 1].push({ devRequired, build });
    if (
      i !== loadedBuildSteps.length - 1 &&
      step !== loadedBuildSteps[i + 1].step
    )
      buildSteps.push([]);
  }

  if (hadErrors) terminate();
};

const loadConfigFile = async (): Promise<{ [key: string]: string }> => {
  try {
    const configString = await fs.readFile(configFile, {
      encoding: "utf-8",
    });
    const config = yaml.parse(configString);
    if (!(config && typeof config === "object"))
      terminate(`${configFile} must be a valid key-value object`);
    const execModule = process.env.AWSW_EXEC_MODULE;
    if (execModule) {
      if (!config.Modules) config.Modules = [execModule];
      else if (Array.isArray(config.Modules)) config.Modules.push(execModule);
    }
    if (config.Modules && Array.isArray(config.Modules))
      await loadOtherModules(config.Modules);
    return config;
  } catch (error) {
    throw terminate("Could not read " + configFile);
  }
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
}): ConfigValue<typeof configValidator> => {
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
  const config: Partial<Writeable<ConfigValue<typeof configValidator>>> = {};
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
    logError(`Invalid ${configFile}:`);
    if (missingKeys.length) logError("Missing keys:", missingKeys);
    if (invalidKeys.length) {
      logError("Invalid keys:");
      for (const { key, expected, value } of invalidKeys)
        logError(`\t- "${key}" should be ${expected} but got "${value}"`);
    }
    terminate();
  }
  if (alienKeys.length)
    console.warn(
      `\x1b[33mUnknown keys in ${configFile}:`,
      alienKeys,
      "\x1b[0m"
    );
  return config as ConfigValue<typeof configValidator>;
};

const AwsCredentials = getAwsCredentials();
const unsafeConfig = await loadConfigFile();
const configFileContent = validateConfig(unsafeConfig);

export const Config = { AwsCredentials, ...configFileContent } as const;

export const build = async (type: "dev" | "prod") => {
  await fs.mkdir(Config.BuildPath, { recursive: true });
  // Clear build directory
  const files = await fs.readdir(Config.BuildPath);
  await Promise.all(
    files.map((file) =>
      fs.rm(Config.BuildPath + "/" + file, { recursive: true })
    )
  );
  // Copy all files to build
  await fs.cp(Config.SourcePath, Config.BuildPath, { recursive: true });
  // Start build process

  const config = Config as ConfigValue<{}> & typeof Config;

  for (let i = 0; i < buildSteps.length; ++i) {
    let steps = buildSteps[i];
    // If we are building for dev but it's not required, skip
    if (type === "dev") steps = steps.filter((s) => s.devRequired);

    // Skip immediately if not necessary
    if (steps.length === 0) continue;

    // Run all steps in parallel and wait for result
    const result = await Promise.allSettled(
      steps.map((step) => step.build(config))
    );
    const failed = result.filter(
      (res) => res.status === "rejected"
    ) as PromiseRejectedResult[];
    // Log any errors with builds in step
    for (let i = 0; i < failed.length; ++i) {
      const error = failed[i].reason;
      if (error instanceof Error) logError(error.message);
      else logError(error);
    }
    // If step failed abort build
    if (failed.length) throw new Error(type + " build failed");
  }
};
