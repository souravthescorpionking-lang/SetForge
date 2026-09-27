import { readFile } from "node:fs/promises";
import path from "node:path";
import { handler, requireUser } from "@/server/http";
import type { DictionaryTermDTO } from "@/lib/types";

const DICT_PATH = path.resolve(process.cwd(), "catalog/dictionary.json");
let cached: DictionaryTermDTO[] | null = null;
let cachedAt = 0;

/** GET /api/dictionary — static JSON (catalog/dictionary.json), in-memory cached 10 min. */
export const GET = handler(async () => {
  await requireUser();
  if (cached && Date.now() - cachedAt < 10 * 60 * 1000) return { terms: cached };
  const raw = await readFile(DICT_PATH, "utf8").catch(() => null);
  if (!raw) return { terms: [] };
  const parsed = JSON.parse(raw) as DictionaryTermDTO[];
  if (!Array.isArray(parsed)) return { terms: [] };
  cached = parsed;
  cachedAt = Date.now();
  return { terms: parsed };
});
