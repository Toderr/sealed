"use client";

// Admin shell: a left sidebar nav over the read-only dashboard pages (Deals,
// Users) and the KYC review tool. Auth is enforced per-route on the server
// (requireAdmin / ADMIN_WALLETS); this layout is navigation only.

import Link from "next/link";
import { usePathname } from "next/navigation";

const NAV = [
  { href: "/admin/deals", label: "Deals", icon: "M3 3h18v4H3zM3 10h18v4H3zM3 17h18v4H3z" },
  { href: "/admin/users", label: "Users", icon: "M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8z" },
  { href: "/admin/kyc", label: "KYC", icon: "M9 12l2 2 4-4M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0z" },
];

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  return (
    <div className="min-h-screen bg-[#0D1117] text-white flex">
      {/* Sidebar */}
      <aside className="w-56 shrink-0 border-r border-gray-800 flex flex-col">
        <div className="px-5 py-5 border-b border-gray-800">
          <div className="text-sm font-bold">Sealed — Admin</div>
          <div className="text-[11px] text-gray-500 mt-0.5">Internal · read-only</div>
        </div>
        <nav className="flex-1 p-3 space-y-1">
          {NAV.map((item) => {
            const active = pathname.startsWith(item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                className={
                  "flex items-center gap-3 px-3 py-2 rounded-md text-sm transition-colors " +
                  (active
                    ? "bg-indigo-500/15 text-white"
                    : "text-gray-400 hover:text-gray-100 hover:bg-white/5")
                }
              >
                <svg
                  width="16"
                  height="16"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.7"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  className={active ? "text-indigo-300" : ""}
                >
                  <path d={item.icon} />
                </svg>
                {item.label}
              </Link>
            );
          })}
        </nav>
        <div className="px-5 py-4 border-t border-gray-800 text-[11px] text-gray-600">
          Allowlist auth · view only
        </div>
      </aside>

      {/* Content */}
      <main className="flex-1 min-w-0 px-6 py-6">{children}</main>
    </div>
  );
}
