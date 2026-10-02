import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { Toaster } from "@/components/ui/sonner";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: {
    default: "SetForge — Workout Tracker",
    template: "%s · SetForge",
  },
  description:
    "SetForge is a multi-user workout tracker: log sets, chase PRs, build routines, track body measurements, and analyse every rep — online or offline.",
  applicationName: "SetForge",
  manifest: "/manifest.webmanifest",
  icons: {
    icon: [
      { url: "/icons/icon.svg", type: "image/svg+xml" },
      { url: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
    ],
    apple: "/icons/icon-192.png",
  },
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "SetForge",
  },
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#fafaf9" },
    { media: "(prefers-color-scheme: dark)", color: "#141210" },
  ],
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        {/*
          Pre-React boot recovery (hotfix-recovery-4). ChunkRecovery only
          exists AFTER React mounts — but when a stale service-worker shell
          (or a mid-recompile page) references dead /_next/ chunk URLs, the
          app scripts fail to load and React NEVER boots, leaving the tab
          permanently dead until a manual refresh. This tiny vanilla script
          runs before any app code: it captures resource-load failures on
          /_next/ assets, waits for the dev server to answer a HEAD probe,
          then reloads once per 30s window (same loop-guard key as
          ChunkRecovery, so the layers never double-reload).
        */}
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){try{
var KEY="sf.chunk.reload.at";
function recent(){try{var t=Number(sessionStorage.getItem(KEY));return isFinite(t)&&Date.now()-t<3e4}catch(e){return false}}
function up(){return fetch(location.pathname||"/",{method:"HEAD",cache:"no-store"}).then(function(){return true}).catch(function(){return false})}
var armed=false;
function recover(src){if(armed||recent())return;armed=true;try{sessionStorage.setItem(KEY,String(Date.now()))}catch(e){}
var n=0;(function poll(){up().then(function(ok){if(ok){location.reload();return}if(++n<20)setTimeout(poll,3e3)})})();}
window.addEventListener("error",function(e){try{
var t=e.target;
if(t&&t.tagName==="SCRIPT"&&t.src&&String(t.src).indexOf("/_next/")!==-1)recover(t.src);
if(t&&t.tagName==="LINK"&&t.href&&String(t.href).indexOf("/_next/")!==-1)recover(t.href);
}catch(err){}},true);
}catch(e){}})();`,
          }}
        />
      </head>
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased bg-background text-foreground`}
      >
        {children}
        <Toaster position="top-center" richColors closeButton />
      </body>
    </html>
  );
}
