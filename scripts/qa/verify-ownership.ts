/**
 * verify:ownership — cross-user data isolation across EVERY mutating + reading
 * endpoint (audit B11 / O2, platform-adapted QA script).
 *
 * Creates two throwaway accounts (A: resource owner, B: attacker). B attempts
 * GET/PATCH/POST/DELETE on A's resources — every attempt must fail with 404
 * (ownership asserted, no existence leak). Cleanup deletes both accounts.
 *
 * Run: bun scripts/qa/verify-ownership.ts   (server must be up on :3000)
 */
const BASE = process.env.BASE_URL ?? "http://localhost:3000";
const STAMP = Date.now().toString(36);
const A = { email: `own-a-${STAMP}@test.dev`, password: "password-a-123" };
const B = { email: `own-b-${STAMP}@test.dev`, password: "password-b-123" };

let failures = 0;
let checks = 0;

async function api(
  jar: { cookie: string },
  method: string,
  path: string,
  body?: unknown,
): Promise<{ status: number; data: unknown }> {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: { "content-type": "application/json", cookie: jar.cookie },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  let data: unknown = null;
  try {
    data = await res.json();
  } catch {
    /* empty body */
  }
  return { status: res.status, data };
}

async function login(email: string, password: string): Promise<{ cookie: string }> {
  const res = await fetch(`${BASE}/api/auth/login`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  if (res.status !== 200) throw new Error(`login failed for ${email}: ${res.status}`);
  const cookie = res.headers.get("set-cookie")!.split(";")[0];
  return { cookie };
}

async function signup(x: { email: string; password: string }): Promise<void> {
  const res = await fetch(`${BASE}/api/auth/signup`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(x),
  });
  if (res.status !== 201) throw new Error(`signup failed: ${res.status} ${await res.text()}`);
}

function expect404(name: string, r: { status: number }) {
  checks += 1;
  if (r.status === 404) console.log(`  ✓ ${name} → 404`);
  else {
    failures += 1;
    console.error(`  ✗ ${name} → expected 404, got ${r.status}`);
  }
}
function expect2xx(name: string, r: { status: number; data?: unknown }) {
  checks += 1;
  if (r.status >= 200 && r.status < 300) console.log(`  ✓ ${name} → ${r.status}`);
  else {
    failures += 1;
    console.error(`  ✗ ${name} → expected 2xx, got ${r.status} ${JSON.stringify(r.data).slice(0, 120)}`);
  }
}

console.log("— setup: two throwaway accounts —");
await signup(A);
await signup(B);
const jarA = await login(A.email, A.password);
const jarB = await login(B.email, B.password);
console.log("  ✓ accounts created");

// A owns resources:
const cat = (await api(jarA, "POST", "/api/categories", { name: `A cat ${STAMP}` })).data as { id: string };
const ex = (await api(jarA, "POST", "/api/exercises", { name: `A ex ${STAMP}`, categoryId: cat.id })).data as { id: string };
const workout = (await api(jarA, "POST", "/api/workouts", { date: "2026-09-27" })).data as { id: string };
const we = (await api(jarA, "POST", `/api/workouts/${workout.id}/exercises`, { exerciseId: ex.id })).data as {
  workoutExerciseId: string;
};
const set = (await api(jarA, "POST", `/api/workouts/${workout.id}/exercises/${we.workoutExerciseId}/sets`, {
  type: "NORMAL",
  weight: 60,
  reps: 6,
})).data as { id: string };
const routine = (await api(jarA, "POST", "/api/routines", { name: `A routine ${STAMP}` })).data as { id: string };
const day = (await api(jarA, "POST", `/api/routines/${routine.id}/days`, { name: "Day 1" })).data as { id: string };
const goal = (await api(jarA, "POST", "/api/goals", { name: `A goal ${STAMP}`, metric: "WEIGHT", targetValue: 100, exerciseId: ex.id })).data as { id: string };
const measList = (await api(jarA, "GET", "/api/measurements")).data as { measurements?: Array<{ id: string; name: string }> };
const meas = (measList.measurements ?? []).find((m) => m.name === "Body Weight")!;
const rec = (await api(jarA, "POST", `/api/measurements/${meas.id}/records`, { value: 80 })).data as { id: string };
const group = (await api(jarA, "POST", `/api/workouts/${workout.id}/groups`, { name: "A group" })).data as { id: string };
console.log("  ✓ A's resources created");

