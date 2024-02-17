import fs from "fs/promises";

declare module "fs/promises" {
  function exists(path: string): Promise<boolean>;
}
