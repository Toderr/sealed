# Sealed Architecture

Forward-compatible design covering current Step 1-4 work + future Scout agents.

## Agent Role System

Not hardcoded "buyer/seller". Role-based, so new roles plug in without rewrite.

```ts
enum AgentRole {
  Structurer     = "structurer",      // parse NL → deal params (current)
  Negotiator     = "negotiator",      // counter-propose on behalf of party (Step 2)
  Verifier       = "verifier",        // review milestone proof (Step 4)
  PurchasingScout = "purchasing_scout", // FUTURE: finds sellers matching criteria
  SalesScout     = "sales_scout",     // FUTURE: finds buyers matching criteria
}

type AgentConfig = {
  role: AgentRole;
  wallet: PublicKey;                  // identity = owner's wallet
  memoryRef: string;                  // ref to BusinessMemory (Step 1)
  systemPromptTemplate: string;       // role-specific
  tools: ToolName[];                  // what tools this role can call
  constraints: AgentConstraints;      // budget, risk, red-lines
};
```

Each role gets its own prompt template + tool allowlist. Adding Scout later = new prompt + new tools, no engine rewrite.

## Data Model

### Current (Step 1-4)

```ts
// Step 1: Business Memory (per wallet, localStorage → later Supabase)
type BusinessMemory = {
  walletAddress: string;
  completedDeals: number;
  avgDealSize: number;
  typicalMilestoneCount: number;
  negotiationStyle: "aggressive" | "cooperative" | "conservative";
  preferences: {
    paymentTerms: string[];
    minDealSize: number;
    redLines: string[];               // deal-breakers
  };

  // FORWARD-COMPAT fields (empty until Scout update)
  sourcingProfile?: SourcingProfile;  // what I want to buy
  salesProfile?: SalesProfile;        // what I want to sell
  activeListings?: string[];          // listing IDs
  reputationScore?: number;
};

// Step 2: Negotiation
type Proposal = {
  id: string;
  origin: ProposalOrigin;             // "manual" | "scout_matched" (future)
  buyerWallet: string;
  sellerWallet: string;
  revisions: Revision[];
  status: "negotiating" | "agreed" | "rejected" | "expired" | "escalated";
  finalTerms?: DealParams;
  summary?: NegotiationSummary;
};

type Revision = {
  by: AgentRole;
  onBehalfOf: "buyer" | "seller";
  proposedTerms: DealParams;
  reasoning: string;
  concessions: string[];
  timestamp: number;
};

// Step 3: Summary
type NegotiationSummary = {
  pros: string[];
  cons: string[];
  keyConcessions: { party, item, rationale }[];
  riskFlags: string[];
  confidenceScore: number;            // 0-1
  dualSignRequired: boolean;
};

// Step 4: Proof
type MilestoneProof = {
  milestoneIndex: number;
  proofType: "file" | "url" | "oracle";
  proofData: string;                  // IPFS hash | URL | oracle ref
  verifierReview?: {
    confidence: number;
    notes: string;
    recommendation: "approve" | "reject" | "request_clarification";
  };
};
```

### Identity, Reputation, and Discovery

```ts
type PublicProfile = {
  handle: string | null;              // public username, preferred over wallet display
  display_name: string | null;
  deals_total: number;
  deals_successful: number;
  avg_rating: number;                 // aggregate from sealed_ratings
  is_verified: boolean;               // trust signal, not escrow authority
};

type FriendLookup = {
  query: string;                       // username/handle, not wallet address
  counterpartyWallet: string;          // resolved server-side
};
```

Profiles use usernames and display names in the UI. Wallet addresses remain the identity primitive for authorization and on-chain actions, but user-facing friend discovery should resolve by username.

### Forward-Compat (Scout update)

