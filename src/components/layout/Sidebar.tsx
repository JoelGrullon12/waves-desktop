import {
  Disc3,
  Home,
  Library,
  LogOut,
  Music,
  PanelLeftClose,
  PanelLeftOpen,
  Search,
  Settings,
  Star,
  type LucideIcon,
} from "lucide-react";
import { NavLink } from "react-router";
import { SidebarPlaylists } from "@/components/layout/SidebarPlaylists";
import { useLogout } from "@/hooks/useLogout";
import { PREFERENCE_KEYS, readBooleanPreference } from "@/lib/preferences";
import { cn } from "@/lib/utils";
import { usePreferencesStore } from "@/store/preferencesStore";

const NAVIGATION: Array<{ to: string; label: string; icon: LucideIcon; end?: boolean }> = [
  { to: "/", label: "Home", icon: Home, end: true },
  { to: "/search", label: "Search", icon: Search },
  { to: "/songs", label: "Songs", icon: Music },
  { to: "/favorites", label: "Favorites", icon: Star },
  { to: "/library", label: "Library", icon: Library },
  { to: "/releases", label: "New releases", icon: Disc3 },
  { to: "/settings", label: "Settings", icon: Settings },
];

const ENTRY_CLASS =
  "flex items-center gap-2.5 rounded-md px-2.5 py-1.5 text-sm font-medium transition-colors";

// Collapses to an icon rail when the user asks for it, and always on narrow
// windows (below the `lg` breakpoint), so the content keeps its room.
export function Sidebar() {
  const handleLogout = useLogout();
  const values = usePreferencesStore((state) => state.values);
  const setPreference = usePreferencesStore((state) => state.setPreference);
  const isCollapsed = readBooleanPreference(values, PREFERENCE_KEYS.sidebarCollapsed, false);
  const labelClass = cn("truncate max-lg:hidden", isCollapsed && "hidden");
  const CollapseIcon = isCollapsed ? PanelLeftOpen : PanelLeftClose;

  return (
    <aside
      className={cn(
        "flex shrink-0 flex-col border-r bg-sidebar max-lg:w-14",
        isCollapsed ? "w-14" : "w-56",
      )}
      data-collapsed={isCollapsed}
    >
      <div className="flex items-center gap-2 px-3.5 py-4">
        <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-sidebar-primary text-sidebar-primary-foreground">
          <span className="text-xs font-bold">W</span>
        </div>
        <span className={cn("text-sm font-semibold tracking-tight", labelClass)}>Waves Desktop</span>
      </div>

      <nav className="flex flex-col gap-0.5 px-2">
        {NAVIGATION.map(({ to, label, icon: Icon, end }) => (
          <NavLink
            key={to}
            to={to}
            end={end}
            title={label}
            className={({ isActive }) =>
              cn(
                ENTRY_CLASS,
                isActive
                  ? "bg-sidebar-accent text-sidebar-accent-foreground"
                  : "text-sidebar-foreground hover:bg-sidebar-accent/70",
              )
            }
          >
            <Icon className="size-4 shrink-0" aria-hidden />
            <span className={labelClass}>{label}</span>
          </NavLink>
        ))}
      </nav>

      <SidebarPlaylists isRail={isCollapsed} />

      <div className="flex flex-col gap-0.5 border-t border-sidebar-border px-2 pt-2 pb-3">
        <button
          type="button"
          title={isCollapsed ? "Expand sidebar" : "Collapse sidebar"}
          aria-label={isCollapsed ? "Expand sidebar" : "Collapse sidebar"}
          className={cn(ENTRY_CLASS, "text-sidebar-foreground hover:bg-sidebar-accent/70 max-lg:hidden")}
          onClick={() => setPreference(PREFERENCE_KEYS.sidebarCollapsed, String(!isCollapsed))}
        >
          <CollapseIcon className="size-4 shrink-0" aria-hidden />
          <span className={labelClass}>Collapse</span>
        </button>
        <button
          type="button"
          title="Log out"
          className={cn(ENTRY_CLASS, "text-sidebar-foreground hover:bg-sidebar-accent/70")}
          onClick={() => void handleLogout()}
        >
          <LogOut className="size-4 shrink-0" aria-hidden />
          <span className={labelClass}>Log out</span>
        </button>
      </div>
    </aside>
  );
}
