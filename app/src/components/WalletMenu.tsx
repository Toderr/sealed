"use client";

// N5 — clickable wallet chip in the app header.
//
// The header used to render a static, non-interactive pill (or the default
// wallet-adapter dropdown) showing the wallet. This is a shared menu used across
// headers: profile link, copy address, view the account on the Solana explorer,
// switch wallet (real mode only), and disconnect. Username is preferred over the
// raw wallet in the label so the header reads "@alice", not a base58 blob.

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useAppWallet as useWallet } from "@/lib/use-app-wallet";
import { useSwitchWallet } from "@/lib/use-switch-wallet";
import { useProfileStore } from "@/lib/profile-store";
import { atDisplayHandle } from "@/lib/user-display";
import { shortenAddress } from "@/lib/types";
import { useToast } from "@/components/Toast";

// Cluster-aware explorer URL for an account address. Mirrors the cluster logic
// in escrow-client.getUsdcMint(): mainnet if the RPC URL says so, else devnet.
function explorerAddressUrl(address: string): string {
  const rpc = process.env.NEXT_PUBLIC_RPC_URL ?? "";
  const cluster = rpc.includes("mainnet") ? "" : "?cluster=devnet";
  return `https://explorer.solana.com/address/${address}${cluster}`;
}

export default function WalletMenu() {
  const router = useRouter();
  const toast = useToast();
  const { publicKey, disconnect } = useWallet();
  const { canSwitch, switchWallet } = useSwitchWallet();
  const wallet = publicKey?.toBase58() ?? null;
  const { profile } = useProfileStore(wallet);

  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  // Close on outside click / Escape.
  useEffect(() => {
    if (!open) return;
    const onPointer = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  if (!wallet) return null;

  const initials = profile?.name
    ? profile.name
        .split(" ")
        .slice(0, 2)
        .map((w) => w[0])
        .join("")
        .toUpperCase()
    : null;
  const label = atDisplayHandle(profile?.username) ?? profile?.name ?? "Profile";

  const copyAddress = async () => {
    try {
      await navigator.clipboard.writeText(wallet);
      toast.show({ variant: "success", title: "Address copied" });
    } catch {
      toast.show({ variant: "error", title: "Couldn’t copy address" });
    }
    setOpen(false);
  };

  const handleDisconnect = async () => {
    setOpen(false);
    try {
      await disconnect();
    } catch {
      /* adapter surfaces its own error toast; nothing to do here */
    }
  };

  const handleSwitch = async () => {
    setOpen(false);
    await switchWallet();
  };

  return (
    <div ref={rootRef} style={{ position: "relative" }}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: 8,
          height: 30,
          padding: "0 10px",
          borderRadius: 6,
          background: open ? "rgba(255,255,255,0.05)" : "rgba(255,255,255,0.02)",
          border: "1px solid var(--card-border)",
          cursor: "pointer",
          transition: "background-color 120ms ease-out",
        }}
      >
        <span
          style={{
            width: 18,
            height: 18,
            borderRadius: "50%",
            background: initials ? "linear-gradient(135deg, #5e6ad2, #7170ff)" : "var(--surface)",
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: 10,
            fontWeight: 590,
            color: "#fff",
          }}
        >
          {initials ?? "?"}
        </span>
        <span
          style={{
            fontSize: 12,
            color: "var(--muted)",
            maxWidth: 120,
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
          }}
        >
          {label}
        </span>
        <svg
          width="12"
          height="12"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          style={{ color: "var(--subtle)", transform: open ? "rotate(180deg)" : "none", transition: "transform 120ms ease-out" }}
        >
          <polyline points="6 9 12 15 18 9" />
        </svg>
      </button>

      {open && (
        <div
          role="menu"
          style={{
            position: "absolute",
            top: "calc(100% + 6px)",
            right: 0,
            minWidth: 216,
            background: "var(--surface)",
            border: "1px solid var(--card-border)",
            borderRadius: 10,
            boxShadow: "var(--shadow-dialog)",
            padding: 6,
            zIndex: 50,
          }}
        >
          <div style={{ padding: "6px 8px 8px" }}>
            <div style={{ fontSize: 12, color: "var(--primary)", fontWeight: 590, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {label}
            </div>
            <div style={{ fontSize: 11, color: "var(--subtle)", marginTop: 2, fontVariantNumeric: "tabular-nums" }}>
              {shortenAddress(wallet)}
            </div>
          </div>
          <div style={{ height: 1, background: "var(--card-border-subtle)", margin: "2px 0 4px" }} />

          <MenuItem
            onClick={() => {
              setOpen(false);
              router.push(`/profile/${wallet}`);
            }}
            icon={
              <>
                <circle cx="12" cy="8" r="4" />
                <path d="M4 20c0-4 4-6 8-6s8 2 8 6" />
              </>
            }
            label="Profile"
          />
          <MenuItem
            onClick={copyAddress}
            icon={
              <>
                <rect x="9" y="9" width="11" height="11" rx="2" />
                <path d="M5 15V5a2 2 0 0 1 2-2h10" />
              </>
            }
            label="Copy address"
          />
          <a
            href={explorerAddressUrl(wallet)}
            target="_blank"
            rel="noopener noreferrer"
            onClick={() => setOpen(false)}
            role="menuitem"
            style={menuItemStyle}
            onMouseEnter={(e) => (e.currentTarget.style.background = "var(--surface-hover)")}
            onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" style={{ color: "var(--muted)" }}>
              <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
              <polyline points="15 3 21 3 21 9" />
              <line x1="10" y1="14" x2="21" y2="3" />
            </svg>
            View on explorer
          </a>
          {canSwitch && (
            <MenuItem
              onClick={handleSwitch}
              icon={
                <>
                  <polyline points="17 1 21 5 17 9" />
                  <path d="M3 11V9a4 4 0 0 1 4-4h14" />
                  <polyline points="7 23 3 19 7 15" />
                  <path d="M21 13v2a4 4 0 0 1-4 4H3" />
                </>
              }
              label="Switch wallet"
            />
          )}
          <div style={{ height: 1, background: "var(--card-border-subtle)", margin: "4px 0" }} />
          <MenuItem
            onClick={handleDisconnect}
            danger
            icon={
              <>
                <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
                <polyline points="16 17 21 12 16 7" />
                <line x1="21" y1="12" x2="9" y2="12" />
              </>
            }
            label="Disconnect"
          />
        </div>
      )}
    </div>
  );
}

const menuItemStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 9,
  width: "100%",
  padding: "7px 8px",
  borderRadius: 6,
  fontSize: 12.5,
  color: "var(--foreground)",
  background: "transparent",
  border: 0,
  cursor: "pointer",
  textAlign: "left",
  textDecoration: "none",
  transition: "background-color 100ms ease-out",
};

function MenuItem({
  onClick,
  icon,
  label,
  danger,
}: {
  onClick: () => void;
  icon: React.ReactNode;
  label: string;
  danger?: boolean;
}) {
  return (
    <button
      type="button"
      role="menuitem"
      onClick={onClick}
      style={{ ...menuItemStyle, color: danger ? "var(--danger, #f26d6d)" : menuItemStyle.color }}
      onMouseEnter={(e) => (e.currentTarget.style.background = "var(--surface-hover)")}
      onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
    >
      <svg
        width="14"
        height="14"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
        style={{ color: danger ? "inherit" : "var(--muted)", flexShrink: 0 }}
      >
        {icon}
      </svg>
      {label}
    </button>
  );
}
