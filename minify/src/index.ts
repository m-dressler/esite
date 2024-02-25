import * as terser from "terser";
import HtmlMinify from "html-minifier";
import CleanCSS from "clean-css";
import type { BuildConfig, Configuration } from "../../core/src";
import { promises as fs } from "fs";
import ImageMinJpeg from "imagemin-jpegtran";
import ImageMinPng from "imagemin-optipng";
import ImageMinWebp from "imagemin-webp";
import ImageMinGif from "imagemin-gifsicle";

export const CustomConfig = {
  MinifyImages: {
    optional: true,
    default: true,
    type: "boolean",
  },
  MinifyHtmlComments: {
    optional: true,
    default: true,
    type: "boolean",
  },
} as const satisfies Configuration;

const cssMinify = new CleanCSS({ returnPromise: true });

const imageMinify = {
  jpeg: ImageMinJpeg(),
  png: ImageMinPng(),
  webp: ImageMinWebp(),
  gif: ImageMinGif(),
} as const;

export const buildConfig: BuildConfig<typeof CustomConfig> = {
  step: 950_000,
  devRequired: false,
  build: async (Config) => {
    const minifyJs = async (files: string[]) => {
      const jsFiles = files.filter(
        (f) => f.endsWith(".js") || f.endsWith(".mjs") || f.endsWith(".cjs")
      );

      const minifyScript = async (path: string) => {
        const content = await fs.readFile(path, "utf-8");
        const result = await terser.minify(content);
        if (result.code) await fs.writeFile(path, result.code);
        else throw new Error("Terser JS minification yielded no result");
      };

      // Minify 5 scripts in parallel
      for (let i = 0; i < jsFiles.length; i += 5)
        await Promise.all(jsFiles.slice(i, 5).map(minifyScript));
    };

    const minifyHtml = async (files: string[]) => {
      const htmlFiles = files.filter(
        (f) => f.endsWith(".html") || f.endsWith(".htm")
      );

      const options: HtmlMinify.Options = {
        minifyCSS: true,
        minifyJS: true,
        collapseWhitespace: true,
        removeEmptyAttributes: true,
        removeAttributeQuotes: true,
        removeRedundantAttributes: true,
        removeScriptTypeAttributes: true,
        removeComments: Config.MinifyHtmlComments,
      };

      const minifyDocument = async (path: string) => {
        const content = await fs.readFile(path, "utf-8");
        const result = HtmlMinify.minify(content, options);
        await fs.writeFile(path, result);
      };

      // Minify 5 documents in parallel
      for (let i = 0; i < htmlFiles.length; i += 5)
        await Promise.all(htmlFiles.slice(i, 5).map(minifyDocument));
    };

    const minifyCss = async (files: string[]) => {
      const cssFiles = files.filter((f) => f.endsWith(".css"));

      const minifyStylesheet = async (path: string) => {
        const content = await fs.readFile(path, "utf-8");
        const result = await cssMinify.minify(content);
        if (result.errors.length)
          throw new Error(
            "CSS minification for " +
              path +
              " yielded errors: [" +
              result.errors.join() +
              "]"
          );
        await fs.writeFile(path, result.styles);
      };

      // Minify 5 stylesheets in parallel
      for (let i = 0; i < cssFiles.length; i += 5)
        await Promise.all(cssFiles.slice(i, 5).map(minifyStylesheet));
    };

    const minifyImages = async (files: string[]) => {
      const imageFiles = files.filter(
        (f) =>
          f.endsWith(".png") ||
          f.endsWith(".jpg") ||
          f.endsWith(".jpeg") ||
          f.endsWith(".webp") ||
          f.endsWith(".gif")
      );

      const minifyImage = async (path: string) => {
        const content = await fs.readFile(path);
        let type = path.substring(path.lastIndexOf(".") + 1) as
          | "png"
          | "jpg"
          | "jpeg"
          | "webp"
          | "gif";
        if (type === "jpg") type = "jpeg";
        type;
        const result = await imageMinify[type](content);
        await fs.writeFile(path, result);
      };

      // Minify 5 stylesheets in parallel
      for (let i = 0; i < imageFiles.length; i += 5)
        await Promise.all(imageFiles.slice(i, 5).map(minifyImage));
    };

    const files = await fs.readdir(Config.BuildPath, { recursive: true });
    for (let i = 0; i < files.length; ++i)
      files[i] = Config.BuildPath + files[i];

    const minifications = [
      minifyJs(files),
      minifyHtml(files),
      minifyCss(files),
    ];
    if (Config.MinifyImages) minifications.push(minifyImages(files));

    await Promise.all(minifications);
  },
};
