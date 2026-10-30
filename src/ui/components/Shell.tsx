"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import {
  BarChart3, CalendarDays, FileSpreadsheet, FileText, KanbanSquare, LayoutList, Menu, MessageSquareText, Moon, RefreshCw, Search, Zap, Settings2, Sun, Sunrise, X,
} from "lucide-react";
import { daysUntil, fmtDateTime, relDays } from "@/core/dates";
import { expiry } from "@/core/insights";
import { titleCase } from "@/core/templates";
import { useApp, type View } from "@/data/store";
import { EASE_OUT, SupplierMark, cn } from "./ui";
import { STATUS_META, matchesSearch } from "../selectors";
import { LOGO_DATA_URL } from "@/core/logo";
import { AmbientLayer, ThemeChip, ThemeRibbon } from "./Ambient";
import { ROLE_LABEL, isStaff } from "@/core/roles";

const NAV: { id: View; label: string; icon: typeof KanbanSquare; admin?: boolean }[] = [
  { id: "kanban", label: "Renovacions", icon: KanbanSquare },
  { id: "hoy", label: "El teu pla d'avui", icon: Sunrise },
  { id: "calendario", label: "Calendari", icon: CalendarDays },
  { id: "cartera", label: "Cartera", icon: LayoutList },
  { id: "estadisticas", label: "Estadístiques", icon: BarChart3 },
  { id: "propuestas", label: "Ofertes", icon: FileText },
  { id: "plantillas", label: "Plantilles", icon: MessageSquareText },
  { id: "sips", label: "Buscador CUPS", icon: Zap },
  { id: "ajustes", label: "Configuració i dades", icon: Settings2, admin: true },
];

export function Logo({ compact }: { compact?: boolean }) {
  return (
    <div className="flex items-center gap-2.5">
      <img src={LOGO_DATA_URL} alt="Assessoria 3.0" width={34} height={34} className="h-[34px] w-[34px] shrink-0" />
      {!compact && (
        <div className="leading-none">
          <div className="text-[14px] font-bold tracking-tight">Assessoria 3.0</div>
          <div className="mt-0.5 text-[10.5px] text-muted">Renewal Intelligence Pro</div>
        </div>
      )}
    </div>
  );
}

