import { ImageResponse } from "next/og";
import React from "react";
import { insforge, table } from "@/lib/insforge";
import { getPublicProfile } from "@/lib/sealed-users";

export const runtime = "nodejs";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  const { data: deal } = await insforge.database
    .from(table("deals"))
    .select("*")
    .eq("deal_id", id)
    .single();

  const dealData = deal as {
    deal_id: string;
    buyer_wallet: string;
    seller_wallet: string;
    total_amount_usdc: number;
    milestones: { status: string }[];
    created_at: string;
    updated_at: string;
    milestones_metadata?: { show_amount_on_card?: boolean };
  } | null;

  const [partyA, partyB] = await Promise.all([
    dealData ? getPublicProfile(dealData.buyer_wallet) : null,
    dealData ? getPublicProfile(dealData.seller_wallet) : null,
  ]);

  const showAmount = dealData?.milestones_metadata?.show_amount_on_card !== false;
  const amountUsdc = dealData ? dealData.total_amount_usdc / 1_000_000 : 0;
  const milestones = dealData?.milestones ?? [];
  const milestoneDone = milestones.filter(
    (m) => m.status === "Completed" || m.status === "Released"
  ).length;

  const createdAt = dealData?.created_at ? new Date(dealData.created_at) : new Date();
  const updatedAt = dealData?.updated_at ? new Date(dealData.updated_at) : new Date();
  const durationDays = Math.max(
    1,
    Math.round((updatedAt.getTime() - createdAt.getTime()) / (1000 * 60 * 60 * 24))
  );

  const handleA = partyA?.handle ?? "Party A";
  const handleB = partyB?.handle ?? "Party B";
  const avgRating = ((partyA?.avg_rating ?? 0) + (partyB?.avg_rating ?? 0)) / 2;

  const dateStr = new Date().toLocaleDateString("en-US", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });

  const amountText = showAmount
    ? `$${amountUsdc.toLocaleString("en-US", { maximumFractionDigits: 0 })} USDC`
    : "Amount Confidential";

  const rows: [string, string][] = [
    ["Duration", `${durationDays} day${durationDays !== 1 ? "s" : ""}`],
    ["Milestones", `${milestoneDone} / ${milestones.length} completed`],
    ["Avg Rating", avgRating > 0 ? `★ ${avgRating.toFixed(1)}` : "—"],
    ["Parties", `${handleA} × ${handleB}`],
  ];

  const e = React.createElement;

  const card = e(
    "div",
    {
      style: {
        width: "100%",
        height: "100%",
        display: "flex",
        flexDirection: "column",
        background: "linear-gradient(135deg, #0D1117 0%, #161B22 60%, #0D1117 100%)",
        padding: "48px 56px",
        fontFamily: "system-ui, sans-serif",
      },
    },
    // Top bar
    e(
      "div",
      { style: { display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 40 } },
      e(
        "div",
        { style: { display: "flex", alignItems: "center", gap: 10 } },
        e("div", {
          style: {
            width: 32, height: 32, background: "#22C55E", borderRadius: 8,
            display: "flex", alignItems: "center", justifyContent: "center",
          },
        }),
        e("span", { style: { color: "#fff", fontSize: 22, fontWeight: 700, letterSpacing: "-0.5px" } }, "Sealed Agent")
      ),
      e("span", { style: { color: "#484F58", fontSize: 15 } }, dateStr)
    ),
    // Badge
    e(
      "div",
      {
        style: {
          display: "inline-flex", alignItems: "center",
          background: "#22C55E", borderRadius: 12,
          padding: "12px 24px", marginBottom: 24, alignSelf: "flex-start",
        },
      },
      e("span", { style: { color: "#fff", fontSize: 28, fontWeight: 800 } }, "Deal Sealed ✓")
    ),
    // Amount
    e(
      "div",
      { style: { color: "#fff", fontSize: 52, fontWeight: 800, letterSpacing: "-1px", marginBottom: 36, lineHeight: 1 } },
      amountText
    ),
    // Stats
    e(
      "div",
      { style: { display: "flex", flexDirection: "column", gap: 14, flex: 1 } },
      ...rows.map(([label, value]) =>
        e(
          "div",
          {
            key: label,
            style: {
              display: "flex", justifyContent: "space-between", alignItems: "center",
              borderBottom: "1px solid rgba(255,255,255,0.06)", paddingBottom: 12,
            },
          },
          e("span", { style: { color: "#8B949E", fontSize: 17 } }, label),
          e("span", { style: { color: "#E6EDF3", fontSize: 17, fontWeight: 600 } }, value)
        )
      )
    ),
    // Footer
    e(
      "div",
      { style: { display: "flex", justifyContent: "flex-end", marginTop: 32 } },
      e("span", { style: { color: "#484F58", fontSize: 14 } }, `sealed.app · #${id.slice(0, 8)}`)
    )
  );

  return new ImageResponse(card, { width: 1200, height: 630 });
}
