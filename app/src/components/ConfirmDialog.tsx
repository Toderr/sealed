"use client";

// Blocking confirmation dialog — the replacement for native window.confirm().
// Markup mirrors the app's existing modals (delete-deal on the board, reject
// counterparty in the negotiate room): full-screen scrim, `.modal-card` surface,
// title + body, then Cancel / Confirm.
//
// confirm() is synchronous; this is not. Call sites hold the pending action in
// state and run it from onConfirm rather than inline.

import { useEffect } from "react";

export interface ConfirmDialogProps {
  open: boolean;
  title: string;
  /** Body copy. A string renders as a paragraph; nodes render as-is. */
  body?: React.ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  /** Red confirm button for destructive/irreversible actions. */
  danger?: boolean;
  /** Disables both buttons and swaps the confirm label for `busyLabel`. */
  busy?: boolean;
  busyLabel?: string;
  onConfirm: () => void;
  onCancel: () => void;
}

export function ConfirmDialog({
  open,
  title,
  body,
  confirmLabel = "Confirm",
  cancelLabel = "Cancel",
  danger = false,
  busy = false,
  busyLabel,
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  // Esc closes, matching the scrim click. Not while busy — the action is in
  // flight and cancelling the dialog wouldn't cancel it.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !busy) onCancel();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, busy, onCancel]);

  if (!open) return null;

  return (
    <div
      onClick={() => { if (!busy) onCancel(); }}
      style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.72)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 200, padding: 16 }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="modal-card"
        role="dialog"
        aria-modal="true"
        style={{ width: "100%", maxWidth: 420, borderRadius: 14, padding: 22 }}
      >
        <p style={{ fontSize: 15, fontWeight: 600, color: "var(--primary)", margin: "0 0 6px" }}>{title}</p>
        {body != null && (
          typeof body === "string" ? (
            <p style={{ fontSize: 13, color: "var(--muted)", margin: "0 0 18px", lineHeight: 1.5, whiteSpace: "pre-line" }}>{body}</p>
          ) : (
            <div style={{ fontSize: 13, color: "var(--muted)", margin: "0 0 18px", lineHeight: 1.5 }}>{body}</div>
          )
        )}
        <div style={{ display: "flex", gap: 8 }}>
          <button
            className="btn-ghost"
            disabled={busy}
            onClick={onCancel}
            style={{ height: 38, borderRadius: 8, fontSize: 13, flex: 1 }}
          >
            {cancelLabel}
          </button>
          {danger ? (
            <button
              disabled={busy}
              onClick={onConfirm}
              style={{ height: 38, borderRadius: 8, fontSize: 13, flex: 1, background: "var(--danger)", color: "#fff", border: "none", fontWeight: 510, cursor: busy ? "default" : "pointer", opacity: busy ? 0.6 : 1 }}
            >
              {busy ? (busyLabel ?? "Working…") : confirmLabel}
            </button>
          ) : (
            <button
              className="btn-primary"
              disabled={busy}
              onClick={onConfirm}
              style={{ height: 38, borderRadius: 8, fontSize: 13, flex: 1, opacity: busy ? 0.6 : 1 }}
            >
              {busy ? (busyLabel ?? "Working…") : confirmLabel}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

export default ConfirmDialog;
