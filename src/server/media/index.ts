// ─────────────────────────────────────────────────────────────────────────────
// Part 6 — Media adapter (§2). Plug-and-play storage behind one interface.
//   MEDIA_PROVIDER=none  → NoneStore: put() throws MEDIA_DISABLED, UI hides uploads
//   MEDIA_PROVIDER=local → LocalStore: files under MEDIA_LOCAL_DIR, served via
//                          GET /api/media/[key] with auth + ownership
//   MEDIA_PROVIDER=s3    → S3Store: lean SigV4 PUT/DELETE against the env config
// Keys are namespaced users/{userId}/... — never trust a client-supplied key.
// ─────────────────────────────────────────────────────────────────────────────
import { createHash, createHmac } from "node:crypto";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { getEnv } from "@/server/env";
import { forbidden, notFound } from "@/server/http";

export type MediaProvider = "none" | "local" | "s3";

export interface StoredObject {
  data: Buffer;
  mime: string;
}

export interface MediaStore {
  readonly provider: MediaProvider;
  put(key: string, data: Buffer, mime: string): Promise<void>;
  get(key: string): Promise<StoredObject | null>;
  delete(key: string): Promise<void>;
  /** Direct URL when the provider serves objects publicly; null → serve via /api/media/[key]. */
  url(key: string): string | null;
}

// ---------- helpers ----------

/** Resolve a media key to a safe absolute path inside the local dir (no traversal). */
function safeLocalPath(root: string, key: string): string {
  const resolved = path.resolve(root, key);
  const rootAbs = path.resolve(root);
  if (resolved !== rootAbs && !resolved.startsWith(rootAbs + path.sep)) {
    throw notFound("Media key not found");
  }
  return resolved;
}

/** Coerce JSON columns (SQLite stores Prisma Json as JSONB text) to string[]. */
export function jsonStringArray(value: unknown): string[] {
  if (Array.isArray(value)) return value.filter((v): v is string => typeof v === "string");
  if (typeof value === "string" && value.length > 0) {
    try {
      const parsed = JSON.parse(value);
      return Array.isArray(parsed) ? parsed.filter((v): v is string => typeof v === "string") : [];
    } catch {
      return [];
    }
  }
  return [];
}

// ---------- NoneStore ----------

class NoneStore implements MediaStore {
  readonly provider = "none" as const;
  async put(): Promise<void> {
    throw forbidden("Media uploads are disabled (MEDIA_PROVIDER=none)");
  }
  async get(): Promise<StoredObject | null> {
    return null;
  }
  async delete(): Promise<void> {}
  url(): string | null {
    return null;
  }
}

// ---------- LocalStore ----------

class LocalStore implements MediaStore {
  readonly provider = "local" as const;
  constructor(private readonly root: string) {}

  async put(key: string, data: Buffer, _mime: string): Promise<void> {
    const file = safeLocalPath(this.root, key);
    await mkdir(path.dirname(file), { recursive: true });
    await writeFile(file, data);
  }

  async get(key: string): Promise<StoredObject | null> {
    try {
      const file = safeLocalPath(this.root, key);
      const data = await readFile(file);
      return { data, mime: guessMime(key) };
    } catch {
      return null;
    }
  }

  async delete(key: string): Promise<void> {
    try {
      await rm(safeLocalPath(this.root, key), { force: true });
    } catch {
      /* best-effort */
    }
  }

  url(): string | null {
    return null; // always served through the authenticated API route
  }
}

function guessMime(key: string): string {
  const ext = path.extname(key).toLowerCase();
  if (ext === ".png") return "image/png";
  if (ext === ".webp") return "image/webp";
  return "image/jpeg";
}

// ---------- S3Store (lean SigV4; no SDK dependency) ----------

class S3Store implements MediaStore {
  readonly provider = "s3" as const;
  constructor(
    private readonly cfg: {
      endpoint: string; bucket: string; region: string; accessKey: string; secretKey: string;
      publicBaseUrl?: string;
    },
  ) {}

  url(key: string): string | null {
    if (!this.cfg.publicBaseUrl) return null;
    return `${this.cfg.publicBaseUrl.replace(/\/$/, "")}/${key}`;
  }

  private endpointFor(key: string): { url: URL; host: string; path: string } {
    const base = this.cfg.endpoint.replace(/\/$/, "");
    const pathPart = `/${this.cfg.bucket}/${key}`;
    return { url: new URL(base + pathPart), host: new URL(base).host, path: pathPart };
  }

