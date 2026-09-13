import { Home, LogOut, Search } from "lucide-react";
import { NavLink } from "react-router";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { usePlayerStore } from "@/store/playerStore";
import { useSessionStore } from "@/store/sessionStore";

const navLinkClass = ({ isActive }: { isActive: boolean }) =>
  cn(
    "flex items-center gap-2.5 rounded-md px-2.5 py-1.5 text-sm font-medium transition-colors",
    isActive
      ? "bg-sidebar-accent text-sidebar-accent-foreground"
      : "text-sidebar-foreground hover:bg-sidebar-accent/70",
  );

export function Sidebar() {
  const logout = useSessionStore((state) => state.logout);
  const stopAndReset = usePlayerStore((state) => state.stopAndReset);

  const handleLogout = async () => {
    await stopAndReset();
    await logout();
  };

  return (
    <aside className="flex w-56 shrink-0 flex-col border-r bg-sidebar">
      <div className="flex items-center gap-2 px-4 py-4">
        <div className="flex h-7 w-7 items-center justify-center rounded-full bg-sidebar-primary text-sidebar-primary-foreground">
          <span className="text-xs font-bold">W</span>
        </div>
        <span className="text-sm font-semibold tracking-tight">Waves Desktop</span>
      </div>

      <nav className="flex flex-col gap-0.5 px-2">
        <NavLink to="/" end className={navLinkClass}>
          <Home className="size-4" aria-hidden />
          Your Library
        </NavLink>
        <NavLink to="/search" className={navLinkClass}>
          <Search className="size-4" aria-hidden />
          Search
        </NavLink>
      </nav>

      <div className="mt-auto px-2 pb-3">
        <Button
          variant="ghost"
          size="default"
          className="w-full justify-start gap-2.5 text-sidebar-foreground hover:bg-sidebar-accent/70 hover:text-sidebar-accent-foreground"
          onClick={() => void handleLogout()}
        >
          <LogOut className="size-4" aria-hidden />
          Log out
        </Button>
      </div>
    </aside>
  );
}