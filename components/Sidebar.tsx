"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import {
  CalendarDays,
  ChartLine,
  LayoutGrid,
  Menu,
  PanelLeftClose,
  PanelLeftOpen,
  PenTool,
  Radar,
  ScanSearch,
  Settings,
  SquareCheck,
  Users,
  X,
  type LucideIcon,
} from "lucide-react";
import { Logo } from "./Logo";
import { useStored, writeStored } from "@/lib/useStored";

type NavItem = { label: string; icon: LucideIcon; href?: string };

// Items without an href aren't built yet; they're listed under "Coming soon" and can't be clicked.
const NAV: NavItem[] = [
  { label: "Overview", icon: LayoutGrid, href: "/" },
  { label: "Clients", icon: Users, href: "/clients" },
  { label: "Content Review", icon: ScanSearch, href: "/review" },
  { label: "Trend Radar", icon: Radar, href: "/trends" },
  { label: "Settings", icon: Settings, href: "/settings" },
  { label: "Content Studio", icon: PenTool },
  { label: "Calendar", icon: CalendarDays },
  { label: "Tasks & Approvals", icon: SquareCheck },
  { label: "Insights", icon: ChartLine },
];

function isActive(pathname: string, href: string) {
  return href === "/" ? pathname === "/" : pathname.startsWith(href);
}

function NavList({ collapsed, onNavigate }: { collapsed: boolean; onNavigate?: () => void }) {
  const pathname = usePathname();
  const built = NAV.filter((n) => n.href);
  const soon = NAV.filter((n) => !n.href);
  return (
    <nav className="flex flex-col gap-0.5" aria-label="Main">
      {built.map(({ label, icon: Icon, href }) => {
        const active = isActive(pathname, href!);
        return (
          <Link
            key={label}
            href={href!}
            onClick={onNavigate}
            title={collapsed ? label : undefined}
            className={`group flex h-10 items-center gap-3 rounded-lg px-3 text-[14px] transition-colors ${collapsed ? "justify-center px-0" : ""} ${
              active ? "bg-ink font-medium text-paper" : "text-ink/80 hover:bg-soft hover:text-ink"
            }`}
          >
            <Icon size={18} strokeWidth={1.8} className={active ? "text-accent" : ""} />
            {!collapsed && <span className="flex-1 whitespace-nowrap">{label}</span>}
          </Link>
        );
      })}
      {/* Not built yet: listed quietly so nothing looks clickable that isn't */}
      {!collapsed && (
        <div className="mt-6 px-3">
          <p className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-muted">Coming soon</p>
          <ul className="flex flex-col gap-1.5">
            {soon.map(({ label }) => (
              <li key={label} className="text-[13px] text-muted/70">
                {label}
              </li>
            ))}
          </ul>
        </div>
      )}
    </nav>
  );
}

export function Sidebar() {
  const collapsed = useStored("sorted.sidebarCollapsed") === "1";
  const [mobileOpen, setMobileOpen] = useState(false);
  const toggle = () => writeStored("sorted.sidebarCollapsed", collapsed ? "0" : "1");

  return (
    <>
      {/* Desktop / tablet */}
      <aside
        className={`sticky top-0 hidden h-screen shrink-0 flex-col border-r border-line bg-paper px-3 py-5 transition-[width] duration-200 md:flex ${
          collapsed ? "w-[68px]" : "w-[252px]"
        }`}
      >
        <div className={`mb-8 flex items-center ${collapsed ? "justify-center" : "justify-between px-2"}`}>
          <Link href="/" aria-label="Sorted home">
            <Logo collapsed={collapsed} />
          </Link>
        </div>
        <NavList collapsed={collapsed} />
        <div className="mt-auto">
          {!collapsed && (
            <p className="mb-3 px-3 font-display text-[13px] leading-snug text-muted">Less chasing. More creating.</p>
          )}
          <button
            onClick={toggle}
            className={`flex h-9 w-full items-center gap-3 rounded-lg px-3 text-[13px] text-muted hover:bg-soft hover:text-ink ${collapsed ? "justify-center px-0" : ""}`}
            aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          >
            {collapsed ? <PanelLeftOpen size={17} /> : <PanelLeftClose size={17} />}
            {!collapsed && "Collapse"}
          </button>
        </div>
      </aside>

      {/* Mobile top bar + drawer */}
      <div className="sticky top-0 z-30 flex h-14 items-center justify-between border-b border-line bg-paper/95 px-4 backdrop-blur md:hidden">
        <Link href="/" aria-label="Sorted home">
          <Logo />
        </Link>
        <button
          onClick={() => setMobileOpen(true)}
          className="flex h-11 w-11 items-center justify-center rounded-lg hover:bg-soft"
          aria-label="Open menu"
        >
          <Menu size={20} />
        </button>
      </div>
      {mobileOpen && (
        <div className="fixed inset-0 z-40 md:hidden">
          <div className="absolute inset-0 bg-ink/30" onClick={() => setMobileOpen(false)} />
          <div className="rise absolute inset-y-0 left-0 flex w-[280px] flex-col bg-paper px-3 py-4 shadow-xl">
            <div className="mb-6 flex items-center justify-between px-2">
              <Logo />
              <button
                onClick={() => setMobileOpen(false)}
                className="flex h-11 w-11 items-center justify-center rounded-lg hover:bg-soft"
                aria-label="Close menu"
              >
                <X size={20} />
              </button>
            </div>
            <NavList collapsed={false} onNavigate={() => setMobileOpen(false)} />
            <p className="mt-auto px-3 font-display text-[13px] text-muted">Less chasing. More creating.</p>
          </div>
        </div>
      )}
    </>
  );
}
