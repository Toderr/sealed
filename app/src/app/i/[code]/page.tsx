"use client";

// Short invite links: /i/{code}.
//
// The code is an 8-char lookup key, so unlike the legacy /invite/{base64} route
// there's nothing to decode — the payload comes from the API. That's the whole
// point: the URL stays ~30 chars no matter how many milestones the deal has, and
// survives being pasted into chat apps that mangle long links.

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { type InvitePayload } from "@/lib/profile-store";
import { apiFetch } from "@/lib/api-client";
import { InviteView, InviteError, InviteLoading } from "@/components/InviteView";

type Resolution =
  | { kind: "loading" }
  | { kind: "ready"; payload: InvitePayload }
  | { kind: "error" };

export default function ShortInvitePage() {
  const params = useParams();
  const code = Array.isArray(params.code) ? params.code[0] : params.code;
  const [state, setState] = useState<Resolution>({ kind: "loading" });

  useEffect(() => {
    if (!code) return;

    let cancelled = false;

    apiFetch<{ payload?: InvitePayload }>(`/api/invite/${encodeURIComponent(code)}`)
      .then((data) => {
        if (cancelled) return;
        setState(data?.payload ? { kind: "ready", payload: data.payload } : { kind: "error" });
      })
      .catch(() => {
        if (!cancelled) setState({ kind: "error" });
      });

    return () => {
      cancelled = true;
    };
  }, [code]);

  // A missing segment is a routing impossibility rather than a fetch failure, so
  // it's derived here during render instead of being pushed through state.
  if (state.kind === "loading") return code ? <InviteLoading /> : <InviteError />;
  if (state.kind === "error") {
    return (
      <InviteError
        title="Invite link not found"
        detail="This link may have expired, or the deal may have been deleted."
      />
    );
  }

  return <InviteView payload={state.payload} />;
}
