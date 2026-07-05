import * as React from "react"
import { useLocation, Link as WouterLink } from "wouter"
import {
  Activity,
  Map as MapIcon,
  Users,
  CarFront,
  AlertTriangle,
  BarChart3,
  Wallet,
  CreditCard,
  LogOut,
  Menu,
  PanelLeft,
  ShieldCheck,
} from "lucide-react"

import { cn } from "@/lib/utils"
import { Button } from "./ui/button"
import { Tooltip, TooltipContent, TooltipTrigger } from "./ui/tooltip"
import { useAuth } from "@/lib/auth-context"

const navItems = [
  { href: "/", label: "Overview", icon: Activity },
  { href: "/trips", label: "Trips", icon: MapIcon },
  { href: "/drivers", label: "Drivers", icon: CarFront },
  { href: "/incidents", label: "Incidents", icon: AlertTriangle },
  { href: "/analytics", label: "Analytics", icon: BarChart3 },
  { href: "/wallets", label: "Wallets", icon: Wallet },
  { href: "/subscriptions", label: "Subscriptions", icon: CreditCard },
  { href: "/loops", label: "Loop Routes", icon: MapIcon },
  { href: "/users", label: "Users", icon: Users },
  { href: "/audit-logs", label: "Audit Logs", icon: ShieldCheck },
]

const COLLAPSE_KEY = "move-apayao:sidebar-collapsed"

function NavRow({
  href,
  label,
  Icon,
  isActive,
  collapsed,
  onClick,
}: {
  href: string
  label: string
  Icon: React.ElementType
  isActive: boolean
  collapsed: boolean
  onClick: () => void
}) {
  const link = (
    <WouterLink
      href={href}
      onClick={onClick}
      className={cn(
        "flex items-center rounded-lg text-sm font-medium transition-colors",
        collapsed ? "justify-center h-10 w-10 mx-auto" : "gap-3 px-3 py-2.5",
        isActive
          ? "bg-sidebar-accent text-sidebar-accent-foreground"
          : "text-sidebar-foreground/70 hover:bg-sidebar-accent/60 hover:text-sidebar-foreground"
      )}
    >
      <Icon className={cn("h-[18px] w-[18px] shrink-0", isActive ? "text-primary" : "text-sidebar-foreground/50")} />
      {!collapsed && <span className="truncate">{label}</span>}
    </WouterLink>
  )

  if (!collapsed) return link

  return (
    <Tooltip delayDuration={200}>
      <TooltipTrigger asChild>{link}</TooltipTrigger>
      <TooltipContent side="right" sideOffset={8}>
        {label}
      </TooltipContent>
    </Tooltip>
  )
}

