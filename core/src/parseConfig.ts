import fs from "fs";
import yaml from "yaml";

type TypeMapper = {
  string: string;
  number: number;
  boolean: boolean;
};
type ConfigurationValidator<
  T extends "string" | "boolean" | "number" = "string",
  Type = TypeMapper[T]
> = {
  type?: T;
  parser?: (str: Type) => any;
} & ({ optional: false } | { optional: true; default: Type });
type ConfigurationValidators = keyof typeof configValidator;
type Configuration = {
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
} as const satisfies {
  [key: string]:
    | ConfigurationValidator<"boolean">
    | ConfigurationValidator<"number">
    | ConfigurationValidator<"string">;
};

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

const loadConfigFile = (): unknown => {
  try {
    const config = fs.readFileSync(configFile, {
      encoding: "utf-8",
    });
    return yaml.parse(config);
  } catch (error) {
    throw terminate("Could not read " + configFile);
  }
};

const validateConfig = (unsafeConfigIn: unknown): Configuration => {
  if (!(unsafeConfigIn && typeof unsafeConfigIn === "object"))
    terminate(`${configFile} must be a valid key-value object`);
  const unsafeConfig = unsafeConfigIn as { [key: string]: any };

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

  const config: Partial<Configuration> = {};
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
    if (typeof value !== type) invalidKeys.push({ key, expected: type, value });
    else {
      if ("parser" in validator) config[key] = validator.parser(value) as any;
      else config[key] = value;
    }
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
  return config as Configuration;
};

const AwsCredentials = getAwsCredentials();
const unsafeConfig = loadConfigFile();
const configFileContent = validateConfig(unsafeConfig);

export const Config = { AwsCredentials, ...configFileContent } as const;
