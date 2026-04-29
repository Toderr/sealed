import type { Metadata, Viewport } from "next";
import { Inter, JetBrains_Mono } from "next/font/google";
import WalletProvider from "@/components/WalletProvider";
import { ToastProvider } from "@/components/Toast";
import "./globals.css";

// Inter Variable. Linear's core typeface, weights 300/400/510/590 required.
// Google Fonts serves Inter as a variable font; the global font-feature-settings
// "cv01","ss03" (applied in globals.css) produce Linear's distinctive letterforms.
const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
  display: "swap",
  axes: ["opsz"],
});

// JetBrains Mono: open substitute for Berkeley Mono. Used only for code,
// addresses, deal IDs, and numeric data where tabular figures matter.
const jetbrainsMono = JetBrains_Mono({
  variable: "--font-mono-custom",
  subsets: ["latin"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "Sealed Agent: AI-powered escrow on Solana",
  description:
    "Autonomous B2B deal execution with milestone-based escrow on Solana.",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 5,
  themeColor: "#0D1117",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${inter.variable} ${jetbrainsMono.variable} antialiased`}
    >
      <body className="min-h-screen">
        <WalletProvider>
          <ToastProvider>{children}</ToastProvider>
        </WalletProvider>
      </body>
    </html>
  );
}