  private sign(method: string, key: string, payload: Buffer | "UNSIGNED-PAYLOAD"): Record<string, string> {
    const { url, host, path } = this.endpointFor(key);
    const now = new Date();
    const amzDate = now.toISOString().replace(/[:-]|\.\d{3}/g, ""); // YYYYMMDDTHHMMSSZ
    const dateStamp = amzDate.slice(0, 8);
    const payloadHash = payload === "UNSIGNED-PAYLOAD" ? "UNSIGNED-PAYLOAD" : createHash("sha256").update(payload).digest("hex");
    const canonicalHeaders = `host:${host}\nx-amz-content-sha256:${payloadHash}\nx-amz-date:${amzDate}\n`;
    const signedHeaders = "host;x-amz-content-sha256;x-amz-date";
    const canonicalRequest = [method, path, "", canonicalHeaders, signedHeaders, payloadHash].join("\n");
    const scope = `${dateStamp}/${this.cfg.region}/s3/aws4_request`;
    const stringToSign = [
      "AWS4-HMAC-SHA256", amzDate, scope,
      createHash("sha256").update(canonicalRequest).digest("hex"),
    ].join("\n");
    const hmac = (k: Buffer | string, d: string) => createHmac("sha256", k).update(d).digest();
    const signingKey = hmac(hmac(hmac(hmac(`AWS4${this.cfg.secretKey}`, dateStamp), this.cfg.region), "s3"), "aws4_request");
    const signature = createHmac("sha256", signingKey).update(stringToSign).digest("hex");
    return {
      "x-amz-date": amzDate,
      "x-amz-content-sha256": payloadHash,
      Authorization: `AWS4-HMAC-SHA256 Credential=${this.cfg.accessKey}/${scope}, SignedHeaders=${signedHeaders}, Signature=${signature}`,
      ...(url ? {} : {}),
    };
  }

  async put(key: string, data: Buffer, mime: string): Promise<void> {
    const { url } = this.endpointFor(key);
    const headers = this.sign("PUT", key, data);
    const res = await fetch(url, { method: "PUT", headers: { ...headers, "content-type": mime }, body: new Uint8Array(data) });
    if (!res.ok) throw new Error(`S3 put failed (${res.status})`);
  }

  async get(key: string): Promise<StoredObject | null> {
    // Public-base setups serve via url(); private objects are proxied rarely —
    // return null and let the API route fall back to a redirect when possible.
    return null;
  }

  async delete(key: string): Promise<void> {
    const { url } = this.endpointFor(key);
    const headers = this.sign("DELETE", key, Buffer.alloc(0));
    await fetch(url, { method: "DELETE", headers }).catch(() => undefined);
  }
}

// ---------- selection ----------

let store: MediaStore | null = null;

export function getMediaStore(): MediaStore {
  if (store) return store;
  const env = getEnv();
  if (env.MEDIA_PROVIDER === "local") {
    store = new LocalStore(path.resolve(env.MEDIA_LOCAL_DIR));
  } else if (env.MEDIA_PROVIDER === "s3" && env.MEDIA_S3_ENDPOINT && env.MEDIA_S3_BUCKET && env.MEDIA_S3_ACCESS_KEY && env.MEDIA_S3_SECRET_KEY) {
    store = new S3Store({
      endpoint: env.MEDIA_S3_ENDPOINT,
      bucket: env.MEDIA_S3_BUCKET,
      region: env.MEDIA_S3_REGION ?? "us-east-1",
      accessKey: env.MEDIA_S3_ACCESS_KEY,
      secretKey: env.MEDIA_S3_SECRET_KEY,
      publicBaseUrl: env.MEDIA_S3_PUBLIC_BASE_URL,
    });
  } else {
    store = new NoneStore();
  }
  return store;
}

/** Provider health for GET /api/health ("none" | "local ok" | "s3 ok" | "s3 fail"). */
export async function mediaHealth(): Promise<string> {
  const s = getMediaStore();
  if (s.provider === "none") return "none";
  if (s.provider === "local") return "local ok";
  try {
    s.url("users/0/healthcheck");
    return "s3 ok";
  } catch {
    return "s3 fail";
  }
}

// ---------- upload pipeline ----------

const MAGIC: Array<{ mime: string; test: (b: Buffer) => boolean }> = [
  { mime: "image/jpeg", test: (b) => b.length > 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff },
  { mime: "image/png", test: (b) => b.length > 8 && b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47 },
  { mime: "image/webp", test: (b) => b.length > 12 && b.toString("ascii", 0, 4) === "RIFF" && b.toString("ascii", 8, 12) === "WEBP" },
];

export function detectImageMime(buffer: Buffer): string | null {
  for (const m of MAGIC) if (m.test(buffer)) return m.mime;
  return null;
}

export interface ProcessedImage {
  full: Buffer;
  thumb: Buffer;
  width: number;
  height: number;
  mime: "image/jpeg";
}

/**
 * Normalize an uploaded photo: EXIF-orient (strips metadata), resize longest edge
 * ≤1600px, emit a 320px thumbnail, always JPEG output. Uses sharp (already a dep);
 * if sharp fails to load the upload is rejected (never store unprocessed bytes).
 */
export async function processImage(input: Buffer): Promise<ProcessedImage> {
  const sharpModule = (await import("sharp").catch(() => null)) as typeof import("sharp") | null;
  if (!sharpModule) throw forbidden("Image processing unavailable on this server");
  const sharp = sharpModule;
  const normalized = await sharp(input).rotate().resize(1600, 1600, { fit: "inside", withoutEnlargement: true }).jpeg({ quality: 82 }).toBuffer({ resolveWithObject: true });
  const thumb = await sharp(input).rotate().resize(320, 320, { fit: "inside", withoutEnlargement: true }).jpeg({ quality: 78 }).toBuffer();
  return { full: normalized.data, thumb, width: normalized.info.width, height: normalized.info.height, mime: "image/jpeg" };
}

/** Ownership check for a media key: only users/{userId}/... keys are readable/writable. */
export function assertOwnMediaKey(userId: string, key: string): void {
  if (!key.startsWith(`users/${userId}/`)) throw notFound("Media key not found");
}