export function Shell({ children }: { children: React.ReactNode }) {
  const { view, set, dark, snap, repo } = useApp();
  const [mobileNav, setMobileNav] = useState(false);
  useEffect(() => {
    document.documentElement.classList.toggle("dark", dark);
    try { localStorage.setItem("rip:theme", dark ? "dark" : "light"); } catch { /* ignore */ }
  }, [dark]);
  const nav = NAV.filter((n) => !n.admin || (!!snap && isStaff(snap.me.role)));
  const go = (v: View) => { set("view", v); setMobileNav(false); };

  const sidebar = (
    <nav className="flex h-full flex-col gap-1 p-3">
      <div className="px-2 pb-4 pt-1"><Logo /></div>
      {nav.map((n) => {
        const active = view === n.id;
        return (
          <button key={n.id} onClick={() => go(n.id)} className={cn("relative flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-[13.5px] font-medium transition-colors", active ? "text-ink" : "text-muted hover:bg-ink/[0.04] hover:text-ink")}>
            {active && <motion.span layoutId="nav-active" className="absolute inset-0 rounded-lg bg-ink/[0.07]" transition={{ duration: 0.22, ease: EASE_OUT }} />}
            <n.icon size={17} className="relative" /><span className="relative">{n.label}</span>
          </button>
        );
      })}
      <div className="mt-auto space-y-2">
        {repo?.variant === "demo" && snap && <UserSwitcher />}
        <SyncStatus />
      </div>
    </nav>
  );

  return (
    <div className="flex h-full">
      <aside className="hidden w-[232px] shrink-0 border-r border-line bg-surface lg:block">{sidebar}</aside>
      <AnimatePresence>
        {mobileNav && (
          <>
            <motion.div className="fixed inset-0 z-40 bg-black/30 lg:hidden" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setMobileNav(false)} />
            <motion.aside className="fixed inset-y-0 left-0 z-50 w-[260px] border-r border-line bg-surface lg:hidden" initial={{ x: "-100%" }} animate={{ x: 0 }} exit={{ x: "-100%" }} transition={{ duration: 0.3, ease: [0.32, 0.72, 0, 1] }}>{sidebar}</motion.aside>
          </>
        )}
      </AnimatePresence>
      <div className="flex min-w-0 flex-1 flex-col">
        {repo?.variant === "unconfigured" && (
          <button onClick={() => { set("view", "ajustes"); }} className="border-b border-red-500/25 bg-red-500/[0.08] px-4 py-1.5 text-center text-[11.5px] font-medium text-red-700 dark:text-red-300">
            Supabase no està configurat en aquest desplegament: sense inici de sessió, la IA, la sincronització amb Google, el correu i els usuaris no funcionen. Mira el diagnòstic a Configuració → Integracions.
          </button>
        )}
        {repo?.variant === "demo" && (
          <div className="flex items-center justify-center gap-2 border-b border-amber-500/25 bg-amber-500/[0.08] px-4 py-1.5 text-center text-[11.5px] text-amber-800 dark:text-amber-200">
            <span className="sm:hidden">Mode local: canvis desats en aquest navegador.</span>
            <span className="hidden sm:inline">Mode local: els canvis només es desen en aquest navegador. El correu, la IA i la sincronització automàtica s'activen en desplegar amb credencials.</span>
          </div>
        )}
        <header className="flex h-14 shrink-0 items-center gap-3 border-b border-line bg-surface/80 px-4 backdrop-blur sm:px-6">
          <button aria-label="Menú" className="pressable -ml-1 rounded-md p-1.5 lg:hidden" onClick={() => setMobileNav(true)}><Menu size={19} /></button>
          <div className="lg:hidden"><Logo compact /></div>
          <h1 className="hidden text-[15px] font-semibold sm:block">{NAV.find((n) => n.id === view)?.label}</h1>
          <ThemeChip />
          <GlobalSearch />
          <button aria-label={dark ? "Mode clar" : "Mode fosc"} onClick={() => set("dark", !dark)} className="pressable rounded-lg p-2 text-muted hover:bg-ink/5 hover:text-ink">
            {dark ? <Sun size={17} /> : <Moon size={17} />}
          </button>
        </header>
        <ThemeRibbon />
        <main className="scroll-thin min-h-0 flex-1 overflow-y-auto">{children}</main>
        <AmbientLayer />
      </div>
    </div>
  );
}

function UserSwitcher() {
  const { snap, switchUser } = useApp();
  return (
    <label className="block rounded-lg border border-dashed border-line p-2">
      <span className="mb-1 block text-[10.5px] text-muted">Veure com a (demo de permisos)</span>
      <select className="input h-8 py-1 text-[12.5px]" value={snap!.me.id} onChange={(e) => switchUser(e.target.value)}>
        {snap!.users.map((u) => <option key={u.id} value={u.id}>{u.name} · {ROLE_LABEL[u.role]}</option>)}
      </select>
    </label>
  );
}

function SyncStatus() {
  const { snap, integrations, syncRemote, set, toast } = useApp();
  const [busy, setBusy] = useState(false);
  const ls = snap?.lastSync;
  const run = async () => {
    if (!integrations.googleSync) { set("view", "ajustes"); return; }
    setBusy(true);
    try { await syncRemote(); } catch (e) { toast({ title: "Error de sincronització", body: e instanceof Error ? e.message : String(e), tone: "err" }); } finally { setBusy(false); }
  };
  return (
    <div className="rounded-lg bg-elevated p-2.5 text-[11.5px]">
      <div className="flex items-center gap-1.5 font-medium"><FileSpreadsheet size={13} className="text-brand" /> Origen de les dades</div>
      <p className="mt-0.5 line-clamp-2 text-muted">{ls ? `${ls.origin} · ${fmtDateTime(ls.at)}` : "Sense sincronitzar"}</p>
      <button onClick={run} disabled={busy} className="pressable mt-1.5 flex w-full items-center justify-center gap-1.5 rounded-md border border-line bg-surface py-1.5 font-medium hover:border-ink/25">
        <RefreshCw size={12} className={cn(busy && "animate-spin")} /> {integrations.googleSync ? "Sincronitza ara" : "Importa / sincronitza"}
      </button>
    </div>
  );
}

