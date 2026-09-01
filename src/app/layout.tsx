import type { Metadata, Viewport } from "next";
import { Bricolage_Grotesque, Instrument_Sans } from "next/font/google";
import "./globals.css";

/**
 * Two faces, self-hosted by next/font so there's no render-blocking CDN request
 * and no layout shift. Bricolage carries the headings and the big score
 * figures; Instrument Sans does the reading.
 */
const display = Bricolage_Grotesque({
  subsets: ["latin"],
  display: "swap",
  variable: "--f-display",
});

const sans = Instrument_Sans({
  subsets: ["latin"],
  display: "swap",
  variable: "--f-sans",
});

export const metadata: Metadata = {
  title: "LifeScore",
  description: "Say what you did. Get a fair score. Compete with your people.",
  icons: { icon: "/favicon.svg" },
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#faf9f7" },
    { media: "(prefers-color-scheme: dark)", color: "#0c0c0e" },
  ],
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

// Runs before first paint so a saved theme never flashes the wrong colours.
const THEME_SCRIPT = `try{var t=localStorage.getItem("ls-theme");if(t)document.documentElement.dataset.theme=t}catch(e){}`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${display.variable} ${sans.variable}`} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_SCRIPT }} />
      </head>
      <body className="min-h-dvh antialiased">{children}</body>
    </html>
  );
}
