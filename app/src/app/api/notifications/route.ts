import { supabase, table } from "@/lib/supabase";
import { requireWallet } from "@/lib/auth";
import { HttpError, json, withRoute } from "@/lib/api-error";

type DealRow = {
  deal_id: string;
  buyer_wallet: string;
  seller_wallet: string | null;
  title: string;
  status: string;
  milestones: Array<{ status?: string }> | null;
  created_at: string;
  updated_at?: string | null;
};

type QueueRow = {
  id: string;
  event_type: string;
  payload: Record<string, unknown>;
  created_at: string;
  status: string;
};

type NotificationItem = {
  id: string;
  type: string;
  title: string;
  body: string;
  href: string;
  created_at: string;
  read: boolean;
};

export const GET = withRoute(async (request) => {
  const wallet = requireWallet(request);

  const [{ data: deals, error: dealsError }, { data: queue }] = await Promise.all([
    supabase
      .from(table("deals"))
      .select("deal_id,buyer_wallet,seller_wallet,title,status,milestones,created_at,updated_at")
      .or(`buyer_wallet.eq.${wallet},seller_wallet.eq.${wallet}`)
      .order("updated_at", { ascending: false })
      .limit(50),
    supabase
      .from(table("notification_queue"))
      .select("id,event_type,payload,created_at,status")
      .eq("recipient_wallet", wallet)
      .order("created_at", { ascending: false })
      .limit(20),
  ]);

  if (dealsError) {
    throw new HttpError(500, dealsError.message);
  }

  const notifications = [
    ...synthesizeDealNotifications((deals ?? []) as DealRow[], wallet),
    ...((queue ?? []) as QueueRow[]).map(queueNotificationToItem),
  ]
    .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
    .slice(0, 20);

  return json({ notifications });
});

function synthesizeDealNotifications(deals: DealRow[], wallet: string): NotificationItem[] {
  const items: NotificationItem[] = [];

  for (const deal of deals) {
    const status = normalizeStatus(deal.status);
    const isBuyer = deal.buyer_wallet === wallet;
    const isSeller = deal.seller_wallet === wallet;
    const createdAt = deal.updated_at ?? deal.created_at;

    if (isBuyer && status === "draft" && deal.seller_wallet) {
      items.push({
        id: `${deal.deal_id}:counterparty-joined`,
        type: "counterparty_joined",
        title: "Counterparty joined",
        body: `${deal.title} is ready for negotiation setup.`,
        href: `/negotiate/${deal.deal_id}`,
        created_at: createdAt,
        read: false,
      });
    }

    if (isSeller && status === "draft") {
      items.push({
        id: `${deal.deal_id}:choose-negotiation`,
        type: "new_deal_invite",
        title: "Choose negotiation mode",
        body: `${deal.title} is waiting for you to chat directly or use your agent.`,
        href: `/negotiate/${deal.deal_id}`,
        created_at: createdAt,
        read: false,
      });
    }

    if (isBuyer && status === "seller-ready") {
      items.push({
        id: `${deal.deal_id}:agent-ready`,
        type: "agent_ready",
        title: "Counterparty agent is ready",
        body: `${deal.title} can start agent negotiation now.`,
        href: `/negotiate/${deal.deal_id}`,
        created_at: createdAt,
        read: false,
      });
    }

    if (isBuyer && status === "seller-agreed") {
      items.push({
        id: `${deal.deal_id}:ready-to-fund`,
        type: "ready_to_fund",
        title: "Ready to fund",
        body: `${deal.title} is waiting on you to accept and deploy escrow.`,
        href: `/negotiate/${deal.deal_id}`,
        created_at: createdAt,
        read: false,
      });
    }

    if (isSeller && status === "seller-agreed") {
      items.push({
        id: `${deal.deal_id}:waiting-funding`,
        type: "waiting_funding",
        title: "Waiting for funding",
        body: `${deal.title} is waiting for the buyer to accept and deploy escrow.`,
        href: `/negotiate/${deal.deal_id}`,
        created_at: createdAt,
        read: false,
      });
    }

    if (status === "escalated") {
      items.push({
        id: `${deal.deal_id}:escalated`,
        type: "renegotiation_escalated",
        title: "Renegotiation escalated",
        body: `${deal.title} has a reopened terms request for both parties to review.`,
        href: `/negotiate/${deal.deal_id}`,
        created_at: createdAt,
        read: false,
      });
    }

    if (status === "completed") {
      items.push({
        id: `${deal.deal_id}:review`,
        type: "deal_review_needed",
        title: "Review counterparty",
        body: `${deal.title} is sealed. Leave a rating for your counterparty.`,
        href: `/deals/${deal.deal_id}/review`,
        created_at: createdAt,
        read: false,
      });
    }
  }

  return items;
}

function queueNotificationToItem(row: QueueRow): NotificationItem {
  const dealId = typeof row.payload?.deal_id === "string" ? row.payload.deal_id : null;
  const href = typeof row.payload?.href === "string"
    ? row.payload.href
    : dealId
    ? `/deals/${dealId}`
    : "/app";
  const title = eventTitle(row.event_type);
  const body =
    typeof row.payload?.message === "string"
      ? row.payload.message
      : eventBody(row.event_type);

  return {
    id: `queue:${row.id}`,
    type: row.event_type,
    title,
    body,
    href,
    created_at: row.created_at,
    read: row.status === "sent",
  };
}

function normalizeStatus(status: string) {
  const lower = status.toLowerCase();
  if (lower === "inprogress") return "in_progress";
  if (lower === "created") return "draft";
  return lower;
}

function eventTitle(eventType: string) {
  const titles: Record<string, string> = {
    deal_review_needed: "Review needed",
    milestone_due: "Milestone needs review",
    deal_accepted: "Deal accepted",
    deal_declined: "Deal declined",
    new_deal_invite: "New deal invite",
    renegotiation_escalated: "Renegotiation escalated",
    friend_request: "New friend request",
    friend_request_accepted: "Friend request accepted",
  };
  return titles[eventType] ?? "Sealed notification";
}

function eventBody(eventType: string) {
  const bodies: Record<string, string> = {
    deal_review_needed: "Review the proposed terms or leave a rating.",
    milestone_due: "A milestone is waiting for confirmation.",
    deal_accepted: "Your counterparty accepted the deal terms.",
    deal_declined: "Your counterparty declined the deal.",
    new_deal_invite: "Someone invited you to a deal.",
    renegotiation_escalated: "Your counterparty reopened the terms on a deal.",
    friend_request: "Someone sent you a friend request.",
    friend_request_accepted: "Someone accepted your friend request.",
  };
  return bodies[eventType] ?? "You have an update in Sealed Agent.";
}