```ts
// Listings registry: agents publish intent
type Listing = {
  id: string;
  ownerWallet: string;
  type: "buy" | "sell";
  category: string;
  description: string;                // NL description, embedded for semantic search
  terms: {
    priceRange: { min, max };
    quantityRange?: { min, max };
    milestoneTemplate?: Milestone[];
    delivery: string;
  };
  expiresAt: number;
  status: "open" | "matched" | "closed";
};

// Scout match: agent found A and B compatible
type Match = {
  id: string;
  buyerListingId: string;
  sellerListingId: string;
  scoutedBy: AgentRole;
  matchScore: number;                 // 0-1
  matchReasoning: string;
  proposedTerms?: DealParams;         // scout drafts starting terms
  nextAction: "open_negotiation" | "notify_both" | "discard";
};

// Sourcing profile (purchasing scout input)
type SourcingProfile = {
  categories: string[];
  budgetRange: { min, max };
  qualityRequirements: string;
  preferredSuppliers?: string[];      // wallet addresses
  blacklist?: string[];
  autoPilot: boolean;                 // scout acts without confirmation
};

// Sales profile (sales scout input)
type SalesProfile = {
  productsOffered: string[];
  capacity: number;
  priceFloor: number;
  preferredBuyers?: string[];
  targetIndustries?: string[];
  autoPilot: boolean;
};
```

## API Surface

### Current (Step 1-4)

```
POST /api/agent              existing, Structurer role
POST /api/negotiate          NEW, runs Negotiator ↔ Negotiator rounds
POST /api/verify-milestone   NEW, Verifier reviews proof
GET  /api/memory/:wallet     NEW, retrieve BusinessMemory
POST /api/memory/:wallet     NEW, update BusinessMemory
GET  /api/users/:wallet/public        public profile + reputation aggregate
POST /api/ratings                     completed-deal star review
GET  /api/friends                     friend graph for current wallet
GET  /api/notifications               in-app notification menu synthesized from deal state + queue rows
```

`POST /api/negotiate` accepts an optional `renegotiationRequest` string. This is a human instruction captured from the renegotiation dialog and injected into the next agent negotiation prompt. It must guide the agents only; it does not directly mutate deal terms outside the structured negotiation result.

When renegotiation is requested, the shared off-chain deal status becomes `escalated` so both parties see the same reopened-terms state. If an upstream LLM provider returns a rate-limit error, `/api/negotiate` returns an escalated proposal instead of exposing the raw provider failure to the UI.

### Future (Scout update), already shaped compatibly

```
POST /api/listings                   CRUD listings
GET  /api/listings/search            semantic search
POST /api/scout/find-matches         run scout against registry
POST /api/scout/auto-negotiate       scout hand-off to Negotiator
```

Key design choice: `/api/negotiate` takes **two AgentConfig** inputs, not hardcoded buyer/seller. When Scout lands, it just constructs AgentConfig objects for both sides and calls the same endpoint.

## Agent Message Bus

Current: synchronous HTTP request/response per negotiation round.
Future: scout agents need async + long-running. Design contract now:

```ts
type AgentMessage = {
  id: string;
  fromAgent: AgentRole;
  toAgent: AgentRole;
  correlationId: string;              // proposal ID or match ID
  kind: "propose" | "counter" | "accept" | "reject" | "query" | "notify";
  payload: unknown;
  timestamp: number;
};
```

Step 2 implementation stores AgentMessage[] per Proposal. Later, same schema gets pushed to a real queue (Redis/Postgres LISTEN) for async scout work.

## Tool Allowlist Per Role

| Role            | Tools                                                    |
|-----------------|----------------------------------------------------------|
| Structurer      | parse_deal, query_memory                                 |
| Negotiator      | query_memory, counter_offer, check_redlines, compute_summary |
| Verifier        | view_proof, compare_to_milestone, score_confidence       |
| PurchasingScout | search_listings, score_match, draft_terms, open_negotiation |
| SalesScout      | search_listings, score_match, draft_terms, open_negotiation |

Tools are declared per role. Engine rejects tool calls outside allowlist. Adding Scout = registering new tools + new allowlist entry.

## Storage Progression

