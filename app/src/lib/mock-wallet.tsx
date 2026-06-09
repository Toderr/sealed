"use client";

// Fake wallet context for local no-blockchain dev mode (MOCK_CHAIN).
//
// Mirrors the slice of @solana/wallet-adapter-react's useWallet() that the app
// actually uses: { publicKey, connected, signTransaction }. Auto-connected, so
// the "Select Wallet" button never renders. Includes a floating buyer/seller
// switcher so a single browser tab can drive both sides of the full deal flow.

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import { PublicKey, Transaction, VersionedTransaction } from "@solana/web3.js";

const ROLE_KEY = "mock:wallet:role";

function readStoredRole(): MockRole {
  if (typeof window === "undefined") return "buyer";
  const stored = localStorage.getItem(ROLE_KEY);
  return stored === "seller" ? "seller" : "buyer";
}

// Two deterministic dev identities. Generated from real ed25519 keypairs so the
// pubkeys are ON-CURVE — required for getAssociatedTokenAddress() not to throw
// TokenOwnerOffCurveError. (We only keep the public keys; nothing signs for real.)
export const MOCK_IDENTITIES = {
  buyer: new PublicKey("8NY8GM9JbDcNo9RxmbYd7SKj5EWEVs8syKfzE1MzB6VR"),
  seller: new PublicKey("tLscLXfmj1DG2e1enuso9GJ84WdiA9hL947eVJoKmjY"),
} as const;

export type MockRole = "buyer" | "seller";

// Shape-compatible with the parts of WalletContextState the app consumes.
type SignableTx = Transaction | VersionedTransaction;

interface MockWalletContextValue {
  publicKey: PublicKey;
  connected: boolean;
  connecting: boolean;
  disconnecting: boolean;
  role: MockRole;
  setRole: (r: MockRole) => void;
  signTransaction: <T extends SignableTx>(tx: T) => Promise<T>;
  signAllTransactions: <T extends SignableTx>(txs: T[]) => Promise<T[]>;
  signMessage: (message: Uint8Array) => Promise<Uint8Array>;
  disconnect: () => Promise<void>;
}

const MockWalletContext = createContext<MockWalletContextValue | null>(null);

export function MockWalletProvider({ children }: { children: React.ReactNode }) {
  // Start "buyer" for a stable SSR/first-client render, then hydrate from
  // localStorage on mount to avoid a hydration mismatch.
  const [role, setRoleState] = useState<MockRole>("buyer");

  useEffect(() => {
    const stored = readStoredRole();
    if (stored !== role) setRoleState(stored);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const setRole = useCallback((r: MockRole) => {
    setRoleState(r);
    if (typeof window !== "undefined") {
      try {
        localStorage.setItem(ROLE_KEY, r);
      } catch {
        /* best-effort */
      }
    }
  }, []);

  const publicKey = MOCK_IDENTITIES[role];

  // No-op signers: in mock mode nothing is ever broadcast, so we just echo back.
  const signTransaction = useCallback(
    async <T extends SignableTx>(tx: T) => tx,
    []
  );
  const signAllTransactions = useCallback(
    async <T extends SignableTx>(txs: T[]) => txs,
    []
  );
  const signMessage = useCallback(
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    async (message: Uint8Array) => new Uint8Array(64),
    []
  );
  const disconnect = useCallback(async () => {}, []);

  const value = useMemo<MockWalletContextValue>(
    () => ({
      publicKey,
      connected: true,
      connecting: false,
      disconnecting: false,
      role,
      setRole,
      signTransaction,
      signAllTransactions,
      signMessage,
      disconnect,
    }),
    [
      publicKey,
      role,
      setRole,
      signTransaction,
      signAllTransactions,
      signMessage,
      disconnect,
    ]
  );

  return (
    <MockWalletContext.Provider value={value}>
      {children}
      <MockRoleSwitcher />
    </MockWalletContext.Provider>
  );
}

export function useMockWallet(): MockWalletContextValue {
  const ctx = useContext(MockWalletContext);
  if (!ctx) {
    throw new Error("useMockWallet must be used within <MockWalletProvider>");
  }
  return ctx;
}

// Floating dev-only buyer/seller toggle, bottom-left. Lets one tab play both
// parties without two wallets/browsers.
function MockRoleSwitcher() {
  const { role, setRole, publicKey } = useMockWallet();
  return (
    <div
      style={{
        position: "fixed",
        bottom: 12,
        left: 12,
        zIndex: 9999,
        display: "flex",
        alignItems: "center",
        gap: 6,
        background: "#15151b",
        border: "1px solid #2c2c38",
        borderRadius: 10,
        padding: "6px 8px",
        fontSize: 12,
        fontFamily: "ui-monospace, monospace",
        boxShadow: "0 4px 16px rgba(0,0,0,0.4)",
      }}
      title={`Mock wallet — ${publicKey.toBase58()}`}
    >
      <span style={{ color: "#f5a623", fontWeight: 600, letterSpacing: "0.04em" }}>
        MOCK
      </span>
      {(["buyer", "seller"] as const).map((r) => (
        <button
          key={r}
          onClick={() => setRole(r)}
          style={{
            padding: "3px 12px",
            borderRadius: 6,
            border: 0,
            cursor: "pointer",
            background: role === r ? "#7170ff" : "transparent",
            color: role === r ? "#fff" : "#9a9aa8",
            fontWeight: role === r ? 600 : 400,
            textTransform: "capitalize",
          }}
        >
          {r}
        </button>
      ))}
    </div>
  );
}
