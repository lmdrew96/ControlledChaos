import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { Providers } from "@/components/layout/providers";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "ControlledChaos",
  description:
    "AI-powered ADHD executive function companion. Your brain has the ideas. I'll handle the rest.",
  manifest: "/manifest.json",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "ControlledChaos",
  },
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: dark)", color: "#0a0a0a" },
    { media: "(prefers-color-scheme: light)", color: "#ffffff" },
  ],
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        <Providers>{children}</Providers>
        <script
          dangerouslySetInnerHTML={{
            // updateViaCache:"none" bypasses HTTP cache for sw.js checks so new deploys
            // register promptly. The controllerchange reload auto-applies a new SW
            // mid-session — gated on hadController so it does NOT fire on cold launch
            // (null→SW transition). On iOS standalone PWAs, reloading during the
            // initial controller claim demotes the window into Safari.
            __html: `if("serviceWorker"in navigator){window.addEventListener("load",function(){var h=!!navigator.serviceWorker.controller;navigator.serviceWorker.register("/sw.js",{updateViaCache:"none"});var r=!1;navigator.serviceWorker.addEventListener("controllerchange",function(){if(r||!h)return;r=!0;window.location.reload()})})}`,
          }}
        />
      </body>
    </html>
  );
}
