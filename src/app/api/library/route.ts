import type { NextRequest } from "next/server";
import { handler, requireUser } from "@/server/http";
import { listLibrary } from "@/server/services/library-service";

function listParam(req: NextRequest, name: string): string[] | undefined {
  const all = req.nextUrl.searchParams.getAll(name);
  if (all.length === 0) return undefined;
  const flat = all.flatMap((v) => v.split(",")).map((v) => v.trim()).filter(Boolean);
  return flat.length > 0 ? flat : undefined;
}

/** GET /api/library?search&muscle[]&equipment[]&fav&mine */
export const GET = handler(async (req: NextRequest) => {
  const user = await requireUser();
  return listLibrary(user.id, {
    search: req.nextUrl.searchParams.get("search") ?? undefined,
    muscle: listParam(req, "muscle"),
    equipment: listParam(req, "equipment"),
    fav: req.nextUrl.searchParams.get("fav") === "1",
    mine: req.nextUrl.searchParams.get("mine") === "1",
  });
});
