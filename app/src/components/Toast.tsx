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

const VARIANT_STYLES: Record<ToastVariant, string> = {
  success: "border-success/40 bg-success/10 text-success",
  error: "border-danger/40 bg-danger/10 text-danger",
  info: "border-accent/40 bg-accent/10 text-accent",
  loading: "border-muted/40 bg-card text-foreground",
};

const VARIANT_ICONS: Record<ToastVariant, string> = {
  success: "✓",
  error: "✕",
  info: "ℹ",
  loading: "⟳",
};

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
      <div className="fixed top-4 right-4 z-50 flex flex-col gap-2 w-[min(360px,calc(100vw-2rem))]">
        {toasts.map((t) => (
          <div
            key={t.id}
            className={`border rounded-lg p-3 shadow-lg backdrop-blur-sm ${VARIANT_STYLES[t.variant]}`}
            role={t.variant === "error" ? "alert" : "status"}
          >
            <div className="flex items-start gap-3">
              <span
                className={`text-base leading-none ${t.variant === "loading" ? "animate-spin" : ""}`}
              >
                {VARIANT_ICONS[t.variant]}
              </span>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold">{t.title}</p>
                {t.description && (
                  <p className="text-xs mt-0.5 text-foreground break-words">
                    {t.description}
                  </p>
                )}
                {t.actionHref && t.actionLabel && (
                  <a
                    href={t.actionHref}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-xs mt-1 inline-block underline font-medium"
                  >
                    {t.actionLabel} ↗
                  </a>
                )}
              </div>
              <button
                onClick={() => dismiss(t.id)}
                className="text-foreground hover:text-accent text-sm leading-none"
                aria-label="Dismiss"
              >
                ×
              </button>
            </div>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}
