"use client";

// Shared building blocks for the admin pages: the two-column page-with-filter-rail
// shell, a checkbox filter group, and small formatting helpers. Read-only UI.

import type { ReactNode } from "react";

export function shortWallet(w: string | null | undefined) {
  if (!w) return "—";
  return w.length > 12 ? `${w.slice(0, 4)}…${w.slice(-4)}` : w;
}

export function dealStatusColor(status: string) {
  switch (status) {
    case "completed":
      return "text-green-400";
    case "funded":
    case "in_progress":
      return "text-indigo-300";
    case "refunded":
    case "disputed":
      return "text-red-400";
    case "escalated":
      return "text-orange-300";
    default:
      return "text-gray-300";
  }
}

export function kycColor(s: string) {
  switch (s) {
    case "approved":
      return "text-green-400";
    case "rejected":
      return "text-red-400";
    case "pending":
      return "text-yellow-400";
    default:
      return "text-gray-500";
  }
}

// Page shell: content on the left with a search bar above the table, and a
// fixed-width filter rail on the right.
export function PageWithRail({
  title,
  count,
  countLabel,
  search,
  rail,
  children,
  onClearFilters,
  hasActiveFilters,
}: {
  title: string;
  count: number;
  countLabel: string;
  search?: ReactNode;
  rail: ReactNode;
  children: ReactNode;
  onClearFilters?: () => void;
  hasActiveFilters?: boolean;
}) {
  return (
    <div>
      <div className="flex items-baseline justify-between mb-4">
        <h2 className="text-lg font-semibold">{title}</h2>
        <span className="text-xs text-gray-500">
          {count} {countLabel}
          {count === 1 ? "" : "s"}
        </span>
      </div>
      <div className="flex gap-5 items-start">
        <div className="flex-1 min-w-0">
          {search && <div className="mb-3">{search}</div>}
          {children}
        </div>
        <aside className="w-52 shrink-0 sticky top-6">
          <div className="rounded-lg border border-gray-800 bg-[#11161D] overflow-hidden">
            <div className="px-3 py-2 border-b border-gray-800 flex items-center justify-between">
              <span className="text-[11px] uppercase tracking-wide text-gray-400 font-medium">Filters</span>
              {onClearFilters && (
                <button
                  onClick={onClearFilters}
                  disabled={!hasActiveFilters}
                  className="text-[11px] text-gray-500 hover:text-indigo-300 disabled:opacity-40 disabled:hover:text-gray-500"
                >
                  Clear
                </button>
              )}
            </div>
            <div className="divide-y divide-gray-800">{rail}</div>
          </div>
        </aside>
      </div>
    </div>
  );
}

export function RailSection({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="px-3 py-2.5">
      <div className="text-[10px] uppercase tracking-wider text-gray-500 mb-1.5 font-medium">{label}</div>
      {children}
    </div>
  );
}

// A multi-select checkbox group. `selected` is the set of checked values.
export function CheckboxGroup({
  options,
  selected,
  onToggle,
}: {
  options: { value: string; label: string }[];
  selected: string[];
  onToggle: (value: string) => void;
}) {
  return (
    <div className="space-y-0.5">
      {options.map((opt) => {
        const on = selected.includes(opt.value);
        return (
          <label
            key={opt.value}
            className="flex items-center gap-2 text-[13px] text-gray-300 cursor-pointer select-none py-0.5 rounded hover:text-white"
          >
            <input
              type="checkbox"
              checked={on}
              onChange={() => onToggle(opt.value)}
              className="accent-indigo-500 w-3.5 h-3.5"
            />
            <span className={on ? "text-white" : ""}>{opt.label}</span>
          </label>
        );
      })}
    </div>
  );
}

const railInput =
  "w-full px-2 py-1 text-[13px] bg-[#161B22] border border-gray-800 rounded outline-none focus:border-gray-600 placeholder:text-gray-600";

export function SearchBox({
  value,
  onChange,
  placeholder,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
}) {
  return (
    <input
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      className={railInput}
    />
  );
}

export function RangeInputs({
  minValue,
  maxValue,
  onMin,
  onMax,
  minPlaceholder = "Min",
  maxPlaceholder = "Max",
  type = "text",
}: {
  minValue: string;
  maxValue: string;
  onMin: (v: string) => void;
  onMax: (v: string) => void;
  minPlaceholder?: string;
  maxPlaceholder?: string;
  type?: "text" | "number" | "date";
}) {
  // Date inputs are too wide to sit side-by-side in the narrow rail (the native
  // mm/dd/yyyy field + calendar icon overflows), so stack them with From/To
  // labels. Number/text ranges stay side-by-side — they're compact.
  if (type === "date") {
    return (
      <div className="space-y-1.5">
        {[
          { label: "From", value: minValue, onChange: onMin },
          { label: "To", value: maxValue, onChange: onMax },
        ].map((row) => (
          <label key={row.label} className="flex items-center gap-2">
            <span className="text-[11px] text-gray-500 w-8 shrink-0">{row.label}</span>
            <input
              type="date"
              value={row.value}
              onChange={(e) => row.onChange(e.target.value)}
              className={railInput + " min-w-0"}
            />
          </label>
        ))}
      </div>
    );
  }
  return (
    <div className="flex gap-2">
      <input
        type={type}
        inputMode={type === "number" ? "decimal" : undefined}
        value={minValue}
        onChange={(e) => onMin(e.target.value)}
        placeholder={minPlaceholder}
        className={railInput + " min-w-0"}
      />
      <input
        type={type}
        inputMode={type === "number" ? "decimal" : undefined}
        value={maxValue}
        onChange={(e) => onMax(e.target.value)}
        placeholder={maxPlaceholder}
        className={railInput + " min-w-0"}
      />
    </div>
  );
}

export function Pager({
  offset,
  shown,
  count,
  loading,
  onPrev,
  onNext,
}: {
  offset: number;
  shown: number;
  count: number;
  loading: boolean;
  onPrev: () => void;
  onNext: () => void;
}) {
  const from = count === 0 ? 0 : offset + 1;
  const to = Math.min(offset + shown, count);
  return (
    <div className="flex items-center justify-between mt-4 text-xs text-gray-400">
      <span>
        {from}–{to} of {count}
      </span>
      <div className="flex gap-2">
        <button
          disabled={offset === 0 || loading}
          onClick={onPrev}
          className="px-3 py-1.5 rounded bg-[#161B22] border border-gray-800 disabled:opacity-40"
        >
          Prev
        </button>
        <button
          disabled={offset + shown >= count || loading}
          onClick={onNext}
          className="px-3 py-1.5 rounded bg-[#161B22] border border-gray-800 disabled:opacity-40"
        >
          Next
        </button>
      </div>
    </div>
  );
}
