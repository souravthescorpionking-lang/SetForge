import { NextRequest } from "next/server";
import { handler, requireUser, badRequest, HttpError } from "@/server/http";
import { getEnv } from "@/server/env";
import { getMediaStore, detectImageMime, processImage } from "@/server/media";
import { uuid7 } from "@/lib/uuid7";
import { MediaUploadResultDTO } from "@/lib/types";

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/media/upload — the media adapter's upload pipeline (Part 6 §2).
//
// Multipart form: `file` (required) + `kind` ("photos" | "avatar"; default
// "photos"). The image is magic-byte sniffed, EXIF-normalized, resized to
// ≤1600px with a 320px thumbnail (always JPEG) and stored under
// users/{userId}/{kind}/{uuid7}.jpg. MEDIA_PROVIDER=none → 403 MEDIA_DISABLED
// (the exact code the client toasts on). Keys are server-generated — a client
// can never pick its own namespace.
// ─────────────────────────────────────────────────────────────────────────────

const KINDS = new Set(["photos", "avatar"]);

export const POST = handler(async (req: NextRequest) => {
  const user = await requireUser();

  const form = await req.formData().catch(() => null);
  const file = form?.get("file");
  if (!(file instanceof File)) throw badRequest("Missing file field");
  const kindRaw = form?.get("kind");
  const kind = typeof kindRaw === "string" && KINDS.has(kindRaw) ? kindRaw : "photos";

  const env = getEnv();
  const maxBytes = env.MEDIA_MAX_UPLOAD_MB * 1024 * 1024;
  if (file.size > maxBytes) {
    throw new HttpError(413, "PAYLOAD_TOO_LARGE", `Image exceeds the ${env.MEDIA_MAX_UPLOAD_MB} MB limit`);
  }

  const store = getMediaStore();
  if (store.provider === "none") {
    throw new HttpError(403, "MEDIA_DISABLED", "Media uploads are disabled on this server");
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  if (!detectImageMime(buffer)) throw badRequest("Unsupported file — use a JPEG, PNG or WebP image");

  const processed = await processImage(buffer);
  const key = `users/${user.id}/${kind}/${uuid7()}.jpg`;
  const thumbKey = key.replace(/\.jpg$/, "-thumb.jpg");
  await store.put(key, processed.full, processed.mime);
  await store.put(thumbKey, processed.thumb, processed.mime);

  const result: MediaUploadResultDTO = {
    key,
    thumbKey,
    width: processed.width,
    height: processed.height,
    mime: processed.mime,
    url: store.url(key),
    thumbUrl: store.url(thumbKey),
  };
  return result;
});
