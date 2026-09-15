import type { Metadata, Viewport } from "next";
import { Alegreya_Sans, IM_Fell_English } from "next/font/google";
import { SettingsHydrator } from "@/components/providers/SettingsHydrator";
import { site } from "@/config/site";
import "./globals.css";

// Fell types: 17th-century Oxford printing faces, revived. Display only.
const fell = IM_Fell_English({
  variable: "--font-fell",
  weight: "400",
  style: ["normal", "italic"],
  subsets: ["latin"],
});

// Humanist sans with calligraphic roots; reads cleanly at small UI sizes.
const alegreyaSans = Alegreya_Sans({
  variable: "--font-alegreya-sans",
  // Only the weights in use: every weight is a separate preloaded file.
  weight: ["400", "500"],
  subsets: ["latin"],
});

export const metadata: Metadata = {
  metadataBase: new URL(site.url),
  title: { default: `${site.name} | ${site.tagline}`, template: `%s | ${site.name}` },
  description: site.description,
  applicationName: site.name,
  openGraph: {
    siteName: site.name,
    type: "website",
    locale: "en_GB",
  },
};

export const viewport: Viewport = {
  themeColor: "#0b0d12",
  colorScheme: "dark",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en-GB" className={`${fell.variable} ${alegreyaSans.variable}`}>
      <body className="flex min-h-dvh flex-col">
        <a
          href="#main"
          className="sr-only z-50 bg-night px-4 py-3 text-parchment focus:not-sr-only focus:fixed focus:top-3 focus:left-3"
        >
          Skip to content
        </a>
        <SettingsHydrator />
        {children}
      </body>
    </html>
  );
}
