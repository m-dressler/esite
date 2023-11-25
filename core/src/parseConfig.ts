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
type ConfigurationValidators = keyof typeof configValidator;
type BaseConfiguration = {
  [key in ConfigurationValidators]: "parser" extends keyof (typeof configValidator)[key]
    ? // @ts-expect-error
      ReturnType<(typeof configValidator)[key]["parser"]>
    : "type" extends keyof (typeof configValidator)[key]
    ? // @ts-expect-error
      TypeMapper[(typeof configValidator)[key]["type"]]
    : string;
};
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

const loadOtherModules = async (modules: string[]) => {
  let hadErrors = false;
  for (let i = 0; i < modules.length; ++i) {
    const moduleName = modules[i];
    const module = await import("@awsw/" + moduleName).catch(() => {
      logError(`Couldn't load module @awsw/${moduleName} not installed`);
      hadErrors = true;
    });
    if (!module) continue;
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
}): BaseConfiguration => {
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

  const config: Partial<BaseConfiguration> = {};
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
  return config as BaseConfiguration;
};

const AwsCredentials = getAwsCredentials();
const unsafeConfig = await loadConfigFile();
const configFileContent = validateConfig(unsafeConfig);

export const Config = { AwsCredentials, ...configFileContent } as const;