export function Shell({ children }: { children: React.ReactNode }) {
  const [location] = useLocation()
  const [mobileOpen, setMobileOpen] = React.useState(false)
  const [collapsed, setCollapsed] = React.useState(() => {
    if (typeof window === "undefined") return false
    return window.localStorage.getItem(COLLAPSE_KEY) === "1"
  })
  const { session, signOut } = useAuth()

  React.useEffect(() => {
    window.localStorage.setItem(COLLAPSE_KEY, collapsed ? "1" : "0")
  }, [collapsed])

  const initials = (session?.user.email ?? "?").slice(0, 2).toUpperCase()

  return (
    <div className="min-h-screen bg-background flex flex-col md:flex-row">
      {/* Mobile Header */}
      <header className="md:hidden flex items-center justify-between p-4 border-b border-sidebar-border bg-sidebar text-sidebar-foreground">
        <div className="flex items-center gap-2 font-bold text-xl tracking-tight">
          <div className="w-8 h-8 rounded-lg bg-primary flex items-center justify-center text-primary-foreground">
            M
          </div>
          MOVE Apayao
        </div>
        <Button
          variant="ghost"
          size="icon"
          onClick={() => setMobileOpen(!mobileOpen)}
          className="text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
        >
          <Menu className="h-6 w-6" />
        </Button>
      </header>

      {/* Sidebar */}
      <aside
        className={cn(
          "flex-shrink-0 bg-sidebar border-r border-sidebar-border text-sidebar-foreground flex flex-col transition-all duration-200 z-40",
          "fixed inset-y-0 left-0 md:relative md:translate-x-0",
          mobileOpen ? "translate-x-0" : "-translate-x-full md:translate-x-0",
          collapsed ? "md:w-[76px] w-64" : "w-64"
        )}
      >
        {/* Header / brand + collapse toggle */}
        <div
          className={cn(
            "flex items-center gap-2 px-3 pt-4 pb-2",
            collapsed ? "md:flex-col md:gap-3" : "justify-between"
          )}
        >
          <div className={cn("flex items-center gap-2.5 min-w-0", collapsed && "md:justify-center")}>
            <div className="w-8 h-8 rounded-lg bg-primary flex items-center justify-center text-primary-foreground text-sm font-bold shrink-0">
              M
            </div>
            {!collapsed && (
              <span className="font-bold text-lg tracking-tight truncate">
                MOVE <span className="text-primary">Apayao</span>
              </span>
            )}
          </div>

          <Button
            variant="ghost"
            size="icon"
            onClick={() => setCollapsed(!collapsed)}
            className="hidden md:inline-flex h-8 w-8 text-sidebar-foreground/60 hover:bg-sidebar-accent/60 hover:text-sidebar-foreground shrink-0"
          >
            <PanelLeft className="h-[18px] w-[18px]" />
          </Button>
        </div>

        {/* Nav */}
        <div className="flex-1 overflow-y-auto overflow-x-hidden py-2 px-2.5 space-y-0.5">
          {!collapsed && (
            <div className="text-[11px] font-semibold text-sidebar-foreground/40 uppercase tracking-wider mb-1.5 px-3 pt-2">
              Control Center
            </div>
          )}
          {navItems.map((item) => {
            const isActive = location === item.href || (item.href !== "/" && location.startsWith(item.href))
            return (
              <NavRow
                key={item.href}
                href={item.href}
                label={item.label}
                Icon={item.icon}
                isActive={isActive}
                collapsed={collapsed}
                onClick={() => setMobileOpen(false)}
              />
            )
          })}
        </div>

        {/* Footer / user */}
        <div className="p-2.5 border-t border-sidebar-border">
          {collapsed ? (
            <div className="flex flex-col items-center gap-1">
              <Tooltip delayDuration={200}>
                <TooltipTrigger asChild>
                  <div className="flex items-center justify-center h-10 w-10 rounded-lg cursor-default">
                    <div className="w-7 h-7 rounded-full bg-sidebar-accent flex items-center justify-center text-[11px] font-semibold">
                      {initials}
                    </div>
                  </div>
                </TooltipTrigger>
                <TooltipContent side="right" sideOffset={8}>
                  {session?.user.email ?? "Admin"}
                </TooltipContent>
              </Tooltip>
              <Tooltip delayDuration={200}>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => signOut()}
                    className="h-10 w-10 text-sidebar-foreground/50 hover:text-sidebar-foreground hover:bg-sidebar-accent/60"
                  >
                    <LogOut className="h-4 w-4" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent side="right" sideOffset={8}>
                  Sign out
                </TooltipContent>
              </Tooltip>
            </div>
          ) : (
            <div className="flex items-center gap-3 px-2 py-2 rounded-lg text-sm font-medium">
              <div className="w-8 h-8 rounded-full bg-sidebar-accent flex items-center justify-center flex-shrink-0">
                <span className="text-xs font-semibold">{initials}</span>
              </div>
              <div className="flex-1 overflow-hidden">
                <div className="truncate font-semibold text-sidebar-foreground">Admin</div>
                <div className="truncate text-xs text-sidebar-foreground/50">{session?.user.email}</div>
              </div>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => signOut()}
                className="text-sidebar-foreground/60 hover:text-sidebar-foreground hover:bg-sidebar-accent flex-shrink-0"
                title="Sign out"
              >
                <LogOut className="h-4 w-4" />
              </Button>
            </div>
          )}
        </div>
      </aside>

      {/* Mobile Overlay */}
      {mobileOpen && (
        <div
          className="fixed inset-0 bg-black/50 z-30 md:hidden"
          onClick={() => setMobileOpen(false)}
        />
      )}

      {/* Main Content */}
      <main className="flex-1 flex flex-col min-w-0 overflow-hidden bg-background">
        <div className="flex-1 overflow-y-auto p-4 md:p-8">
          <div className="mx-auto max-w-7xl">
            {children}
          </div>
        </div>
      </main>
    </div>
  )
}