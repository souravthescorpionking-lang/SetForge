import type { NextConfig } from "next";

// Security headers (audit N2). CSP is dev-compatible (Next dev overlay + HMR need
// unsafe-eval and inline scripts). For a hardened production deploy, tighten
// script-src after auditing inline scripts — see README §Security.
const CSP = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline' 'unsafe-eval'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "font-src 'self' data:",
  "connect-src 'self' ws: wss:",
  "worker-src 'self' blob:",
  "service-worker-src 'self' blob:",
  "manifest-src 'self'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
].join("; ");

const nextConfig: NextConfig = {
  output: "standalone",
  // Preview-panel gateway proxies the app from *.space-z.ai origins — allow
  // them for dev /_next/* requests (HMR + chunk fetching) so Turbopack's
  // cross-origin protection never blocks the preview tab.
  allowedDevOrigins: ["*.space-z.ai"],
  // Turbopack dev: the initial compile of this large single-page app spikes
  // RSS to ~2.3GB (measured) — the kernel OOM killer executed next-server
  // during those spikes when system memory was tight. Keep test browsers
  // closed when idle; the limit below is an emergency brake for true leaks,
  // deliberately ABOVE the compile peak so it can never restart-loop.
  experimental: {
    turbopackMemoryLimit: 2600,
  },
  devIndicators: false, // hide the floating dev-tools badge (clean QA screenshots)
  typescript: {
    ignoreBuildErrors: true,
  },
  reactStrictMode: false,
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "Content-Security-Policy", value: CSP },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=(), usb=()" },
          { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" },
        ],
      },
    ];
  },
};

export default nextConfig;
