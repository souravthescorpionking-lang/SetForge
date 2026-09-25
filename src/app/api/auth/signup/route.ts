import { NextRequest, NextResponse } from "next/server";
import { handler, parseBody, rateLimit, clientIp } from "@/server/http";
import { signupSchema } from "@/lib/schemas";
import { signup, createSession, getUserWithSettings } from "@/server/services/auth-service";
import { sessionCookieOptions } from "@/server/auth";

export const POST = handler(async (req: NextRequest) => {
  rateLimit(`signup:${clientIp(req)}`);
  const body = await parseBody(req, signupSchema);
  const user = await signup(body);
  const { token, expiresAt } = await createSession(user.id);
  const payload = await getUserWithSettings(user.id);
  const res = NextResponse.json(payload, { status: 201 });
  res.cookies.set({ ...sessionCookieOptions(expiresAt), value: token });
  return res;
});
