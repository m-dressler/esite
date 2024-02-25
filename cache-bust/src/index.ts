import type { BuildConfig, Configuration } from "../../core/src";
import fsSync, { promises as fs } from "fs";
import crypto from "crypto";
import path from "path";

export const CustomConfig = {
  CacheBustToken: {
    type: "string",
    optional: true,
    default: "CACHE_BUST",
  },
} as const satisfies Configuration;

/** A cache for hashes to not compute them twice */
const hashes: { [fileName: string]: string } = {};

export const buildConfig: BuildConfig<typeof CustomConfig> = {
  step: 925_000,
  devRequired: false,
  build: async (Config) => {
    const cacheBustPrefix = "[" + Config.CacheBustToken;

    const generateHash = async (filePath: string): Promise<Buffer> => {
      const hash = crypto.createHash("sha1");
      const stream = fsSync.createReadStream(filePath);
      stream.pipe(hash);
      return new Promise((res) =>
        stream.on("end", () => res(hash.end().read()))
      );
    };

    const getHash = async (filePath: string) => {
      if (hashes[filePath]) return hashes[filePath];
      const hashBuffer = await generateHash(filePath);
      const hash = hashBuffer.toString("base64url");
      hashes[filePath] = hash;
      return hash;
    };

    const getTargetPath = (
      filePath: string,
      fileTarget: string,
      content: string,
      index: number
    ) => {
      if (fileTarget === "") {
        // Get file path from attribute
        const queryEnd = content.lastIndexOf("?", index);
        const pathStart = Math.max(
          content.lastIndexOf('"', queryEnd),
          content.lastIndexOf("'", queryEnd),
          content.lastIndexOf("`", queryEnd),
          content.lastIndexOf("=", queryEnd)
        );
        fileTarget = "=" + content.substring(pathStart + 1, queryEnd);
      }

      // Means it targets a specific file
      if (fileTarget[0] === "=") {
        // Is absolute path in build folder
        if (fileTarget[1] === "/")
          return Config.BuildPath + fileTarget.substring(2);
        // Is relative path to file
        else return path.resolve(filePath, fileTarget);
      }

      const lineNumber =
        Array.from(content.substring(0, index).matchAll(/\n/g)).length + 1;
      throw new Error(
        `Cache-bust | File "${filePath}:${lineNumber}" | Target "${fileTarget}" is invalid`
      );
    };

    const cacheBust = async (filePath: string) => {
      const content = await fs.readFile(filePath, { encoding: "utf-8" });
      let index = content.indexOf(cacheBustPrefix);
      if (index === -1) return;
      let updated = content.substring(0, index);
      do {
        const targetStart = index + cacheBustPrefix.length;
        const endIndex = content.indexOf("]", targetStart);
        const fileTarget = content.substring(targetStart, endIndex);
        const targetPath = getTargetPath(filePath, fileTarget, content, index);
        const targetExists = await fs.stat(targetPath).then(
          () => true,
          () => false
        );
        if (!targetExists) {
          const lineNumber = Array.from(updated.matchAll(/\n/g)).length + 1;
          throw new Error(
            `Cache-bust | File "${filePath}:${lineNumber}" | Target "${fileTarget}" (resolved "${targetPath}") doesn't exist`
          );
        }
        updated += await getHash(targetPath);
        index = content.indexOf(cacheBustPrefix, endIndex + 1);
        updated += content.substring(
          endIndex + 1,
          index === -1 ? undefined : index
        );
      } while (index !== -1);
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
