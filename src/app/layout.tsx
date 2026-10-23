import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { Toaster as Sonner } from "@/components/ui/sonner";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Keno Lab — Server-Authoritative Keno",
  description:
    "A premium dark arcade Keno with a CSPRNG Fisher-Yates draw, versioned paytables, idempotent ledger, transparency center, and an interactive probability lab.",
  keywords: [
    "Keno",
    "Keno Lab",
    "Game Engine",
    "TypeScript",
    "Next.js",
    "Server-Authoritative",
    "Fisher-Yates",
    "Hypergeometric",
    "Provably Fair",
  ],
  authors: [{ name: "Keno Lab" }],
};

/**
 * Inline boot script — runs before first paint to:
 * 1. Apply the saved Keno theme (midnight / emerald / slate) from localStorage.
 * 2. Apply reduced-motion preference from localStorage.
 * This prevents a flash of the default theme on reload.
 */
const themeBootScript = `(function(){try{var t=localStorage.getItem('keno-theme')||'midnight';var d=document.documentElement;d.classList.add('dark');d.setAttribute('data-keno-theme',t);var rm=localStorage.getItem('keno-reduced-motion');if(rm==='1'){d.classList.add('reduce-motion');}}catch(e){document.documentElement.classList.add('dark');document.documentElement.setAttribute('data-keno-theme','midnight');}})();`;

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="dark" data-keno-theme="midnight" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeBootScript }} />
      </head>
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased bg-background text-foreground`}
      >
        {children}
        <Sonner
          position="top-center"
          toastOptions={{
            classNames: {
              toast:
                "bg-popover text-popover-foreground border-border",
            },
          }}
        />
      </body>
    </html>
  );
}
