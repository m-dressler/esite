#!/usr/bin/env node
import http, { IncomingMessage, ServerResponse } from "http";
import fs from "fs";
import mime from "mime";
import type { Configuration, RunFunction } from "../../core/src";
import { fileURLToPath } from "url";
import { dirname } from "path";
import { Readable, Stream, Transform } from "stream";
import crypto from "crypto";

export const CustomConfig = {
  ErrorDocument: {
    optional: true,
    default: "/error.html",
  },
  PreviewPort: {
    optional: true,
    type: "number",
    default: 8080,
  },
} as const satisfies Configuration;

const checksum = async (filePath: string): Promise<Buffer> => {
  const hash = crypto.createHash("sha1");
  const stream = fs.createReadStream(filePath);
  stream.pipe(hash);
  return new Promise((res) => stream.on("end", () => res(hash.end().read())));
};

const clearPreviousLine = () => {
  process.stdout.moveCursor(0, -1); // up one line
  process.stdout.clearLine(1); // from cursor to end
};

const getTime = () => {
  const date = new Date();
  const time = [date.getHours(), date.getMinutes(), date.getSeconds()];
  return time.map((t) => (t + "").padStart(2, "0")).join(":");
};

export const run: RunFunction<typeof CustomConfig> = async ({
  Config,
  build,
}) => {
  const rebuild = async (finalLog = true) => {
    const start = performance.now();
    console.log(getTime(), "| Building");
    try {
      await build("dev");
    } catch (err) {
      console.error(getTime(), "| Build failed:" + "\x1b[31;4;1m" + "\n");
      console.error(err);
      console.error("\x1b[0m" + "\nFix error and save file to rebuild");
      return false;
    }
    clearPreviousLine();
    if (finalLog)
      console.log(
        getTime(),
        `| Built (${(performance.now() - start).toFixed(1)}ms)`
      );
    return true;
  };
  await rebuild(false);
  const root = Config.BuildPath;
  const errorDocument = Config.ErrorDocument;
  const port = Config.PreviewPort;
  const previewJsPath =
    dirname(fileURLToPath(import.meta.url)) + "/awsw-preview.js";

  const createResolvablePromise = () => {
    let resolve: (event: "css" | "reload") => void = () => {};
    const promise = new Promise<"css" | "reload">((res) => (resolve = res));
    return Object.assign(promise, { resolve });
  };

  const ConcatStream = (streams?: Stream[]) => {
    const m_streams = streams || [];

    const concat = (...streams: Stream[]) =>
      m_streams.splice(m_streams.length, 0, ...streams);
    const pipeStream = (target: NodeJS.WritableStream, index: number) => {
      const stream = m_streams[index];
      const hasNext = index < m_streams.length - 1;
      stream.pipe(target, { end: !hasNext });
      if (hasNext) stream.on("end", pipeStream.bind(0, target, index + 1));
    };
    const pipe = (target: NodeJS.WritableStream) => {
      if (m_streams.length) pipeStream(target, 0);
      else throw new Error("No streams in concat stream");
    };
    return { concat, pipe };
  };

  /** A promise that gets resolved once there were changes in the filesystem */
  let fsChangePromise = createResolvablePromise();

  let errorDocumentExists = false;
  fs.promises
    .exists(root + errorDocument)
    .then((exists) => (errorDocumentExists = exists));

  const checksumCache: { [filename: string]: Buffer } = {};
  // Listen to changes in the filesystem to resolve pending promises
  fs.watch(Config.SourcePath, { recursive: true }).addListener(
    "change",
    async (_, whackFilename) => {
      const filename = whackFilename.toString();
      const file = Config.SourcePath + filename;

      const stat = await fs.promises.stat(file).catch(() => null);
      if (stat && !stat.isDirectory()) {
        const hash = await checksum(file);
        const cacheValue = checksumCache[filename];
        if (cacheValue && hash.equals(cacheValue)) return;
        checksumCache[filename] = hash;
      }
      const event = file.endsWith("css") ? "css" : "reload";
      if (!(await rebuild())) return;
      // Re-check if error doc exists now
      fs.promises
        .exists(root + errorDocument)
        .then((exists) => (errorDocumentExists = exists));
      fsChangePromise.resolve(event);
      fsChangePromise = createResolvablePromise();
    }
  );

  const isEncrypted = Config.Modules?.includes("encrypt")
    ? (path: string) =>
        ((Config as any).EncryptedPaths as string[]).some((encrypted) =>
          path.startsWith(encrypted)
        )
    : () => false;

  const processRequest = async (
    res: http.ServerResponse,
    path: string
  ): Promise<void> => {
    if (path === "/-/awsw-preview/listen.js") {
      fsChangePromise.then((event) =>
        res.writeHead(200).end(JSON.stringify({ event }))
      );
    } else if (await fs.promises.exists(root + path)) {
      res.writeHead(200);

      const stream = fs.createReadStream(root + path);
      const isSvg = path.endsWith(".svg");
      const appendRefreshScript =
        (path.endsWith(".html") || isSvg) && !isEncrypted(path.substring(1));
      if (!appendRefreshScript) return void stream.pipe(res);

      const concatStream = ConcatStream();

      if (!isSvg) concatStream.concat(stream);
      else {
        const svgTransform = new Transform({
          transform(chunk, _, callback) {
            callback(null, chunk.toString().replace("</svg>", ""));
          },
        });
        concatStream.concat(stream.pipe(svgTransform));
      }

      const openingTag =
        '<script type="text/javascript">' + (isSvg ? "<![CDATA[" : "");
      concatStream.concat(Readable.from([openingTag]));
      concatStream.concat(fs.createReadStream(previewJsPath));
      let closingTag = "</script>";
      if (isSvg) closingTag = " ]]>" + closingTag + "</svg>";
      concatStream.concat(Readable.from([closingTag]));
      concatStream.pipe(res);
    }
    // Resource not in filesystem so it's a 404 error
    else if (errorDocumentExists) {
      res.writeHead(404);
      // Try reading the error document as error response
      fs.createReadStream(root + errorDocument).pipe(res);
    }
    // Error document doesn't exist so show default message
    else {
      res.setHeader("Content-Type", "application/json");
      const message =
        "404 - Not Found - configure/correct an error document to change the 404 response";
      res.writeHead(404).end(JSON.stringify({ message }));
    }
  };

  const requestListener = async (req: IncomingMessage, res: ServerResponse) => {
    const reqUrl = req.url;
    if (!reqUrl)
      return void res
        .writeHead(400)
        .end(JSON.stringify({ message: "Missing request URL" }));

    let path = new URL(reqUrl, `http://localhost`).pathname;
    // Open index.html as root file
    if (path === "/") path = "index.html";
    const hasFileExtension = path.includes(".");
    // If there is no file extension assume html
    if (!hasFileExtension) path += ".html";

    const mimeType = mime.getType(path) || "application/octet-stream";
    res.setHeader("Content-Type", mimeType);
    await processRequest(res, path);
  };
  const server = http.createServer(requestListener);
  const listener = server.listen(port);
  listener.on("listening", () =>
    console.log(`Preview running on http://localhost:${port}`)
  );
};

process.env.AWSW_EXEC_MODULE = "preview";

// @ts-expect-error
import("@awsw/core").catch((err) => {
  if (
    err instanceof Error &&
    err.message.includes("Cannot find module '") &&
    err.message.includes("@awsw/core")
  ) {
    console.error("@awsw/core not installed - please install it first.");
    process.exit(1);
  }
  throw err;
});
