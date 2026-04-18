"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";

type ToastVariant = "success" | "error" | "info" | "loading";

export interface Toast {
  id: string;
  variant: ToastVariant;
  title: string;
  description?: string;
  actionHref?: string;
  actionLabel?: string;
  duration?: number; // ms; 0 = sticky
}

interface ToastContextValue {
  show: (toast: Omit<Toast, "id">) => string;
  update: (id: string, patch: Partial<Omit<Toast, "id">>) => void;
  dismiss: (id: string) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error("useToast must be used within <ToastProvider>");
  return ctx;
}

// Accent color per variant: border + icon only. Body uses shared surface.
const VARIANT_ACCENT: Record<ToastVariant, string> = {
  success: "text-success",
  error: "text-danger",
  info: "text-accent",
  loading: "text-muted",
};

const VARIANT_BORDER: Record<ToastVariant, string> = {
  success: "border-[rgba(16,185,129,0.25)]",
  error: "border-[rgba(248,113,113,0.25)]",
  info: "border-[rgba(113,112,255,0.25)]",
  loading: "border-card-border",
};

function VariantIcon({ variant }: { variant: ToastVariant }) {
  const common = {
    width: 14,
    height: 14,
    viewBox: "0 0 24 24",
    fill: "none" as const,
    stroke: "currentColor",
    strokeWidth: 2,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    "aria-hidden": true,
  };
  switch (variant) {
    case "success":
      return (
        <svg {...common}>
          <polyline points="20 6 9 17 4 12" />
        </svg>
      );
    case "error":
      return (
        <svg {...common}>
          <line x1="18" y1="6" x2="6" y2="18" />
          <line x1="6" y1="6" x2="18" y2="18" />
        </svg>
      );
    case "info":
      return (
        <svg {...common}>
          <circle cx="12" cy="12" r="9" />
          <line x1="12" y1="11" x2="12" y2="16" />
          <circle cx="12" cy="8" r="0.5" fill="currentColor" />
        </svg>
      );
    case "loading":
      return (
        <svg {...common} className="animate-spin">
          <path d="M21 12a9 9 0 1 1-6.22-8.56" />
        </svg>
      );
  }
}

const labelStyle: React.CSSProperties = { fontWeight: 510, letterSpacing: "-0.006em" };

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const timers = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());

  const dismiss = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
    const timer = timers.current.get(id);
    if (timer) {
      clearTimeout(timer);
      timers.current.delete(id);
    }
  }, []);

  const scheduleDismiss = useCallback(
    (id: string, duration: number) => {
      const existing = timers.current.get(id);
      if (existing) clearTimeout(existing);
      if (duration > 0) {
        const t = setTimeout(() => dismiss(id), duration);
        timers.current.set(id, t);
      }
    },
    [dismiss]
  );

  const show = useCallback(
    (toast: Omit<Toast, "id">) => {
      const id = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      const duration = toast.duration ?? (toast.variant === "loading" ? 0 : 4500);
      const full: Toast = { id, ...toast, duration };
      setToasts((prev) => [...prev, full]);
      scheduleDismiss(id, duration);
      return id;
    },
    [scheduleDismiss]
  );

  const update = useCallback(
    (id: string, patch: Partial<Omit<Toast, "id">>) => {
      setToasts((prev) =>
        prev.map((t) => (t.id === id ? { ...t, ...patch } : t))
      );
      if (patch.duration !== undefined) {
        scheduleDismiss(id, patch.duration);
      } else if (patch.variant && patch.variant !== "loading") {
        scheduleDismiss(id, 4500);
      }
    },
    [scheduleDismiss]
  );

  useEffect(() => {
    const current = timers.current;
    return () => {
      current.forEach((t) => clearTimeout(t));
      current.clear();
    };
  }, []);

  return (
    <ToastContext.Provider value={{ show, update, dismiss }}>
      {children}
      <div
        className="fixed top-4 right-4 z-50 flex flex-col gap-2 w-[min(380px,calc(100vw-2rem))]"
        aria-live="polite"
      >
        {toasts.map((t) => (
          <div
            key={t.id}
            className={`rounded-xl p-3.5 border bg-surface ${VARIANT_BORDER[t.variant]}`}
            style={{ boxShadow: "var(--shadow-dialog)" }}
            role={t.variant === "error" ? "alert" : "status"}
          >
            <div className="flex items-start gap-3">
              <span
                className={`mt-0.5 inline-flex items-center justify-center h-5 w-5 shrink-0 ${VARIANT_ACCENT[t.variant]}`}
              >
                <VariantIcon variant={t.variant} />
              </span>
              <div className="flex-1 min-w-0">
                <p
                  className="text-[13px] text-primary"
                  style={labelStyle}
                >
                  {t.title}
                </p>
                {t.description && (
                  <p className="text-[12px] mt-1 text-muted break-words leading-relaxed">
                    {t.description}
                  </p>
                )}
                {t.actionHref && t.actionLabel && (
                  <a
                    href={t.actionHref}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-[12px] mt-2 inline-flex items-center gap-1 text-accent hover:text-accent-hover transition-colors"
                    style={labelStyle}
                  >
                    {t.actionLabel}
                    <svg
                      width="11"
                      height="11"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      aria-hidden="true"
                    >
                      <path d="M7 17 17 7" />
                      <path d="M7 7h10v10" />
                    </svg>
                  </a>
                )}
              </div>
              <button
                onClick={() => dismiss(t.id)}
                className="text-subtle hover:text-primary transition-colors shrink-0 h-5 w-5 inline-flex items-center justify-center rounded-md hover:bg-[rgba(255,255,255,0.04)]"
                aria-label="Dismiss"
              >
                <svg
                  width="12"
                  height="12"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden="true"
                >
                  <line x1="18" y1="6" x2="6" y2="18" />
                  <line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              </button>
            </div>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}
