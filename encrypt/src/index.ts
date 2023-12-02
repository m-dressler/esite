import * as crypto from "crypto";
import { promises as fs } from "fs";
import "dotenv/config";
import { Configuration, BuildConfig } from "../../core/src";

const getBufferBase64Parser = (lengths: [number, ...number[]]) => {
  let error = "a base64 encoded key of byte length ";
  if (lengths.length === 1) error += lengths[0];
  else {
    error += lengths.slice(0, lengths.length - 1).join(", ");
    error += ", or " + lengths[lengths.length - 1];
  }
  error += " (current length: ${LENGTH})";
  return (str: string) => {
    const buf = Buffer.from(str, "base64");
    const expected = error.replace("${LENGTH}", buf.length + "");
    if (!lengths.includes(buf.length)) throw { expected };
    return buf;
  };
};

export const CustomConfig = {
  EncryptionKey: {
    optional: false,
    parser: getBufferBase64Parser([16, 24, 32]),
  },
} as const satisfies Configuration;

const encryptFileName = ".awsw-encrypt";

const encrypt = async (
  key: crypto.webcrypto.CryptoKey,
  plaintext: Buffer
): Promise<Buffer> => {
  const iv = crypto.randomBytes(16);

  const encrypted = await crypto.subtle.encrypt(
    { name: "AES-CBC", iv },
    key,
    plaintext
  );
  return Buffer.concat(
    [iv, new Uint8Array(encrypted)],
    iv.length + encrypted.byteLength
  );
};

export const buildConfig: BuildConfig<typeof CustomConfig> = {
  step: 1_000_000,
  devRequired: true,
  build: async (Config) => {
    const key = await crypto.subtle.importKey(
      "raw",
      Config.EncryptionKey,
      "AES-CBC",
      true,
      ["encrypt"]
    );

    const files = await fs.readdir(Config.BuildPath, { recursive: true });
    const encryptFiles = files.filter(
      (f) => f === encryptFileName || f.endsWith("/" + encryptFileName)
    );

    const encryptedPaths = [] as string[];
    Object.assign(Config, { EncryptedPaths: encryptedPaths });

    const applyEncryptFile = async (path: string) => {
      const folder = path.substring(0, path.lastIndexOf("/") + 1);
      encryptedPaths.push(folder.replace(Config.BuildPath, ""));
      await fs.rm(path);
      const files = await fs.readdir(folder, { recursive: true });

      for (let i = 0; i < files.length; ++i) {
        const filePath = folder + files[i];
        const stat = await fs.stat(filePath);
        if (!stat.isDirectory()) {
          const content = await fs.readFile(filePath);
          const encrypted = await encrypt(key, content);
          await fs.writeFile(filePath, encrypted);
        }
      }
    };

    for (let i = 0; i < encryptFiles.length; ++i)
      await applyEncryptFile(Config.BuildPath + encryptFiles[i]);
  },
};
