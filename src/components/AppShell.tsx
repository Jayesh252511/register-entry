import type { ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import { BookOpen, FileBarChart, LayoutDashboard, List, PlusCircle, Search, Settings } from "lucide-react";

const NAV = [
  { to: "/", label: "Dashboard", icon: LayoutDashboard },
  { to: "/new", label: "New Entry", icon: PlusCircle },
  { to: "/register", label: "Full Register", icon: List },
  { to: "/search", label: "Search", icon: Search },
  { to: "/reports", label: "Reports", icon: FileBarChart },
  { to: "/settings", label: "Settings", icon: Settings },
] as const;

const MOBILE = [NAV[0], NAV[2], NAV[1], NAV[3], NAV[4]] as const;

export function AppShell({ children, deviceLabel }: { children: ReactNode; deviceLabel: string | null }) {
  return (
    <div className="min-h-screen md:flex">
      <aside className="no-print hidden w-56 shrink-0 flex-col bg-nav text-nav-foreground md:flex">
        <div className="flex items-center gap-2 px-4 py-5">
          <div className="flex h-9 w-9 items-center justify-center rounded-md bg-primary text-primary-foreground">
            <BookOpen className="h-4 w-4" />
          </div>
          <div className="leading-tight">
            <div className="font-bold">Transport Register</div>
            <div className="text-xs text-nav-muted">Digital Roznamcha</div>
          </div>
        </div>
        <nav className="flex-1 space-y-1 px-2">
          {NAV.map(({ to, label, icon: Icon }) => (
            <Link
              key={to}
              to={to}
              activeOptions={{ exact: to === "/" }}
              className="flex items-center gap-3 rounded-md px-3 py-2 text-sm text-nav-muted transition-colors hover:bg-nav-active hover:text-nav-foreground"
              activeProps={{ className: "bg-nav-active !text-nav-foreground font-semibold" }}
            >
              <Icon className="h-4 w-4" />
              {label}
            </Link>
          ))}
        </nav>
        {deviceLabel && <div className="px-4 py-4 text-xs text-nav-muted">Device: {deviceLabel}</div>}
      </aside>

      <header className="no-print sticky top-0 z-20 flex items-center justify-between bg-nav px-4 py-3 text-nav-foreground md:hidden">
        <div className="flex items-center gap-2 font-bold">
          <BookOpen className="h-5 w-5" /> Transport Register
        </div>
        <Link to="/settings" aria-label="Settings" className="rounded-md p-1 text-nav-muted">
          <Settings className="h-5 w-5" />
        </Link>
      </header>

      <main className="min-w-0 flex-1 px-3 pb-24 pt-4 md:px-8 md:pb-10 md:pt-8">{children}</main>

      <nav className="no-print fixed inset-x-0 bottom-0 z-20 grid grid-cols-5 border-t bg-card pb-[env(safe-area-inset-bottom)] md:hidden">
        {MOBILE.map(({ to, label, icon: Icon }) => (
          <Link
            key={to}
            to={to}
            activeOptions={{ exact: to === "/" }}
            className="flex flex-col items-center gap-0.5 py-2 text-[11px] text-muted-foreground"
            activeProps={{ className: "!text-primary font-semibold" }}
          >
            <Icon className={to === "/new" ? "h-6 w-6" : "h-5 w-5"} />
            {label === "Full Register" ? "Register" : label}
          </Link>
        ))}
      </nav>
    </div>
  );
}
