"use client";
import { useMemo, useState } from "react";
import {
  DndContext, DragOverlay, KeyboardSensor, PointerSensor, TouchSensor, useDraggable, useDroppable, useSensor, useSensors,
  type DragEndEvent, type DragStartEvent,
} from "@dnd-kit/core";
import { AnimatePresence, motion } from "motion/react";
import { ArrowDownWideNarrow, CalendarClock, ChevronDown, Inbox, X } from "lucide-react";
import type { Contract, Status } from "@/core/types";
import { useApp } from "@/data/store";
import { ContractCard } from "../components/ContractCard";
import { Dashboard } from "../components/Dashboard";
import { Button, EASE_OUT, Empty, cn } from "../components/ui";
import { KPI_FILTERS, STATUSES, STATUS_META, useKanbanColumns } from "../selectors";

export function KanbanView() {
  const cols = useKanbanColumns();
  const { smartSort, set, filter, snap, byId } = useApp();
  const [activeId, setActiveId] = useState<string | null>(null);
  const [overCol, setOverCol] = useState<Status | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 180, tolerance: 8 } }),
    useSensor(KeyboardSensor)
  );

  const onStart = (e: DragStartEvent) => setActiveId(String(e.active.id));
  const onEnd = (e: DragEndEvent) => {
    setActiveId(null);
    setOverCol(null);
    const to = e.over?.id as Status | undefined;
    const c = byId[String(e.active.id)];
    if (!to || !c || c.crm.status === to) return;
    if (to === "renovado" || to === "no_renueva") set("closeDialog", { contractId: c.id, to });
    else void useApp.getState().move(c.id, to);
  };

  const active = activeId ? byId[activeId] : null;

  return (
    <div className="flex h-full flex-col">
      <Dashboard />
      <div className="flex flex-wrap items-center justify-between gap-2 px-4 pb-3 pt-1 sm:px-6">
        <div className="flex flex-wrap items-center gap-2">
          {filter.kpi && (
            <button onClick={() => set("filter", { ...filter, kpi: null })} className="pressable inline-flex items-center gap-1.5 rounded-full bg-ink px-3 py-1 text-xs font-medium text-surface">
              {KPI_FILTERS[filter.kpi].label} <X size={12} />
            </button>
          )}
          <p className="text-xs text-muted">
            A Pendents hi ha els que vencen en els propers {snap?.settings.horizonteDias} dies o ja han vençut. La resta són a Cartera.
          </p>
        </div>
        <Button size="sm" variant={smartSort ? "primary" : "secondary"} onClick={() => set("smartSort", !smartSort)} title="Reordena les targetes de cada columna segons la puntuació 0–100">
          {smartSort ? <ArrowDownWideNarrow size={14} /> : <CalendarClock size={14} />}
          {smartSort ? "Prioritat intel·ligent" : "Per data de venciment"}
        </Button>
      </div>

      <DndContext sensors={sensors} onDragStart={onStart} onDragOver={(e) => setOverCol((e.over?.id as Status) ?? null)} onDragEnd={onEnd} onDragCancel={() => { setActiveId(null); setOverCol(null); }}>
        <div className="scroll-thin flex min-h-0 flex-1 snap-x snap-mandatory gap-3 overflow-x-auto px-4 pb-6 sm:px-6 lg:grid lg:snap-none lg:grid-cols-4 lg:overflow-x-visible">
          {STATUSES.map((s) => (
            <Column key={s} status={s} items={cols[s]} highlight={!!active && overCol === s && active.crm.status !== s} dragging={!!active} />
          ))}
        </div>
        <DragOverlay dropAnimation={{ duration: 220, easing: "cubic-bezier(0.23, 1, 0.32, 1)" }}>
          {active ? <div className="w-[300px]"><ContractCard c={active} overlay /></div> : null}
        </DragOverlay>
      </DndContext>
    </div>
  );
}

const PAGE = 40;

function Column({ status, items, highlight, dragging }: { status: Status; items: Contract[]; highlight: boolean; dragging: boolean }) {
  const { setNodeRef } = useDroppable({ id: status });
  const [limit, setLimit] = useState(PAGE);
  const meta = STATUS_META[status];
  const shown = useMemo(() => items.slice(0, limit), [items, limit]);
  return (
    <section
      ref={setNodeRef}
      aria-label={meta.label}
      className={cn(
        "flex min-h-[300px] w-[86vw] shrink-0 snap-start flex-col rounded-2xl border bg-elevated/60 transition-[border-color,background-color,box-shadow] duration-200 sm:w-[340px] lg:w-auto lg:min-w-0",
        highlight ? "shadow-[0_0_0_3px_var(--ring)]" : "border-line",
      )}
      style={{ ...(highlight ? { borderColor: meta.color, background: meta.soft } : {}), ["--ring" as string]: meta.soft }}
    >
      <header className="sticky top-0 z-[1] flex items-center gap-2 rounded-t-2xl px-3.5 pb-2 pt-3">
        <span className="h-2.5 w-2.5 rounded-full" style={{ background: meta.color }} />
        <h2 className="text-[13px] font-semibold">{meta.label}</h2>
        <motion.span key={items.length} initial={{ scale: 0.85, opacity: 0.4 }} animate={{ scale: 1, opacity: 1 }} transition={{ duration: 0.25, ease: EASE_OUT }}
          className="ml-auto rounded-full px-2 py-0.5 text-xs font-semibold tnum" style={{ background: meta.soft, color: meta.color }}>
          {items.length.toLocaleString("ca-ES")}
        </motion.span>
      </header>
      <p className="px-3.5 pb-2 text-[11px] text-muted">{meta.hint}</p>
      <div className="scroll-thin flex flex-1 flex-col gap-2 overflow-y-auto px-2.5 pb-3 lg:max-h-[calc(100vh-330px)]">
        <AnimatePresence initial={false}>
          {shown.map((c) => <DraggableCard key={c.id} c={c} />)}
        </AnimatePresence>
        {items.length === 0 && !dragging && <Empty icon={<Inbox size={22} />} title="Res per aquí" body={status === "pendiente" ? "No hi ha contractes a la finestra de renovació amb aquests filtres." : "Arrossega una targeta a aquesta columna."} />}
        {dragging && items.length === 0 && <div className="flex-1 rounded-xl border-2 border-dashed" style={{ borderColor: meta.color, opacity: 0.4 }} />}
        {items.length > limit && (
          <Button variant="ghost" size="sm" onClick={() => setLimit(limit + PAGE)} className="mt-1">
            <ChevronDown size={14} /> Mostra'n {Math.min(PAGE, items.length - limit)} més de {items.length - limit}
          </Button>
        )}
      </div>
    </section>
  );
}

function DraggableCard({ c }: { c: Contract }) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id: c.id });
  return (
    <motion.div
      layout="position"
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.96 }}
      transition={{ duration: 0.22, ease: EASE_OUT }}
      ref={setNodeRef}
      {...attributes}
      {...listeners}
      className="touch-manipulation outline-none"
      aria-roledescription="Targeta arrossegable"
    >
      <ContractCard c={c} dragging={isDragging} />
    </motion.div>
  );
}
