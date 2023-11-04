#!/usr/bin/env node
import http, { IncomingMessage, ServerResponse } from "http";
import fs, { ReadStream } from "fs";

/** //TODO */
const root = "";
const errorDocument = "";
const previewJsPath = "";

const createResolvablePromise = () => {
  let resolve: (event: "css" | "refresh") => void = () => {};
  const promise = new Promise<"css" | "refresh">((res) => (resolve = res));
  return Object.assign(promise, { resolve });
};

/** A promise that gets resolved once there were changes in the filesystem */
let fsChangePromise = createResolvablePromise();

// Listen to changes in the filesystem to resolve pending promises
fs.watch(root, { recursive: true }).addListener("change", (_, filename) => {
  const file = typeof filename === "string" ? filename : filename.toString();
  const event = file.endsWith("css") ? "css" : "refresh";
  fsChangePromise.resolve(event);
  fsChangePromise = createResolvablePromise();
});

const processRequest = async (
  path: string
): Promise<{ status: number; body: string | ReadStream | any }> => {
  if (path === "//awsw-preview.js")
    return { status: 200, body: fs.createReadStream(previewJsPath) };
  if (path === "//awsw-preview/listen")
    return fsChangePromise.then((event) => ({ status: 200, body: { event } }));

  // Open index.html as root file
  if (path === "") path = "index.html";
  // If there is no file extension assume html
  if (!path.includes(".")) path += ".html";

  try {
    // TODO append JS logic to refresh page on changes
    const stream = fs.createReadStream(root + path);
    stream.push('<script src="//awsw-preview.js" type="module"></script>');
    return { status: 200, body: stream };
  } catch (error) {}

  // Nothing returned yet so it's a 404 error
  try {
    // Try reading the error document as error response
    const stream = fs.createReadStream(root + errorDocument);
    return { status: 404, body: stream };
  } catch {
    // No error document so show default message
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
  if (reqUrl) {
    const path = new URL(reqUrl, `http://localhost`).pathname;
    response = await processRequest(path);
  } else response = { status: 400, body: { message: "Missing request URL" } };

  /** Stringified version of `response.body` if it's not a `string` or `ReadStream` */
  const body =
    typeof response.body === "object" && !(response.body instanceof ReadStream)
      ? JSON.stringify(response.body)
      : response.body;
  res.writeHead(response.status).end(body);
};
export const server = http.createServer(requestListener);
