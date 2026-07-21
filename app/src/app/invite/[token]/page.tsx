"use client";

// Legacy long invite links: /invite/{base64-encoded-payload}.
//
// Superseded by the short /i/{code} links, but kept working indefinitely —
// these URLs are sitting in people's chat history and DMs, and breaking them
// would strand deals mid-invite. All this page does now is decode the token;
// the screen itself lives in InviteView, shared with the short-link route.

import { useMemo } from "react";
import { useParams } from "next/navigation";
import { decodeInvite } from "@/lib/profile-store";
import { InviteView, InviteError } from "@/components/InviteView";

export default function InvitePage() {
  const params = useParams();
  const token = Array.isArray(params.token) ? params.token[0] : params.token;

  const payload = useMemo(() => {
    if (!token) return null;
    return decodeInvite(decodeURIComponent(token));
  }, [token]);

  if (!payload) return <InviteError />;

  return <InviteView payload={payload} />;
}
