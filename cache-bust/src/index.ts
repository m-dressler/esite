import { BuildConfig, Configuration } from "../../core/src";
import fsSync, { promises as fs } from "fs";
import crypto from "crypto";

export const CustomConfig = {
  CacheBustToken: {
    type: "string",
    optional: true,
    default: "[AWSW_CACHE_BUST]",
  },
} as const satisfies Configuration;

export const buildConfig: BuildConfig<typeof CustomConfig> = {
  step: 5_000,
  devRequired: false,
  build: async (Config) => {
    const generateHash = async (filePath: string): Promise<Buffer> => {
      const hash = crypto.createHash("sha1");
      const stream = fsSync.createReadStream(filePath);
      stream.pipe(hash);
      return new Promise((res) =>
        stream.on("end", () => res(hash.end().read()))
      );
    };

    const cacheBust = async (filePath: string) => {
      const content = await fs.readFile(filePath, { encoding: "utf-8" });
      if (!content.includes(Config.CacheBustToken)) return;
      const hash = await generateHash(filePath).then((buf) =>
        buf.toString("base64url")
      );
      const updated = content.replaceAll(Config.CacheBustToken, hash);
      await fs.writeFile(filePath, updated, { encoding: "utf-8" });
    };

    const files = await fs.readdir(Config.BuildPath, {
      recursive: true,
      withFileTypes: true,
    });

    await Promise.all(
      files
        .filter((f) => f.isFile())
        .map(({ path, name }) =>
          path.startsWith(Config.BuildPath) ? path + name : `./${path}/${name}`
        )
        .map(cacheBust)
    );
  },
};
