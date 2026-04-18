import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import WalletProvider from "@/components/WalletProvider";
import { ToastProvider } from "@/components/Toast";
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
  title: "Sealed — AI-Powered B2B Escrow",
  description:
    "Autonomous B2B deal execution with milestone-based escrow on Solana",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} antialiased`}
    >
      <body className="h-screen overflow-hidden">
        <WalletProvider>
          <ToastProvider>{children}</ToastProvider>
        </WalletProvider>
      </body>
    </html>
  );
}
