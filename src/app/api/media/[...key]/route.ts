import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { requireUser, errorResponse } from "@/server/http";
import { getMediaStore, assertOwnMediaKey } from "@/server/media";

type Ctx = { params: Promise<{ key: string[] }> };

function keyOf(params: { key: string[] }): string {
  return params.key.map(decodeURIComponent).join("/");
}

/** GET /api/media/{...key} — auth + ownership-scoped media serving (local provider). */
export async function GET(_req: NextRequest, { params }: Ctx): Promise<NextResponse> {
  try {
    const user = await requireUser();
    const key = keyOf(await params);
    assertOwnMediaKey(user.id, key);

    const store = getMediaStore();
    const object = await store.get(key);
    if (!object) {
      const direct = store.url(key);
      if (direct) return NextResponse.redirect(direct, 302);
      return NextResponse.json({ error: { code: "NOT_FOUND", message: "Media key not found" } }, { status: 404 });
    }

    return new NextResponse(new Uint8Array(object.data), {
      status: 200,
      headers: {
        "content-type": object.mime,
        "cache-control": "private, max-age=86400, immutable",
      },
    });
  } catch (e) {
    return errorResponse(e);
  }
}

/** DELETE /api/media/{...key} — delete an owned object (best-effort metadata cleanup elsewhere). */
export async function DELETE(_req: NextRequest, { params }: Ctx): Promise<NextResponse> {
  try {
    const user = await requireUser();
    const key = keyOf(await params);
    assertOwnMediaKey(user.id, key);
    await getMediaStore().delete(key);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return errorResponse(e);
  }
}
