import { FileText, Home, Moon, Plus, Receipt, Settings, Sun } from "lucide-react";
import { NavLink, Outlet } from "react-router-dom";
import { Button } from "../ui/Button";
import { useQuoteFlowStore } from "../../store/useQuoteFlowStore";
import { cn } from "../../lib/utils";

const navItems = [
  { href: "/", label: "Dashboard", icon: Home },
  { href: "/records", label: "Records", icon: FileText },
  { href: "/quotations/new", label: "Quote", icon: Plus },
  { href: "/invoices/new", label: "Invoice", icon: Receipt },
  { href: "/settings", label: "Settings", icon: Settings },
];

export function AppShell() {
  const theme = useQuoteFlowStore((state) => state.theme);
  const setTheme = useQuoteFlowStore((state) => state.setTheme);

  return (
    <div className="min-h-screen bg-sand-50 text-slate-900 transition dark:bg-slate-950 dark:text-slate-100">
      <div className="min-h-screen bg-grid">
        <header className="safe-top sticky top-0 z-30 border-b border-white/70 bg-sand-50/90 backdrop-blur dark:border-white/10 dark:bg-slate-950/90">
          <div className="mx-auto flex max-w-7xl items-center justify-between gap-3 px-4 py-3 sm:px-6 lg:px-8">
            <NavLink className="flex items-center gap-3" to="/">
              <span className="flex h-11 w-11 items-center justify-center rounded-[18px] bg-brand-600 text-lg font-extrabold text-white shadow-sm">
                QF
              </span>
              <span>
                <span className="block text-lg font-extrabold leading-5 text-slate-950 dark:text-white">
                  QuoteFlow
                </span>
                <span className="hidden text-xs font-semibold uppercase tracking-[0.14em] text-slate-500 dark:text-slate-400 sm:block">
                  Quotes and invoices
                </span>
              </span>
            </NavLink>

            <div className="flex items-center gap-2">
              <Button
                aria-label="Toggle theme"
                className="!min-h-11 !rounded-2xl !px-3"
                onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
                variant="secondary"
              >
                {theme === "dark" ? <Sun size={18} /> : <Moon size={18} />}
              </Button>
            </div>
          </div>

          <nav className="mx-auto flex max-w-7xl gap-2 overflow-x-auto px-4 pb-3 sm:px-6 lg:px-8">
            {navItems.map((item) => {
              const Icon = item.icon;
              return (
                <NavLink
                  className={({ isActive }) =>
                    cn(
                      "inline-flex min-h-11 shrink-0 items-center justify-center gap-2 rounded-[1rem] px-3 text-sm font-semibold transition",
                      isActive
                        ? "bg-brand-600 text-white shadow-sm"
                        : "bg-white/80 text-slate-600 hover:text-brand-700 dark:bg-white/5 dark:text-slate-300 dark:hover:text-brand-100",
                    )
                  }
                  end={item.href === "/"}
                  key={item.href}
                  to={item.href}
                >
                  <Icon size={16} />
                  {item.label}
                </NavLink>
              );
            })}
          </nav>
        </header>

        <main className="mx-auto max-w-7xl px-4 py-5 sm:px-6 sm:py-6 lg:px-8">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