console.log("— B cannot read or mutate A's resources (all must 404) —");
expect404("GET    /api/workouts/{A}", await api(jarB, "GET", `/api/workouts/${workout.id}`));
expect404("DELETE /api/workouts/{A}", await api(jarB, "DELETE", `/api/workouts/${workout.id}`));
expect404("PATCH  /api/workouts/{A}", await api(jarB, "PATCH", `/api/workouts/${workout.id}`, { comment: "hijack" }));
expect404("POST   /api/workouts/{A}/copy", await api(jarB, "POST", `/api/workouts/${workout.id}/copy`, { date: "2026-09-28" }));
expect404("POST   /api/workouts/{A}/move", await api(jarB, "POST", `/api/workouts/${workout.id}/move`, { toDate: "2026-09-28" }));
expect404("POST   /api/workouts/{A}/exercises", await api(jarB, "POST", `/api/workouts/${workout.id}/exercises`, { exerciseId: ex.id }));
expect404("PATCH  /api/workouts/{A}/exercises/{A_we}", await api(jarB, "PATCH", `/api/workouts/${workout.id}/exercises/${we.workoutExerciseId}`, { sortOrder: 9 }));
expect404("DELETE /api/workouts/{A}/exercises/{A_we}", await api(jarB, "DELETE", `/api/workouts/${workout.id}/exercises/${we.workoutExerciseId}`));
expect404("POST   /api/workouts/{A}/exercises/{A_we}/sets", await api(jarB, "POST", `/api/workouts/${workout.id}/exercises/${we.workoutExerciseId}/sets`, { type: "NORMAL", weight: 1, reps: 1 }));
expect404("PATCH  /api/workouts/{A}/…/sets/{A_set}", await api(jarB, "PATCH", `/api/workouts/${workout.id}/exercises/${we.workoutExerciseId}/sets/${set.id}`, { weight: 1 }));
expect404("DELETE /api/workouts/{A}/…/sets/{A_set}", await api(jarB, "DELETE", `/api/workouts/${workout.id}/exercises/${we.workoutExerciseId}/sets/${set.id}`));
expect404("PUT    /api/workouts/{A}/exercises/order", await api(jarB, "PUT", `/api/workouts/${workout.id}/exercises/order`, { ids: [we.workoutExerciseId] }));
expect404("PATCH  /api/workouts/{A}/groups/{A_group}", await api(jarB, "PATCH", `/api/workouts/${workout.id}/groups/${group.id}`, { name: "hijack" }));
expect404("DELETE /api/workouts/{A}/groups/{A_group}", await api(jarB, "DELETE", `/api/workouts/${workout.id}/groups/${group.id}`));

expect404("GET    /api/exercises/{A}", await api(jarB, "GET", `/api/exercises/${ex.id}`));
expect404("PATCH  /api/exercises/{A}", await api(jarB, "PATCH", `/api/exercises/${ex.id}`, { name: "hijack" }));
expect404("DELETE /api/exercises/{A}", await api(jarB, "DELETE", `/api/exercises/${ex.id}`));
expect404("GET    /api/exercises/{A}/history", await api(jarB, "GET", `/api/exercises/${ex.id}/history`));
expect404("GET    /api/exercises/{A}/records", await api(jarB, "GET", `/api/exercises/${ex.id}/records`));
expect404("GET    /api/exercises/{A}/graph", await api(jarB, "GET", `/api/exercises/${ex.id}/graph`));
// lastsets scopes by the CALLING user's workout history: B querying A's exercise
// must get an EMPTY answer (no leak of A's sets).
{
  const r = await api(jarB, "GET", `/api/exercises/${ex.id}/lastsets`);
  checks += 1;
  const payload = r.data as { sets?: unknown[]; date?: string | null } | null;
  const empty =
    r.status === 200 && payload && Array.isArray(payload.sets) && payload.sets.length === 0 && payload.date === null;
  if (empty) console.log("  ✓ GET    /api/exercises/{A}/lastsets → 200 with EMPTY data (scoped to caller)");
  else {
    failures += 1;
    console.error(`  ✗ GET    /api/exercises/{A}/lastsets → leaked A's data: ${JSON.stringify(r.data).slice(0, 120)}`);
  }
}

