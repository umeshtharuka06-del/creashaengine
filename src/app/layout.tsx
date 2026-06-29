import type { Metadata, Viewport } from "next";
import { Sora, Oxanium } from "next/font/google";
import "./globals.css";
import { UserProvider } from "@/lib/user-context";
import { TopBar } from "@/components/TopBar";
import { BottomNav } from "@/components/BottomNav";
import { AppFrame } from "@/components/AppFrame";

// Premium gaming typography that matches the bold Mega 99 logo:
//  • Oxanium — chunky, techy display face for the brand, headings, numbers.
//  • Sora — clean, highly readable geometric face for body copy.
const display = Oxanium({
  subsets: ["latin"],
  weight: ["500", "600", "700", "800"],
  variable: "--font-display",
  display: "swap",
});
const body = Sora({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700", "800"],
  variable: "--font-body",
  display: "swap",
});

const SITE = "https://mega99.app";

export const metadata: Metadata = {
  metadataBase: new URL(SITE),
  title: {
    default: "Mega 99 — Colour Prediction & Crash",
    template: "%s · Mega 99",
  },
  description:
    "Mega 99 — a premium, mobile-first colour prediction gaming platform. Play Parity, Sapre, Bcone, Emerd and Crash with instant rounds and fast payouts.",
  applicationName: "Mega 99",
  manifest: "/manifest.webmanifest",
  icons: {
    icon: [
      { url: "/favicon.ico", sizes: "any" },
      { url: "/icons/icon-16.png", sizes: "16x16", type: "image/png" },
      { url: "/icons/icon-32.png", sizes: "32x32", type: "image/png" },
      { url: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
      { url: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
    apple: [{ url: "/icons/icon-180.png", sizes: "180x180", type: "image/png" }],
  },
  openGraph: {
    type: "website",
    siteName: "Mega 99",
    title: "Mega 99 — Colour Prediction & Crash",
    description:
      "Play Parity, Sapre, Bcone, Emerd and Crash on Mega 99 — premium colour prediction gaming.",
    url: SITE,
    images: [{ url: "/icons/icon-512.png", width: 512, height: 512, alt: "Mega 99" }],
  },
  twitter: {
    card: "summary_large_image",
    title: "Mega 99 — Colour Prediction & Crash",
    description: "Premium colour prediction gaming — Parity, Sapre, Bcone, Emerd & Crash.",
    images: ["/icons/icon-512.png"],
  },
};

export const viewport: Viewport = {
  themeColor: "#0b0e16",
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${display.variable} ${body.variable}`}>
      <body>
        <UserProvider>
          <TopBar />
          <AppFrame>{children}</AppFrame>
          <BottomNav />
        </UserProvider>
      </body>
    </html>
  );
}
