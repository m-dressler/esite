import { Logger } from "loglevel";
import { Build } from "./build";
import { CoreConfigValidator } from "./config";

export type Types = "string" | "boolean" | "number" | "string[]";
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

export type ConfigValue<T extends Configuration> = {
  [key in keyof T]: "parser" extends keyof T[key]
    ? // @ts-expect-error
      ReturnType<T[key]["parser"]>
    : "type" extends keyof T[key]
    ? // @ts-expect-error
      TypeMapper[T[key]["type"]]
    : string;
};

declare global {
  type Configuration = {
    [key: string]:
      | ConfigurationValidator<"boolean">
      | ConfigurationValidator<"number">
      | ConfigurationValidator<"string">
      | ConfigurationValidator<"string[]">;
  };

  type BaseConfiguration = ConfigValue<CoreConfigValidator>;

  type BuildConfig<T extends Configuration = {}> = {
    /** The function that builds the step */
    build: (
      config: BaseConfiguration & ConfigValue<T>,
      other: { log: Logger }
    ) => any;
    /** Low step BuildConfigs run before high step BuildConfigs while all same step configs may be run in parallel */
    step: number;
    /** If this step is required to create the dev version of the project */
    devRequired: boolean;
  };
  type RunFunction<T extends Configuration = {}> = (params: {
    Config: BaseConfiguration & ConfigValue<T>;
    build: Build;
    log: Logger;
  }) => any;
  type DeployFunction<T extends Configuration = {}> = (
    files: string[],
    params: {
      log: Logger;
      Config: BaseConfiguration & ConfigValue<T>;
    }
  ) => any;
}
