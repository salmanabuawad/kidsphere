import { createHash, randomBytes } from "node:crypto";

export function newToken(): string {
  return randomBytes(32).toString("base64url");
}

/** Only token hashes are persisted, so a database leak does not leak sessions. */
export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}