function GlobalSearch() {
  const { search, set, contracts, open } = useApp();
  const [focus, setFocus] = useState(false);
  const [sel, setSel] = useState(0);
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") { e.preventDefault(); ref.current?.focus(); }
      if (e.key === "/" && document.activeElement?.tagName !== "INPUT" && document.activeElement?.tagName !== "TEXTAREA") { e.preventDefault(); ref.current?.focus(); }
    };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, []);
  const results = useMemo(() => (search.length >= 2 ? contracts.filter((c) => matchesSearch(c, search)).slice(0, 8) : []), [search, contracts]);
  const pick = (id: string) => { open(id); setFocus(false); ref.current?.blur(); };
  return (
    <div className="relative ml-auto w-full max-w-md">
      <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
      <input
        ref={ref}
        value={search}
        onChange={(e) => { set("search", e.target.value); setSel(0); }}
        onFocus={() => setFocus(true)}
        onBlur={() => setTimeout(() => setFocus(false), 150)}
        onKeyDown={(e) => {
          if (e.key === "ArrowDown") { e.preventDefault(); setSel((s) => Math.min(s + 1, results.length - 1)); }
          if (e.key === "ArrowUp") { e.preventDefault(); setSel((s) => Math.max(s - 1, 0)); }
          if (e.key === "Enter" && results[sel]) pick(results[sel].id);
          if (e.key === "Escape") { set("search", ""); ref.current?.blur(); }
        }}
        placeholder="Cerca client, CUPS, NIF, telèfon…"
        className="input h-9 pl-9 pr-14"
        aria-label="Cercador global"
      />
      {search ? (
        <button aria-label="Esborrar" onClick={() => set("search", "")} className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-muted hover:text-ink"><X size={14} /></button>
      ) : (
        <kbd className="pointer-events-none absolute right-2.5 top-1/2 hidden -translate-y-1/2 rounded border border-line px-1.5 text-[10.5px] text-muted sm:block">Ctrl K</kbd>
      )}
      <AnimatePresence>
        {focus && results.length > 0 && (
          <motion.ul initial={{ opacity: 0, y: -4, scale: 0.98 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: -4 }} transition={{ duration: 0.16, ease: EASE_OUT }}
            className="absolute left-0 right-0 top-11 z-30 origin-top overflow-hidden rounded-xl border border-line bg-surface p-1 shadow-lift">
            {results.map((c, i) => {
              const d = daysUntil(expiry(c));
              return (
                <li key={c.id}>
                  <button onMouseDown={() => pick(c.id)} onMouseEnter={() => setSel(i)} className={cn("flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left", i === sel && "bg-ink/[0.05]")}>
                    <SupplierMark name={c.comercializadora} size={22} />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[13px] font-medium">{titleCase(c.cliente)}</p>
                      <p className="truncate text-[11px] text-muted">{c.poblacion} · {c.cups ?? c.cif}</p>
                    </div>
                    <span className="text-[11px]" style={{ color: STATUS_META[c.crm.status].color }}>{c.crm.status === "pendiente" || c.crm.status === "contactado" ? relDays(d) : STATUS_META[c.crm.status].label}</span>
                  </button>
                </li>
              );
            })}
          </motion.ul>
        )}
      </AnimatePresence>
    </div>
  );
}
