"use client";

import dynamic from "next/dynamic";

const WalletMultiButton = dynamic(
  () =>
    import("@solana/wallet-adapter-react-ui").then(
      (mod) => mod.WalletMultiButton
    ),
  { ssr: false }
);

export default function Header({
  activeTab,
  onTabChange,
}: {
  activeTab: "chat" | "deals";
  onTabChange: (tab: "chat" | "deals") => void;
}) {
  return (
    <header className="flex items-center justify-between px-6 py-3 border-b border-card-border bg-card">
      <div className="flex items-center gap-8">
        <h1 className="text-lg font-semibold tracking-tight">
          <span className="text-accent">Sealed</span>
        </h1>
        <nav className="flex gap-1">
          <button
            onClick={() => onTabChange("chat")}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
              activeTab === "chat"
                ? "bg-accent/15 text-accent"
                : "text-muted hover:text-foreground"
            }`}
          >
            New Deal
          </button>
          <button
            onClick={() => onTabChange("deals")}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
              activeTab === "deals"
                ? "bg-accent/15 text-accent"
                : "text-muted hover:text-foreground"
            }`}
          >
            My Deals
          </button>
        </nav>
      </div>
      <WalletMultiButton />
    </header>
  );
}
