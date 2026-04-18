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
  onOpenSettings,
}: {
  activeTab: "chat" | "deals";
  onTabChange: (tab: "chat" | "deals") => void;
  onOpenSettings: () => void;
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
      <div className="flex items-center gap-2">
        <button
          onClick={onOpenSettings}
          className="w-10 h-10 rounded-lg text-muted hover:text-foreground hover:bg-background transition-colors flex items-center justify-center"
          aria-label="Open agent settings"
          title="Agent settings"
        >
          <svg
            width="18"
            height="18"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <circle cx="12" cy="12" r="3" />
            <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" />
          </svg>
        </button>
        <WalletMultiButton />
      </div>
    </header>
  );
}