| Phase          | Storage              | Why                          |
|----------------|----------------------|------------------------------|
| Step 1-4       | localStorage         | Demo speed, zero backend     |
| Scout update   | Supabase / Postgres  | Listings need shared discovery |
| Post-launch    | On-chain Reputation  | Portable trust               |

Memory interface (`MemoryStore`) is abstracted so swap is one file change.

```ts
interface MemoryStore {
  get(wallet: string): Promise<BusinessMemory | null>;
  update(wallet: string, patch: Partial<BusinessMemory>): Promise<void>;
  searchListings?(query: string, filters: ListingFilters): Promise<Listing[]>;
}
```

Step 1 ships `LocalStorageMemoryStore`. Scout update ships `SupabaseMemoryStore` implementing same interface.

## File Structure Target

```
app/src/
├── agents/
│   ├── types.ts              AgentRole, AgentConfig, AgentMessage
│   ├── prompts/
│   │   ├── structurer.ts     current
│   │   ├── negotiator.ts     Step 2
│   │   ├── verifier.ts       Step 4
│   │   ├── purchasing-scout.ts  FUTURE stub
│   │   └── sales-scout.ts    FUTURE stub
│   ├── tools/
│   │   ├── registry.ts       tool allowlist per role
│   │   └── impls/            each tool as a function
│   └── engine.ts             generic run-agent-with-role
├── negotiation/
│   ├── engine.ts             multi-round loop
│   ├── summarizer.ts         Step 3
│   └── types.ts              Proposal, Revision
├── memory/
│   ├── interface.ts          MemoryStore
│   ├── localstorage-store.ts Step 1
│   └── supabase-store.ts     FUTURE
└── lib/escrow-client.ts      client transaction builders + confirmation helpers
```

## Decision Log

- **Why role-based, not class-based agents**: prompts + tool allowlists swap faster than refactoring class hierarchies. Keeps engine thin.
- **Why AgentMessage schema now**: avoid rewriting negotiation loop when async scout work lands.
- **Why MemoryStore interface now**: localStorage is fine for demo, but Scout discovery needs a shared backend. Interface swap = one line.
- **Why `origin` on Proposal**: distinguishes human-initiated vs scout-initiated negotiations for UX + analytics.
- **Why not build Scout now**: out of hackathon scope. But every current decision is checked against "will this break when Scout lands?"
- **Why renegotiation request stays prompt-scoped**: the human can tell the agent what outcome they want, but final terms still come from the structured `Proposal.finalTerms` flow before any wallet signature.
- **Why escrow mirror is best-effort after signing**: on-chain state remains authoritative for funds. Supabase mirrors are updated after transaction confirmation and may be retried or patched without changing custody state.
- **Why profile URLs are wallet-keyed but display is username-keyed**: `/profile/[wallet]` is stable and authorization-friendly, while names/usernames avoid exposing wallet addresses as the primary user-facing identity.
- **Why ratings are off-chain aggregate with on-chain anchor**: per-deal reviews need fast profile reads and invite-page stats, while the on-chain reputation PDA remains the tamper-proof anchor for public trust.
- **Why AI provider config lives in Agent Setup**: provider/model choice affects agent behavior, so it belongs beside agent templates instead of general profile settings.
- **Why generated handle suffixes are hidden in UI**: invite-created users may retain unique DB handles like `name-xxxxxxxx`, but display surfaces normalize them to `@name` while lookup still resolves the unique stored handle.
- **Why notifications are synthesized from deal context**: in-app alerts must work for both parties even when email/Telegram queue rows are absent; `/api/notifications` reads deal state and queue rows without making notifications source-of-truth for funds.
- **Why `escalated` is an off-chain deal status**: renegotiation intent is coordination context for both parties, not an on-chain fund state. Escrow custody remains controlled only by wallet-signed program instructions.
- **Why escrow deploy prechecks buyer USDC**: SPL Token insufficient-funds errors happen inside `fund_escrow`; the frontend checks the buyer ATA before signing and logs `SendTransactionError.getLogs()` if the chain still rejects.
