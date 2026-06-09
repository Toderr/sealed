// Fake escrow ledger for local no-blockchain dev mode (MOCK_CHAIN).
//
// Mirrors the on-chain state machine in programs/escrow/src/state.rs so the UI
// states match exactly. Persists a per-browser ledger + fake USDC balances in
// localStorage. All amounts are in USDC lamports (6 decimals), matching the
// on-chain representation.

const LEDGER_KEY = "mock:escrow:ledger";
const BAL_KEY = "mock:usdc:balances";

// Every dev wallet starts rich so funding always succeeds.
const START_BALANCE = 1_000_000 * 1_000_000; // 1,000,000 USDC in lamports

export type MockDealStatus =
  | "Created"
  | "Funded"
  | "InProgress"
  | "Completed"
  | "Refunded";

export interface MockDeal {
  dealId: string;
  fundedAmount: number;
  releasedAmount: number;
  totalAmount: number;
  status: MockDealStatus;
  fundedAt: number; // unix seconds; 0 = not yet fully funded
}

function load<T>(key: string, fallback: T): T {
  if (typeof window === "undefined") return fallback;
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

function save(key: string, value: unknown): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // localStorage unavailable; ledger is best-effort in dev.
  }
}

function nowSec(): number {
  return Math.floor(Date.now() / 1000);
}

export const mockEscrow = {
  fakeSig(label: string): string {
    return `mock-tx-${label}-${nowSec()}`;
  },

  // --- USDC balances ---

  balanceOf(owner: string): number {
    const bals = load<Record<string, number>>(BAL_KEY, {});
    return owner in bals ? bals[owner] : START_BALANCE;
  },

  setBalance(owner: string, lamports: number): void {
    const bals = load<Record<string, number>>(BAL_KEY, {});
    bals[owner] = Math.max(0, lamports);
    save(BAL_KEY, bals);
  },

  // --- Deal ledger ---

  getDeal(dealId: string): MockDeal | undefined {
    return load<Record<string, MockDeal>>(LEDGER_KEY, {})[dealId];
  },

  putDeal(deal: MockDeal): void {
    const all = load<Record<string, MockDeal>>(LEDGER_KEY, {});
    all[deal.dealId] = deal;
    save(LEDGER_KEY, all);
  },

  // --- State transitions (mirror the Anchor program) ---

  createDeal(dealId: string, totalAmount: number): string {
    if (!this.getDeal(dealId)) {
      this.putDeal({
        dealId,
        fundedAmount: 0,
        releasedAmount: 0,
        totalAmount,
        status: "Created",
        fundedAt: 0,
      });
    }
    return this.fakeSig("create");
  },

  fundEscrow(dealId: string, buyer: string, amount: number, totalAmount?: number): string {
    const deal: MockDeal =
      this.getDeal(dealId) ?? {
        dealId,
        fundedAmount: 0,
        releasedAmount: 0,
        totalAmount: totalAmount ?? amount,
        status: "Created",
        fundedAt: 0,
      };
    if (this.balanceOf(buyer) < amount) {
      throw new Error("MOCK: insufficient USDC balance");
    }
    this.setBalance(buyer, this.balanceOf(buyer) - amount);
    deal.fundedAmount += amount;
    if (deal.fundedAmount >= deal.totalAmount) {
      deal.status = "Funded";
      deal.fundedAt = nowSec();
    }
    this.putDeal(deal);
    return this.fakeSig("fund");
  },

  releaseMilestone(
    dealId: string,
    seller: string,
    amount: number,
    allReleased: boolean
  ): string {
    const deal = this.getDeal(dealId);
    if (!deal) throw new Error("MOCK: deal not found");
    if (deal.releasedAmount + amount > deal.fundedAmount) {
      throw new Error("MOCK: release exceeds funded amount");
    }
    this.setBalance(seller, this.balanceOf(seller) + amount);
    deal.releasedAmount += amount;
    deal.status = allReleased ? "Completed" : "InProgress";
    this.putDeal(deal);
    return this.fakeSig("release");
  },

  refund(dealId: string, buyer: string): string {
    const deal = this.getDeal(dealId);
    if (!deal) throw new Error("MOCK: deal not found");
    const remaining = deal.fundedAmount - deal.releasedAmount;
    if (remaining > 0) {
      this.setBalance(buyer, this.balanceOf(buyer) + remaining);
    }
    deal.status = "Refunded";
    this.putDeal(deal);
    return this.fakeSig("refund");
  },

  // Dev time-warp: backdate fundedAt past the 30-day timeout so
  // buyer_timeout_refund is testable without waiting.
  timeWarp(dealId: string): void {
    const deal = this.getDeal(dealId);
    if (deal) {
      deal.fundedAt = nowSec() - 31 * 24 * 60 * 60;
      this.putDeal(deal);
    }
  },
};
