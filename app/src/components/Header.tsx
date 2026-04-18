"use client";

import dynamic from "next/dynamic";
import { SealedMark } from "@/components/SealedLogo";

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
    <header className="flex items-center justify-between px-4 sm:px-6 h-14 border-b border-card-border-subtle bg-panel">
      <div className="flex items-center gap-6">
        <div className="flex items-center gap-2 text-primary">
          <SealedMark size={26} title="Sealed" />
          <span
            className="text-[15px] font-medium tracking-tight"
            style={{ fontWeight: 510 }}
          >
            Sealed
          </span>
        </div>
        <nav className="flex items-center gap-0.5" aria-label="Main">
          <NavTab
            active={activeTab === "chat"}
            onClick={() => onTabChange("chat")}
          >
            New Deal
          </NavTab>
          <NavTab
            active={activeTab === "deals"}
            onClick={() => onTabChange("deals")}
          >
            My Deals
          </NavTab>
        </nav>
      </div>
      <div className="flex items-center gap-2">
        <button
          onClick={onOpenSettings}
          className="h-9 w-9 rounded-lg text-muted hover:text-primary hover:bg-[rgba(255,255,255,0.04)] transition-colors flex items-center justify-center"
          aria-label="Open agent settings"
          title="Agent settings"
        >
          <svg
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.8"
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

function NavTab({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      aria-current={active ? "page" : undefined}
      className={`px-3 h-8 text-[13px] rounded-md transition-colors ${
        active
          ? "bg-[rgba(255,255,255,0.05)] text-primary"
          : "text-muted hover:text-primary"
      }`}
      style={{ fontWeight: 510 }}
    >
      {children}
    </button>
  );
}
