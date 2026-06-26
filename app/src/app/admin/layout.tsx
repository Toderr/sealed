"use client";

// Shared chrome for the admin area: a header + tab nav across the read-only
// dashboard (Deals, Users) and the existing KYC review tool. Auth is enforced
// per-route on the server (requireAdmin / ADMIN_WALLETS); this layout is just
// navigation and does not itself gate access.

import Link from "next/link";
import { usePathname } from "next/navigation";

const TABS = [
  { href: "/admin", label: "Deals" },
  { href: "/admin/users", label: "Users" },
  { href: "/admin/kyc", label: "KYC" },
];

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  return (
    <div className="min-h-screen bg-[#0D1117] text-white">
      <header className="border-b border-gray-800">
        <div className="max-w-6xl mx-auto px-4 sm:px-8 pt-5">
          <h1 className="text-xl font-bold">Sealed — Admin</h1>
          <p className="text-xs text-gray-500 mt-1">
            Internal · read-only views of deals and users
          </p>
          <nav className="flex gap-1 mt-4">
            {TABS.map((t) => {
              // /admin must match exactly (it's the Deals index); others by prefix.
              const active =
                t.href === "/admin" ? pathname === "/admin" : pathname.startsWith(t.href);
              return (
                <Link
                  key={t.href}
                  href={t.href}
                  className={
                    "px-4 py-2 text-sm rounded-t-md border-b-2 " +
                    (active
                      ? "border-indigo-400 text-white"
                      : "border-transparent text-gray-400 hover:text-gray-200")
                  }
                >
                  {t.label}
                </Link>
              );
            })}
          </nav>
        </div>
      </header>
      <main className="max-w-6xl mx-auto px-4 sm:px-8 py-6">{children}</main>
    </div>
  );
}
