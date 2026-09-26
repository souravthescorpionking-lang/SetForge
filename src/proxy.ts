// Next.js 16 "proxy" (formerly middleware) — API guard + fast 401s.
import { NextRequest, NextResponse } from "next/server";
import { SESSION_COOKIE } from "@/lib/constants";

const EXEMPT = [
  "/api/health",
  "/api/auth/login",
  "/api/auth/signup",
  "/api/auth/logout",
  "/api/auth/session",
  "/api/auth/reset",
];

export default function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl;
  if (pathname.startsWith("/api") && !EXEMPT.some((p) => pathname === p || pathname.startsWith(p + "/"))) {
    const hasSession = req.cookies.has(SESSION_COOKIE);
    if (!hasSession) {
      return NextResponse.json(
        { error: { code: "UNAUTHORIZED", message: "Authentication required" } },
        { status: 401 },
      );
    }
  }
  return NextResponse.next();
}

export const config = {
  matcher: ["/api/:path*"],
};
