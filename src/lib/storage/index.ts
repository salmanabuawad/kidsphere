/**
 * Private object storage abstraction.
 *
 * Objects are addressed by opaque keys that are never sent to clients. Files
 * are only ever served through authorized API routes that stream bytes after a
 * permission + consent check (see app/api/media/[id]/file).
 */
import { randomBytes } from "node:crypto";
import { LocalStorage } from "./local";
import { S3Storage } from "./s3";

export interface ObjectStorage {
  put(key: string, data: Buffer, contentType: string): Promise<void>;
  get(key: string): Promise<Buffer | null>;
  delete(key: string): Promise<void>;
}

let instance: ObjectStorage | null = null;

export function storage(): ObjectStorage {
  if (!instance) {
    instance =
      process.env.STORAGE_DRIVER === "s3"
        ? new S3Storage({
            endpoint: process.env.S3_ENDPOINT,
            region: process.env.S3_REGION || "us-east-1",
            bucket: process.env.S3_BUCKET || "",
            accessKeyId: process.env.S3_ACCESS_KEY_ID || "",
            secretAccessKey: process.env.S3_SECRET_ACCESS_KEY || "",
            forcePathStyle: process.env.S3_FORCE_PATH_STYLE !== "false",
          })
        : new LocalStorage(process.env.STORAGE_LOCAL_DIR || ".data/storage");
  }
  return instance;
}

/** Tenant-prefixed random key; contains no names or child data. */
export function newStorageKey(organizationId: string, kind: "media" | "narration", ext: string): string {
  return `${organizationId}/${kind}/${randomBytes(16).toString("hex")}.${ext}`;
}

export const ALLOWED_IMAGE_TYPES: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};
export const ALLOWED_AUDIO_TYPES: Record<string, string> = {
  "audio/webm": "webm",
  "audio/ogg": "ogg",
  "audio/mpeg": "mp3",
  "audio/mp4": "m4a",
  "audio/wav": "wav",
  "audio/x-wav": "wav",
};
export const MAX_IMAGE_BYTES = 8 * 1024 * 1024;
export const MAX_AUDIO_BYTES = 15 * 1024 * 1024;

/** Verify the file's magic bytes match the declared type (don't trust the client header). */
export function sniffMatches(contentType: string, data: Buffer): boolean {
  const b = data;
  switch (contentType) {
    case "image/jpeg":
      return b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff;
    case "image/png":
      return b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
    case "image/webp":
      return b.subarray(0, 4).toString("ascii") === "RIFF" && b.subarray(8, 12).toString("ascii") === "WEBP";
    case "audio/webm":
      return b[0] === 0x1a && b[1] === 0x45 && b[2] === 0xdf && b[3] === 0xa3;
    case "audio/ogg":
      return b.subarray(0, 4).toString("ascii") === "OggS";
    case "audio/wav":
    case "audio/x-wav":
      return b.subarray(0, 4).toString("ascii") === "RIFF";
    case "audio/mpeg":
      return b.subarray(0, 3).toString("ascii") === "ID3" || (b[0] === 0xff && (b[1]! & 0xe0) === 0xe0);
    case "audio/mp4":
      return b.subarray(4, 8).toString("ascii") === "ftyp";
    default:
      return false;
  }
}
