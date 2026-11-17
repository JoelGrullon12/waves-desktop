import {
  ChevronDown,
  ChevronUp,
  Disc3,
  Home,
  Library,
  Music,
  PanelLeftClose,
  PanelLeftOpen,
  Search,
  Settings,
  Star,
  type LucideIcon,
} from "lucide-react";
import { NavLink } from "react-router";
import appIcon from "@/assets/app-icon.png";
import { SidebarPlaylists } from "@/components/layout/SidebarPlaylists";
import { PREFERENCE_KEYS, readBooleanPreference } from "@/lib/preferences";
import { cn } from "@/lib/utils";
import { usePreferencesStore } from "@/store/preferencesStore";

interface NavigationEntry {
  to: string;
  label: string;
  icon: LucideIcon;
  end?: boolean;
}

const MAIN_NAVIGATION: NavigationEntry[] = [
  { to: "/", label: "Home", icon: Home, end: true },
  { to: "/songs", label: "Songs", icon: Music },
  { to: "/search", label: "Search", icon: Search },
];

// Behind "Show more…", so the playlists get the room.
const MORE_NAVIGATION: NavigationEntry[] = [
  { to: "/library", label: "Library", icon: Library },
  { to: "/favorites", label: "Favorites", icon: Star },
  { to: "/releases", label: "New releases", icon: Disc3 },
  { to: "/settings", label: "Settings", icon: Settings },
];

const ENTRY_CLASS =
  "flex items-center gap-2.5 rounded-md px-2.5 py-1.5 text-sm font-medium transition-colors";
const IDLE_ENTRY_CLASS = "text-sidebar-foreground hover:bg-sidebar-accent/70";

function NavigationLink({ entry, labelClass }: { entry: NavigationEntry; labelClass: string }) {
  const { to, label, icon: Icon, end } = entry;
  return (
    <NavLink
      to={to}
      end={end}
      title={label}
      className={({ isActive }) =>
        cn(ENTRY_CLASS, isActive ? "bg-sidebar-accent text-sidebar-accent-foreground" : IDLE_ENTRY_CLASS)
      }
    >
      <Icon className="size-4 shrink-0" aria-hidden />
      <span className={labelClass}>{label}</span>
    </NavLink>
  );
}

// Collapses to an icon rail when the user asks for it, and always on narrow
// windows (below the `lg` breakpoint), so the content keeps its room.
export function Sidebar() {
  const values = usePreferencesStore((state) => state.values);
  const setPreference = usePreferencesStore((state) => state.setPreference);
  const isCollapsed = readBooleanPreference(values, PREFERENCE_KEYS.sidebarCollapsed, false);
  const showsMore = readBooleanPreference(values, PREFERENCE_KEYS.sidebarShowMore, false);
  const labelClass = cn("truncate max-lg:hidden", isCollapsed && "hidden");
  const CollapseIcon = isCollapsed ? PanelLeftOpen : PanelLeftClose;
  const MoreIcon = showsMore ? ChevronUp : ChevronDown;
  const moreLabel = showsMore ? "Show less…" : "Show more…";

  return (
    <aside
      className={cn(
        "flex shrink-0 flex-col border-r bg-sidebar max-lg:w-14",
        isCollapsed ? "w-14" : "w-56",
      )}
      data-collapsed={isCollapsed}
    >
      <div
        className={cn(
          "flex items-center gap-2 px-3.5 py-4 max-lg:flex-col max-lg:px-2",
          isCollapsed && "flex-col px-2",
        )}
      >
        <img src={appIcon} alt="" className="size-7 shrink-0 rounded-md" draggable={false} />
        <span className={cn("min-w-0 flex-1 text-sm font-semibold tracking-tight", labelClass)}>Waves</span>
        <button
          type="button"
          title={isCollapsed ? "Expand sidebar" : "Collapse sidebar"}
          aria-label={isCollapsed ? "Expand sidebar" : "Collapse sidebar"}
          className="rounded-md p-1 text-muted-foreground transition-colors hover:bg-sidebar-accent/70 hover:text-sidebar-foreground max-lg:hidden"
          onClick={() => setPreference(PREFERENCE_KEYS.sidebarCollapsed, String(!isCollapsed))}
        >
          <CollapseIcon className="size-4" aria-hidden />
        </button>
      </div>

      <nav className="flex flex-col gap-0.5 px-2" aria-label="Main">
        {MAIN_NAVIGATION.map((entry) => (
          <NavigationLink key={entry.to} entry={entry} labelClass={labelClass} />
        ))}
        {showsMore &&
          MORE_NAVIGATION.map((entry) => (
            <NavigationLink key={entry.to} entry={entry} labelClass={labelClass} />
          ))}
        <button
          type="button"
          title={moreLabel}
          aria-expanded={showsMore}
          className={cn(ENTRY_CLASS, IDLE_ENTRY_CLASS, "text-muted-foreground")}
          onClick={() => setPreference(PREFERENCE_KEYS.sidebarShowMore, String(!showsMore))}
        >
          <MoreIcon className="size-4 shrink-0" aria-hidden />
          <span className={labelClass}>{moreLabel}</span>
        </button>
      </nav>

      <SidebarPlaylists isRail={isCollapsed} />
    </aside>
  );
}
