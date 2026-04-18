// Agent role system. See ARCHITECTURE.md.
// Role-based design so new agent types (PurchasingScout, SalesScout) can be
// added without rewriting the negotiation engine.

export enum AgentRole {
  Structurer = "structurer",
  Negotiator = "negotiator",
  Verifier = "verifier",
  PurchasingScout = "purchasing_scout",
  SalesScout = "sales_scout",
}

export type OnBehalfOf = "buyer" | "seller";

export type AgentMessageKind =
  | "propose"
  | "counter"
  | "accept"
  | "reject"
  | "query"
  | "notify";

export interface AgentMessage {
  id: string;
  fromAgent: AgentRole;
  toAgent: AgentRole;
  correlationId: string;
  kind: AgentMessageKind;
  payload: unknown;
  timestamp: number;
}
