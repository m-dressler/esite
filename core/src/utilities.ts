/// <reference types="./types.d.ts" />
import fs from "fs/promises";

const exists = (path: string) =>
  fs.access(path, fs.constants.F_OK).then(
    () => true,
    () => false
  );

Object.assign(fs, { exists });
