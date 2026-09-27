import { db } from "../src/lib/db";
import { uuid7 } from "../src/lib/uuid7";
const ROUTINE_ID = "01a0d8be-4850-7ddb-9ae9-b60d136ed08b";
const USER_ID = "01a0d821-88a9-765a-8070-cce64f915b79";
async function main() {
  const days = await db.routineDay.findMany({ where: { routineId: ROUTINE_ID }, orderBy: { sortOrder: "asc" } });
  const day = days[0];
  console.log("day:", day.id, day.name);
  const ex = await db.routineExercise.findMany({ where: { dayId: day.id }, orderBy: { sortOrder: "asc" }, include: { exercise: true } });
  for (const e of ex) console.log(" ", e.sortOrder, e.id, e.exercise.name, "group=", e.groupId);
  const g = await db.routineGroup.create({
    data: { id: uuid7(), userId: USER_ID, routineId: ROUTINE_ID, name: "Compound pair", colour: "#f97316" },
  });
  await db.routineExercise.update({ where: { id: ex[1].id }, data: { groupId: g.id } });
  await db.routineExercise.update({ where: { id: ex[2].id }, data: { groupId: g.id } });
  console.log("group created:", g.id, "members:", ex[1].exercise.name, "+", ex[2].exercise.name);
}
main().catch((e) => { console.error(e); process.exit(1); }).finally(() => db.$disconnect());
