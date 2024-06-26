import { promises as fs } from "fs";
import * as sass from "sass";

export const CustomConfig = {} as const satisfies Configuration;

export const buildConfig: BuildConfig<typeof CustomConfig> = {
  step: 50_000,
  devRequired: true,
  build: async (Config, { log }) => {
    const sassCompile = async (fileName: string) => {
      const filePath = Config.BuildPath + fileName;
      try {
        log.debug("SASS | Compiling", filePath);
        const { css } = sass.compile(filePath, {});
        const cssPath = filePath.replace(/\.(scss|sass)$/, ".css");
        log.debug("SASS | Writing file", cssPath);
        await fs.writeFile(cssPath, css, { encoding: "utf-8" });
        log.debug("SASS | Removing file", filePath);
        await fs.rm(filePath);
        log.debug("SASS | Done", filePath);
      } catch (err) {
        log.debug("SASS | Compilation Error", filePath, err);
        if (err instanceof sass.Exception) {
          const line = err.span.start.line + 1;
          const filePos = `${Config.SourcePath}${fileName}:${line}`;
          throw `SASS compilation ${filePos} | ${err.sassMessage}`;
        } else throw err;
      }
    };

    log.debug("SASS | Collecting files");
    const files = await fs.readdir(Config.BuildPath, { recursive: true });

    const sassFiles = files.filter(
      (f) => f.endsWith(".scss") || f.endsWith(".sass")
    );
    log.debug("SASS | Compiling", sassFiles.length, "files");
    await Promise.all(sassFiles.map((f) => sassCompile(f)));
    log.debug("SASS | Successfully compiled all SASS files");
  },
};
