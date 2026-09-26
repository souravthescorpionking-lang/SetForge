import { NextRequest, NextResponse } from "next/server";
import { handler, parseBody, rateLimit, clientIp } from "@/server/http";
import { loginSchema } from "@/lib/schemas";
import { login, createSession, getUserWithSettings } from "@/server/services/auth-service";
import { sessionCookieOptions } from "@/server/auth";

export const POST = handler(async (req: NextRequest) => {
  rateLimit(`login:${clientIp(req)}`);
  const body = await parseBody(req, loginSchema);
  const user = await login(body);
  const { token, expiresAt } = await createSession(user.id);
  const payload = await getUserWithSettings(user.id);
  const res = NextResponse.json(payload);
  res.cookies.set({ ...sessionCookieOptions(expiresAt), value: token });
  return res;
});
