import fs from "fs";
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
export type BuildFunction<T extends Configuration = {}> = (
  config: typeof Config & ConfigValue<T>
) => any;
export type RunFunction<T extends Configuration = {}> = (params: {
  Config: typeof Config & ConfigValue<T>;
  buildDev: typeof buildDev;
  buildProd: typeof buildProd;
}) => any;

class ParseError extends Error {
  constructor(expected: string) {
    super(expected);
  }
}

const configFile = "aws-website-config.yaml";

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
    parser: (str) => {
      // Guarantees ends with a slash
      if (!str.endsWith("/")) str += "/";
      // Guarantees is relative
      if (!str.startsWith("./"))
        throw new ParseError(
          'Source path should be relative in the project (start with "./")'
        );
      return str;
    },
  },
  RemoveHtmlExtension: {
    optional: true,
    type: "boolean",
    default: true,
  },
  Modules: {
    optional: true,
    type: "string[]",
    default: [],
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

const devBuilds: BuildFunction[] = [];
const prodBuilds: BuildFunction[] = [];

const loadOtherModules = async (modules: string[]) => {
  let hadErrors = false;
  for (let i = 0; i < modules.length; ++i) {
    const moduleName = modules[i];
    const module = await import("@awsw/" + moduleName).catch(() => {
      logError(`Couldn't load module @awsw/${moduleName} not installed`);
      hadErrors = true;
    });
    if (!module) continue;
    if ("buildDev" in module) devBuilds.push(module.buildDev);
    if ("buildProd" in module) prodBuilds.push(module.buildProd);
    if ("CustomConfig" in module)
      Object.assign(configValidator, module.CustomConfig);
    else {
      logError(
        `Invalid module @awsw/${moduleName} has no export "CustomConfig"`
      );
      hadErrors = true;
    }
  }

  if (hadErrors) terminate();
};

const loadConfigFile = async (): Promise<{ [key: string]: string }> => {
  try {
    const configString = fs.readFileSync(configFile, {
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
      if ("parser" in validator) config[key] = validator.parser(value) as any;
      else config[key] = value;
    } else invalidKeys.push({ key, expected: type, value });
  }

  if (missingKeys.length | invalidKeys.length) {
    logError(`Invalid ${configFile}:`);
    if (missingKeys.length) logError("Missing keys:", missingKeys);
    if (invalidKeys.length) {
      logError("Invalid keys:");
      for (const { key, expected, value } of invalidKeys)
        logError(`\t- "${key}" should be of type ${expected} but got ${value}`);
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

const buildAll = async (builds: BuildFunction[], buildName: string) => {
  let promises = [];
  for (let i = 0; i < builds.length; ++i) {
    try {
      const promise = builds[i](Config as ConfigValue<{}> & typeof Config);
      promises.push(promise);
    } catch (error) {
      promises.push(Promise.reject(error));
    }
  }

  const result = await Promise.allSettled(promises);
  const failed = result.filter(
    (res) => res.status === "rejected"
  ) as PromiseRejectedResult[];
  for (let i = 0; i < failed.length; ++i) {
    const error = failed[i].reason;
    if (error instanceof Error) logError(error.message);
    else logError(error);
  }
  if (failed.length) throw new Error(buildName + " build failed");
};
export const buildDev = buildAll.bind(null, devBuilds, "Dev");
export const buildProd = buildAll.bind(null, prodBuilds, "Prod");
