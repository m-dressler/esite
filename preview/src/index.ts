#!/usr/bin/env node
import http, { IncomingMessage, ServerResponse } from "http";
import fs, { ReadStream } from "fs";
import mime from "mime";
import type { ConfigType, Configuration } from "../../core/src";

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

export const run = (Config: ConfigType<typeof CustomConfig>) => {
  const root = Config.SourcePath;
  const errorDocument = Config.ErrorDocument;
  const port = Config.PreviewPort;
  const previewJsPath =
    import.meta.url.substring(0, import.meta.url.lastIndexOf("/")) +
    "/awsw-preview.cjs";

  const createResolvablePromise = () => {
    let resolve: (event: "css" | "refresh") => void = () => {};
    const promise = new Promise<"css" | "refresh">((res) => (resolve = res));
    return Object.assign(promise, { resolve });
  };

  const fileExists = (path: string) =>
    fs.promises.access(path, fs.constants.F_OK).then(
      () => true,
      () => false
    );

  /** A promise that gets resolved once there were changes in the filesystem */
  let fsChangePromise = createResolvablePromise();

  let errorDocumentExists = false;
  fileExists(root + errorDocument).then(
    (exists) => (errorDocumentExists = exists)
  );

  // Listen to changes in the filesystem to resolve pending promises
  fs.watch(root, { recursive: true }).addListener("change", (_, filename) => {
    const file = typeof filename === "string" ? filename : filename.toString();
    const event = file.endsWith("css") ? "css" : "refresh";
    // Re-check if error doc exists now
    fileExists(root + errorDocument).then(
      (exists) => (errorDocumentExists = exists)
    );
    fsChangePromise.resolve(event);
    fsChangePromise = createResolvablePromise();
  });

  const processRequest = async (
    path: string
  ): Promise<{ status: number; body: string | ReadStream | any }> => {
    if (path === "/-/awsw-preview.js")
      return { status: 200, body: fs.createReadStream(previewJsPath) };
    if (path === "/-/awsw-preview/listen")
      return fsChangePromise.then((event) => ({
        status: 200,
        body: { event },
      }));

    // TODO append JS logic to refresh page on changes
    if (await fileExists(root + path)) {
      const stream = fs.createReadStream(root + path);
      if (path.includes(".html") || path.includes(".svg"))
        stream.push('<script src="/-/awsw-preview.js" type="module"></script>');
      return { status: 200, body: stream };
    }
    // Resource not in filesystem so it's a 404 error
    else if (errorDocumentExists) {
      // Try reading the error document as error response
      const stream = fs.createReadStream(root + errorDocument);
      return { status: 404, body: stream };
    }
    // Error document doesn't exist so show default message
    else {
      return {
        status: 404,
        body: {
          message:
            "404 - Not Found - configure/correct an error document to change the 404 response",
        },
      };
    }
  };

  const requestListener = async (req: IncomingMessage, res: ServerResponse) => {
    const reqUrl = req.url;
    let response: { status: number; body: string | ReadStream | any };
    const headers: HeadersInit = {};
    if (reqUrl) {
      let path = new URL(reqUrl, `http://localhost`).pathname;
      // Open index.html as root file
      if (path === "/") path = "index.html";
      const hasFileExtension = path.includes(".");
      // If there is no file extension assume html
      if (!hasFileExtension) path += ".html";

      const mimeType = mime.getType(path);
      if (mimeType) headers["Content-Type"] = mimeType;
      response = await processRequest(path);
    } else response = { status: 400, body: { message: "Missing request URL" } };

    const { body, status } = response;
    res.writeHead(status, headers);

    if (body instanceof ReadStream) body.pipe(res);
    else res.end(typeof body === "object" ? JSON.stringify(body) : body);
  };
  const server = http.createServer(requestListener);
  const listener = server.listen(port);
  listener.on("listening", () =>
    console.log(`Preview running on http://localhost:${port}`)
  );
};

process.env.AWSW_LOAD_MODULES =
  (process.env.AWSW_LOAD_MODULES || "") + "preview,";
process.env.AWSW_EXEC_MODULE = "preview";

// @ts-expect-error // TODO update to @awsw/core
import("../../core/src/index.ts").catch((err) => {
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
