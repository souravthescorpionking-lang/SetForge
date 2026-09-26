/**
 * Demo-data reset — wipes ALL demo-account training data (workouts, routines,
 * goals, measurement records) via the PUBLIC API, then re-runs the seeder for
 * a clean, realistic dataset. Run: bun scripts/reset-demo-data.ts
 *
 * Use this when demo data has been polluted by QA experiments or a buggy seed.
 * Idempotent: safe to run repeatedly.
 */
const BASE = process.env.BASE_URL ?? "http://localhost:3000";
const EMAIL = process.env.DEMO_EMAIL ?? "demo@setforge.app";
const PASSWORD = process.env.DEMO_PASSWORD ?? "password123";

let cookie = "";

async function api<T>(path: string, method: "GET" | "POST" | "PATCH" | "DELETE", body?: unknown): Promise<T> {
  let lastErr: unknown;
  for (let attempt = 1; attempt <= 6; attempt++) {
    try {
      const res = await fetch(`${BASE}${path}`, {
        method,
        headers: {
          "Content-Type": "application/json",
          ...(cookie ? { Cookie: cookie } : {}),
        },
        body: body ? JSON.stringify(body) : undefined,
      });
      const setCookie = res.headers.get("set-cookie");
      if (setCookie) cookie = setCookie.split(";")[0];
      if (!res.ok) {
        const text = await res.text();
        throw new Error(`${method} ${path} → ${res.status}: ${text.slice(0, 300)}`);
      }
      if (res.status === 204) return undefined as T;
      return (await res.json()) as T;
    } catch (e) {
      lastErr = e;
      if (attempt < 6) {
        await new Promise((r) => setTimeout(r, 3000 * attempt)); // server may be restarting
        continue;
      }
    }
  }
  throw lastErr;
}

async function main() {
  console.log("→ login");
  await api("/api/auth/login", "POST", { email: EMAIL, password: PASSWORD });

  // ---------- wipe workouts ----------
  const { workouts } = await api<{ workouts: Array<{ id: string }> }>("/api/workouts", "GET");
  console.log(`→ deleting ${workouts.length} workouts…`);
  let n = 0;
  for (const w of workouts) {
    await api(`/api/workouts/${w.id}`, "DELETE");
    if (++n % 10 === 0) console.log(`   … ${n}/${workouts.length}`);
  }
  console.log(`✓ workouts deleted: ${n}`);

  // ---------- wipe routines ----------
  const { routines } = await api<{ routines: Array<{ id: string }> }>("/api/routines", "GET");
  for (const r of routines) await api(`/api/routines/${r.id}`, "DELETE");
  console.log(`✓ routines deleted: ${routines.length}`);

  // ---------- wipe goals ----------
  const { goals } = await api<{ goals: Array<{ id: string }> }>("/api/goals", "GET");
  for (const g of goals) await api(`/api/goals/${g.id}`, "DELETE");
  console.log(`✓ goals deleted: ${goals.length}`);

  // ---------- wipe measurement records (keep configs) ----------
  const { measurements } = await api<{ measurements: Array<{ id: string; name: string }> }>("/api/measurements", "GET");
  let recCount = 0;
  for (const m of measurements) {
    const recs = await api<{ records: Array<{ id: string }> }>(`/api/measurements/${m.id}/records`, "GET");
    for (const r of recs.records) {
      await api(`/api/measurements/${m.id}/records/${r.id}`, "DELETE");
      recCount++;
    }
  }
  console.log(`✓ measurement records deleted: ${recCount}`);

  console.log("🎉 reset complete — now re-seeding…");

  // ---------- re-seed ----------
  const proc = Bun.spawn(["bun", `${import.meta.dir}/seed-demo-data.ts`], {
    env: { ...process.env, BASE_URL: BASE, DEMO_EMAIL: EMAIL, DEMO_PASSWORD: PASSWORD },
    stdout: "inherit",
    stderr: "inherit",
  });
  const code = await proc.exited;
  if (code !== 0) throw new Error(`seed-demo-data.ts exited with ${code}`);
  console.log("🎉 demo data rebuilt from scratch");
}

main().catch((e) => {
  console.error("FAILED:", e.message);
  process.exit(1);
});
