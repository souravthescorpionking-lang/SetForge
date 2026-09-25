import { NextResponse } from "next/server";
import { handler } from "@/server/http";
import { destroySession } from "@/server/auth";
import { SESSION_COOKIE } from "@/lib/constants";

export const POST = handler(async () => {
  await destroySession();
  const res = NextResponse.json({ ok: true });
  res.cookies.set({ name: SESSION_COOKIE, value: "", path: "/", expires: new Date(0) });
  return res;
});
