import { supabase, table } from "@/lib/supabase";
import { requireAdmin } from "@/lib/admin";
import { HttpError, json, withRoute } from "@/lib/api-error";
import { findDealPDA, findEscrowVaultPDA, PROGRAM_ID } from "@/lib/escrow-client";

// Admin-only, READ-ONLY full detail for a single deal: the mirror row plus the
// derived on-chain addresses (deal PDA + escrow vault PDA) so an admin can look
// up the escrow account on an explorer. PDAs are pure derivations (no RPC), so
// this stays a cheap read. Gated by requireAdmin like the other admin routes.

export const GET = withRoute<{ params: Promise<{ dealId: string }> }>(
  async (request, { params }) => {
    const guard = requireAdmin(request);
    if (guard) return guard;

    const { dealId } = await params;

    const { data: deal, error } = await supabase
      .from(table("deals"))
      .select("*")
      .eq("deal_id", dealId)
      .maybeSingle();

    if (error) throw new HttpError(500, error.message);
    if (!deal) throw new HttpError(404, "Deal not found");

    // Derive the on-chain addresses from the deal_id (matches escrow-client).
    let onchain: {
      program_id: string;
      deal_pda: string;
      escrow_vault_pda: string;
    } | null = null;
    try {
      const [dealPda] = findDealPDA(dealId);
      const [vaultPda] = findEscrowVaultPDA(dealId);
      onchain = {
        program_id: PROGRAM_ID.toBase58(),
        deal_pda: dealPda.toBase58(),
        escrow_vault_pda: vaultPda.toBase58(),
      };
    } catch {
      // Non-base58 / malformed deal_id can't derive a PDA — leave onchain null.
      onchain = null;
    }

    return json({ deal, onchain });
  }
);
