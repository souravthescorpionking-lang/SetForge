// Database portability engine (audit A4/A6/A8/A13).
// Export / import / copy operate on plain JSON snapshots of every model,
// walked in FK order derived from the Prisma DMMF (parents before children).
// SQLite and Postgres behave identically through the Prisma client — no raw
// table SQL, no vendor SDKs.
import { Prisma, PrismaClient } from "@prisma/client";

type AnyClient = PrismaClient;

/** Delegate name on the PrismaClient for a DMMF model (PascalCase → camelCase). */
function delegateName(model: string): string {
  return model.charAt(0).toLowerCase() + model.slice(1);
}

/** FK-ordered model names: a model depends on another when it OWNS a foreign
 *  key (object field with non-empty relationFromFields). Back-relation fields
 *  (empty relationFromFields, e.g. one-to-one inverse sides) impose no order.
 *  The FK graph is a DAG; self-edges are ignored. */
export function modelOrder(): string[] {
  const models = Prisma.dmmf.datamodel.models;
  const byName = new Map(models.map((m) => [m.name, m]));
  const deps = new Map<string, Set<string>>();
  for (const m of models) {
    const d = new Set<string>();
    for (const f of m.fields) {
      if (
        f.kind === "object" &&
        !f.isList &&
        f.type !== m.name &&
        byName.has(f.type) &&
        (f.relationFromFields ?? []).length > 0
      ) {
        d.add(f.type);
      }
    }
    deps.set(m.name, d);
  }
  const out: string[] = [];
  const done = new Set<string>();
  const visiting = new Set<string>();
  const visit = (name: string) => {
    if (done.has(name) || visiting.has(name)) return;
    visiting.add(name);
    for (const dep of deps.get(name) ?? []) visit(dep);
    visiting.delete(name);
    done.add(name);
    out.push(name);
  };
  for (const m of models) visit(m.name);
  return out;
}

export type DbSnapshot = {
  app: "setforge";
  snapshotVersion: 1;
  exportedAt: string;
  databaseUrl: string; // masked
  tables: Record<string, Array<Record<string, unknown>>>;
};

function maskUrl(url: string): string {
  return url.replace(/:[^:@/]*(?=@)/, ":***@");
}

/** Dump every table (FK order) into a JSON-safe snapshot. */
export async function exportDatabase(client: AnyClient, sourceUrlForLog: string): Promise<DbSnapshot> {
  const tables: Record<string, Array<Record<string, unknown>>> = {};
  const order = modelOrder();
  for (const model of order) {
    const delegate = (
      client as unknown as Record<string, { findMany: () => Promise<Array<Record<string, unknown>>> }>
    )[delegateName(model)];
    if (!delegate || typeof delegate.findMany !== "function") continue;
    tables[model] = (await delegate.findMany()) as Array<Record<string, unknown>>;
  }
  return {
    app: "setforge",
    snapshotVersion: 1,
    exportedAt: new Date().toISOString(),
    databaseUrl: maskUrl(sourceUrlForLog),
    tables,
  };
}

/** Wipe the target (reverse FK order) then insert every row (FK order). */
export async function importDatabase(
  client: AnyClient,
  snapshot: { tables: Record<string, Array<Record<string, unknown>>> },
  log: (msg: string) => void = console.log,
): Promise<{ inserted: number }> {
  const order = modelOrder();
  // wipe (children first)
  for (const model of [...order].reverse()) {
    const rows = snapshot.tables[model];
    if (!rows) continue; // model not present in snapshot (older snapshot)
    const del = (client as unknown as Record<string, { deleteMany: () => Promise<unknown> }>)[delegateName(model)];
    if (!del || typeof del.deleteMany !== "function") continue;
    await del.deleteMany();
    log(`[db-import] wiped ${model}`);
  }
  // insert (parents first)
  let inserted = 0;
  for (const model of order) {
    const rows = snapshot.tables[model];
    if (!rows || rows.length === 0) continue;
    const create = (client as unknown as Record<string, { createMany: (a: { data: unknown }) => Promise<{ count: number }> }>)[delegateName(model)];
    if (!create || typeof create.createMany !== "function") continue;
    const res = await create.createMany({ data: rows });
    inserted += res.count;
    log(`[db-import] ${model}: inserted ${res.count}/${rows.length}`);
  }
  return { inserted };
}

/**
 * One-time data copy (audit A8, DB_MIGRATE_FROM_URL): copies every table from
 * the source database into the target **only when the target has zero users
 * and no `db_copied_from` marker in system_meta**. Returns rows copied.
 */
export async function copyDatabase(
  fromUrl: string,
  toClient: AnyClient,
  log: (msg: string) => void = console.log,
): Promise<{ copied: number; skipped: boolean; reason?: string }> {
  // marker check (prevents re-run even after data arrives)
  const marker = await toClient.systemMeta.findUnique({ where: { key: "db_copied_from" } }).catch(() => null);
  if (marker) {
    const reason = `already copied at ${marker.value}`;
    log(`[db-copy] skipped — ${reason}`);
    return { copied: 0, skipped: true, reason };
  }
  const users = await toClient.user.count();
  if (users > 0) {
    const reason = `target is not empty (${users} users)`;
    log(`[db-copy] skipped — ${reason}`);
    return { copied: 0, skipped: true, reason };
  }

  log(`[db-copy] copying from ${maskUrl(fromUrl)} …`);
  const source = new PrismaClient({ datasources: { db: { url: fromUrl } } });
  try {
    const snapshot = await exportDatabase(source, fromUrl);
    // system rows (units) belong to the target too — full snapshot import
    const { inserted } = await importDatabase(toClient, snapshot, log);
    await toClient.systemMeta.upsert({
      where: { key: "db_copied_from" },
      update: { value: JSON.stringify({ from: maskUrl(fromUrl), at: new Date().toISOString(), rows: inserted }) },
      create: {
        key: "db_copied_from",
        value: JSON.stringify({ from: maskUrl(fromUrl), at: new Date().toISOString(), rows: inserted }),
      },
    });
    log(`[db-copy] done — ${inserted} rows copied, marker written`);
    return { copied: inserted, skipped: false };
  } finally {
    await source.$disconnect().catch(() => undefined);
  }
}

/** Connectivity + emptiness probe for `db:switch-check`. */
export async function probeDatabase(url: string): Promise<{
  reachable: boolean;
  engine: "sqlite" | "postgres" | "other";
  users: number | null;
  error?: string;
  latencyMs: number;
}> {
  const started = Date.now();
  const engine = url.startsWith("file:") ? "sqlite" : /^postgres(ql)?:\/\//i.test(url) ? "postgres" : "other";
  if (engine === "other") {
    return { reachable: false, engine, users: null, error: "unrecognised URL scheme (expected file: or postgres://)", latencyMs: 0 };
  }
  const client = new PrismaClient({ datasources: { db: { url } } });
  try {
    await client.$queryRaw`SELECT 1`;
    const users = await client.user.count();
    return { reachable: true, engine, users, latencyMs: Date.now() - started };
  } catch (e) {
    return { reachable: false, engine, users: null, error: e instanceof Error ? e.message : String(e), latencyMs: Date.now() - started };
  } finally {
    await client.$disconnect().catch(() => undefined);
  }
}
