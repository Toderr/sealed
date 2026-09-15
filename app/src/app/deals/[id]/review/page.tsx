"use client";

import { useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import { useAppWallet as useWallet } from "@/lib/use-app-wallet";
import { useDealsStore } from "@/lib/deals-store";
import { apiFetchSafe } from "@/lib/api-client";

// This route only exists to redirect inbound links (notifications, emails).
// The standalone review screen was a dead end — its Approve/Decline/Renegotiate
// handlers didn't touch real state — so we forward to the flows that do:
// the negotiation room for pre-escrow deals, the deal page once funded.
const NEGOTIATION = ["draft", "created", "seller-ready", "seller-agreed", "manual-chat", "proposed", "escalated"];

export default function DealReviewRedirect() {
  const params = useParams();
  const router = useRouter();
  const { publicKey } = useWallet();
  const dealId = params.id as string;

  const { deals } = useDealsStore(publicKey ?? null);
  const localStatus = deals.find((d) => d.dealId === dealId)?.status;

  useEffect(() => {
    let cancelled = false;
    const go = (status: string | null | undefined) => {
      if (cancelled) return;
      const s = (status ?? "").toLowerCase();
      router.replace(
        NEGOTIATION.includes(s)
          ? `/negotiate/${encodeURIComponent(dealId)}`
          : `/deals/${encodeURIComponent(dealId)}`,
      );
    };
    if (localStatus) { go(localStatus); return; }
    // Deal not in the local store (fresh browser / notification link): read the
    // mirror status once, then route. Unknown status defaults to the deal page.
    apiFetchSafe<{ deal?: { status?: string } } | null>(`/api/deals/${encodeURIComponent(dealId)}`, {}, null)
      .then((data) => go(data?.deal?.status));
    return () => { cancelled = true; };
  }, [localStatus, dealId, router]);

  return (
    <div style={{ minHeight: "60vh", display: "grid", placeItems: "center", color: "var(--muted)", fontSize: 13 }}>
      Opening deal…
    </div>
  );
}
