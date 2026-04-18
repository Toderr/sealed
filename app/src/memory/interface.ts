// MemoryStore interface — per ARCHITECTURE.md.
// Step 1 ships LocalStorageMemoryStore. Scout update swaps to Supabase-backed
// implementation with same interface. Consumers never change.

import type { BusinessMemory } from "./types";

export interface MemoryStore {
  get(wallet: string): Promise<BusinessMemory | null>;
  update(
    wallet: string,
    patch: Partial<BusinessMemory>
  ): Promise<BusinessMemory>;
  // FUTURE: listings registry lives here too.
  // searchListings?(query: string, filters: ListingFilters): Promise<Listing[]>;
}
