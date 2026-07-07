import { createHash } from "node:crypto";
import type { SyncIdentifiers } from "./types.js";

export function sha256(input: string | Buffer): string {
  return createHash("sha256").update(input).digest("hex");
}

export function computeSyncIdentifiers(pageId: string, markdown: string): SyncIdentifiers {
  const markdownSha256 = sha256(markdown);
  return {
    markdownSha256
  };
}