expect404("GET    /api/routines/{A}", await api(jarB, "GET", `/api/routines/${routine.id}`));
expect404("PATCH  /api/routines/{A}", await api(jarB, "PATCH", `/api/routines/${routine.id}`, { name: "hijack" }));
expect404("DELETE /api/routines/{A}", await api(jarB, "DELETE", `/api/routines/${routine.id}`));
expect404("POST   /api/routines/{A}/copy", await api(jarB, "POST", `/api/routines/${routine.id}/copy`, {}));
expect404("PATCH  /api/routines/{A}/days/{A_day}", await api(jarB, "PATCH", `/api/routines/${routine.id}/days/${day.id}`, { name: "hijack" }));
expect404("DELETE /api/routines/{A}/days/{A_day}", await api(jarB, "DELETE", `/api/routines/${routine.id}/days/${day.id}`));
expect404("POST   /api/routines/{A}/days/{A_day}/exercises", await api(jarB, "POST", `/api/routines/${routine.id}/days/${day.id}/exercises`, { exerciseId: ex.id }));

expect404("PATCH  /api/categories/{A}", await api(jarB, "PATCH", `/api/categories/${cat.id}`, { name: "hijack" }));
expect404("DELETE /api/categories/{A}", await api(jarB, "DELETE", `/api/categories/${cat.id}`));

expect404("PATCH  /api/goals/{A}", await api(jarB, "PATCH", `/api/goals/${goal.id}`, { targetValue: 1 }));
expect404("DELETE /api/goals/{A}", await api(jarB, "DELETE", `/api/goals/${goal.id}`));

expect404("PATCH  /api/measurements/{A}", await api(jarB, "PATCH", `/api/measurements/${meas.id}`, { isEnabled: false }));
expect404("DELETE /api/measurements/{A}", await api(jarB, "DELETE", `/api/measurements/${meas.id}`));
expect404("PATCH  /api/measurements/{A}/records/{A_rec}", await api(jarB, "PATCH", `/api/measurements/${meas.id}/records/${rec.id}`, { value: 1 }));
expect404("DELETE /api/measurements/{A}/records/{A_rec}", await api(jarB, "DELETE", `/api/measurements/${meas.id}/records/${rec.id}`));

console.log("— A can still use their own resources (sanity) —");
expect2xx("GET /api/workouts/{A} as A", await api(jarA, "GET", `/api/workouts/${workout.id}`));
expect2xx("GET /api/exercises/{A} as A", await api(jarA, "GET", `/api/exercises/${ex.id}`));
expect2xx("GET /api/goals (list) as A", await api(jarA, "GET", "/api/goals"));

console.log("— unauthenticated access is blocked by the proxy —");
const anon = await fetch(`${BASE}/api/workouts`);
checks += 1;
if (anon.status === 401) console.log("  ✓ anonymous /api/workouts → 401");
else {
  failures += 1;
  console.error(`  ✗ anonymous /api/workouts → expected 401, got ${anon.status}`);
}

console.log("— cleanup —");
expect2xx("delete account A", await api(jarA, "DELETE", "/api/account"));
expect2xx("delete account B", await api(jarB, "DELETE", "/api/account"));

if (failures > 0) {
  console.error(`\n${failures}/${checks} OWNERSHIP CHECKS FAILED`);
  process.exit(1);
}
console.log(`\nAll ${checks} ownership checks passed — user B received 404 for every cross-user access.`);

export {};
