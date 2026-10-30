"use client";
import { create } from "zustand";
import { computePriority, type Priority } from "@/core/priority";
import { sameOffer } from "@/core/offersTemplate";
import { assigneeKey, canSee } from "@/core/roles";
import { today } from "@/core/dates";
import type { Activity, Contract, CrmState, SourceContract, Integrations, Offer, ProposalDoc, Settings, Status, Task, Template, User } from "@/core/types";
import type { ImportReport } from "@/core/importer";
import { ConflictError, type Repo, type Snapshot } from "./repo";
import { uid } from "./defaults";

export type View = "kanban" | "hoy" | "calendario" | "cartera" | "estadisticas" | "propuestas" | "plantillas" | "sips" | "ajustes";

export interface Toast { id: string; title: string; body?: string; tone?: "ok" | "err" | "info"; undo?: () => void }

interface State {
  repo: Repo | null;
  ready: boolean;
  error: string | null;
  snap: Snapshot | null;
  integrations: Integrations;
  contracts: Contract[]; // merged & role-filtered
  byId: Record<string, Contract>;
  priority: Record<string, Priority>;
  view: View;
  openId: string | null;
  drawerTab: string;
  composer: { contractId: string; channel: "whatsapp" | "email"; templateId?: string; attachDocId?: string } | null;
  proposalFor: string | null;
  closeDialog: { contractId: string; to: "renovado" | "no_renueva" } | null;
  search: string;
  filter: { kpi: string | null; comercial: string | null; tipo: string | null };
  smartSort: boolean;
  dark: boolean;
  ambient: boolean;
  ambientRun: number;
  themePreview: string | null;
  toasts: Toast[];
  init(repo: Repo): Promise<void>;
  set<K extends keyof State>(k: K, v: State[K]): void;
  open(id: string | null, tab?: string): void;
  toast(t: Omit<Toast, "id">): void;
  dismiss(id: string): void;
  move(id: string, to: Status, extra?: Partial<CrmState>, note?: string): Promise<void>;
  patchCrm(id: string, patch: Partial<CrmState>, activity?: Omit<Activity, "id" | "at" | "by" | "contractId">): Promise<void>;
  log(a: Omit<Activity, "id" | "at" | "by">): Promise<Activity>;
  updateActivity(a: Activity): Promise<void>;
  saveTask(t: Partial<Task> & { title: string; due: string }): Promise<void>;
  toggleTask(id: string): Promise<void>;
  addDoc(d: Omit<ProposalDoc, "id" | "createdAt" | "createdBy">, blob: Blob): Promise<ProposalDoc>;
  saveOffer(o: Offer): Promise<void>;
  deleteOffer(id: string): Promise<void>;
  saveTemplates(t: Template[]): Promise<void>;
  saveSettings(s: Settings): Promise<void>;
  applyImport(contracts: SourceContract[], report: ImportReport, origin: string): Promise<void>;
  syncRemote(): Promise<void>;
  switchUser(id: string): Promise<void>;
  recompute(): void;
}

function defaultState(c: SourceContract): CrmState {
  return {
    contractId: c.id,
    status: c.status,
    statusChangedAt: c.fechaInicio ?? today(),
    statusChangedBy: "importació",
    motivoRechazo: c.motivoRechazo,
    version: 0,
  };
}

export function visibleFor(me: User, c: SourceContract) {
  return canSee(me, c);
}

export const useApp = create<State>((set, get) => ({
  repo: null,
  ready: false,
  error: null,
  snap: null,
  integrations: { supabase: false, googleSync: false, smtp: false, ai: false, whatsappCloud: false },
  contracts: [],
  byId: {},
  priority: {},
  view: "kanban",
  openId: null,
  drawerTab: "resumen",
  composer: null,
  proposalFor: null,
  closeDialog: null,
  search: "",
  filter: { kpi: null, comercial: null, tipo: null },
  smartSort: true,
  dark: false,
  ambient: true,
  ambientRun: 0,
  themePreview: null,
  toasts: [],

  async init(repo) {
    try {
      const [snap, integrations] = await Promise.all([repo.load(), repo.integrations()]);
      let dark = false;
      let ambient = true;
      try { ambient = localStorage.getItem("rip:ambient") !== "off"; } catch { /* ignore */ }
      try { dark = localStorage.getItem("rip:theme") === "dark" || (!localStorage.getItem("rip:theme") && matchMedia("(prefers-color-scheme: dark)").matches); } catch { /* ignore */ }
      set({ repo, snap, integrations, ready: true, dark, ambient });
      get().recompute();
    } catch (e) {
      set({ error: e instanceof Error ? e.message : String(e), ready: true });
    }
  },
  set: (k, v) => set({ [k]: v } as Partial<State>),
  open: (id, tab = "resumen") => set({ openId: id, drawerTab: tab }),
  toast(t) {
    const id = uid();
    set({ toasts: [...get().toasts, { ...t, id }] });
    setTimeout(() => get().dismiss(id), t.undo ? 6000 : 3800);
  },
  dismiss: (id) => set({ toasts: get().toasts.filter((t) => t.id !== id) }),

  recompute() {
    const snap = get().snap;
    if (!snap) return;
    const contracts: Contract[] = [];
    const byId: Record<string, Contract> = {};
    const priority: Record<string, Priority> = {};
    const ref = today();
    for (const s of snap.source) {
      if (!visibleFor(snap.me, s)) continue;
      const c: Contract = { ...s, crm: snap.states[s.id] ?? defaultState(s) };
      contracts.push(c);
      byId[c.id] = c;
    }
    const tasks = snap.tasks;
    for (const c of contracts) priority[c.id] = computePriority(c, tasks, snap.settings.pesos, ref);
    set({ contracts, byId, priority });
  },

  async move(id, to, extra = {}, note) {
    const c = get().byId[id];
    if (!c || c.crm.status === to) return;
    const prev = c.crm;
    const me = get().snap!.me;
    const next: CrmState = {
      ...prev,
      ...extra,
      status: to,
      statusChangedAt: new Date().toISOString(),
      statusChangedBy: me.name,
      ...(to === "contactado" && !prev.ultimoContacto ? { ultimoContacto: new Date().toISOString() } : {}),
    };
    await commit(id, next, prev.version);
    const LABEL: Record<Status, string> = { pendiente: "Pendents", contactado: "Contactats", renovado: "Renovats", no_renueva: "No vol renovar" };
    await get().log({ contractId: id, type: "status", title: `${LABEL[prev.status]} → ${LABEL[to]}`, body: note ?? extra.motivoRechazo ?? extra.condicionesRenovacion ?? undefined, meta: { from: prev.status, to } });
    get().toast({
      title: `Mogut a ${LABEL[to]}`,
      body: c.cliente,
      tone: "ok",
      undo: async () => {
        const cur = get().byId[id];
        await commit(id, { ...prev, statusChangedAt: new Date().toISOString(), statusChangedBy: me.name }, cur.crm.version);
        await get().log({ contractId: id, type: "status", title: `Desfet: ${LABEL[to]} → ${LABEL[prev.status]}` });
      },
    });
  },

  async patchCrm(id, patch, activity) {
    const c = get().byId[id];
    if (!c) return;
    await commit(id, { ...c.crm, ...patch }, c.crm.version);
    if (activity) await get().log({ contractId: id, ...activity });
  },

  async log(a) {
    const snap = get().snap!;
    const full: Activity = { ...a, id: uid(), at: new Date().toISOString(), by: snap.me.name };
    set({ snap: { ...snap, activities: [full, ...snap.activities] } });
    await get().repo!.addActivity(full);
    return full;
  },
  async updateActivity(a) {
    const snap = get().snap!;
    set({ snap: { ...snap, activities: snap.activities.map((x) => (x.id === a.id ? a : x)) } });
    await get().repo!.updateActivity(a);
  },

  async saveTask(t) {
    const snap = get().snap!;
    const existing = t.id ? snap.tasks.find((x) => x.id === t.id) : undefined;
    const full: Task = {
      id: t.id ?? uid(),
      contractId: t.contractId ?? existing?.contractId ?? null,
      title: t.title,
      due: t.due,
      assignee: t.assignee ?? existing?.assignee ?? assigneeKey(snap.me),
      done: t.done ?? existing?.done ?? false,
      createdAt: existing?.createdAt ?? new Date().toISOString(),
      createdBy: existing?.createdBy ?? snap.me.name,
      kind: t.kind ?? existing?.kind ?? "seguimiento",
    };
    const tasks = existing ? snap.tasks.map((x) => (x.id === full.id ? full : x)) : [full, ...snap.tasks];
    set({ snap: { ...snap, tasks } });
    await get().repo!.upsertTask(full);
    if (!existing && full.contractId) {
      await get().log({ contractId: full.contractId, type: "task", title: `Tasca programada: ${full.title}`, body: `Per al ${full.due} · ${full.assignee}` });
      const c = get().byId[full.contractId];
      if (c) await commit(c.id, { ...c.crm, proximaAccion: full.title, proximaAccionFecha: full.due }, c.crm.version);
    }
    get().recompute();
  },
  async toggleTask(id) {
    const t = get().snap!.tasks.find((x) => x.id === id);
    if (!t) return;
    await get().saveTask({ ...t, done: !t.done });
    if (!t.done && t.contractId) await get().log({ contractId: t.contractId, type: "task", title: `Tasca completada: ${t.title}` });
  },

  async addDoc(d, blob) {
    const snap = get().snap!;
    const full: ProposalDoc = { ...d, id: uid(), createdAt: new Date().toISOString(), createdBy: snap.me.name };
    const saved = await get().repo!.addDoc(full, blob);
    set({ snap: { ...get().snap!, docs: [saved, ...get().snap!.docs] } });
    await get().log({ contractId: d.contractId, type: "pdf", title: `Proposta PDF v${d.version} generada`, body: d.fileName, meta: { docId: saved.id, ahorro: d.ahorroAnual } });
    return saved;
  },

  async saveOffer(o) {
    const snap = get().snap!;
    // an offer with the same supplier + tariff + name replaces the previous one (no duplicates)
    const dups = snap.offers.filter((x) => x.id !== o.id && sameOffer(x, o));
    const rest = snap.offers.filter((x) => !dups.includes(x));
    const offers = rest.some((x) => x.id === o.id) ? rest.map((x) => (x.id === o.id ? o : x)) : [o, ...rest];
    set({ snap: { ...snap, offers } });
    try {
      await get().repo!.upsertOffer(o);
    } catch (e) {
      set({ snap: { ...get().snap!, offers: snap.offers } }); // roll back the optimistic change
      throw e;
    }
    for (const d of dups) await get().repo!.deleteOffer(d.id);
  },
  async deleteOffer(id) {
    const snap = get().snap!;
    set({ snap: { ...snap, offers: snap.offers.filter((o) => o.id !== id) } });
    await get().repo!.deleteOffer(id);
  },
  async saveTemplates(t) {
    set({ snap: { ...get().snap!, templates: t } });
    await get().repo!.saveTemplates(t);
  },
  async saveSettings(s) {
    set({ snap: { ...get().snap!, settings: s } });
    await get().repo!.saveSettings(s);
    get().recompute();
  },
  async applyImport(contracts, report, origin) {
    const r = await get().repo!.importSource(contracts, report, origin);
    const snap = await get().repo!.load();
    set({ snap });
    get().recompute();
    get().toast({ title: "Sincronització completada", body: `${r.added} nous · ${r.updated} actualitzats · ${r.unchanged} sense canvis. Es conserven els estats i els seguiments.`, tone: "ok" });
  },
  async syncRemote() {
    const repo = get().repo!;
    if (!repo.syncRemote) return;
    const r = await repo.syncRemote();
    const snap = await repo.load();
    set({ snap });
    get().recompute();
    get().toast({ title: "Sincronització completada", body: `${r.added} nous · ${r.updated} actualitzats · ${r.unchanged} sense canvis.`, tone: "ok" });
  },
  async switchUser(id) {
    const repo = get().repo!;
    if (!repo.switchUser) return;
    const me = await repo.switchUser(id);
    set({ snap: { ...get().snap!, me }, openId: null, filter: { kpi: null, comercial: null, tipo: null } });
    get().recompute();
  },
}));

async function commit(id: string, next: CrmState, expected: number) {
  const { repo, snap } = useApp.getState();
  const before = snap!.states[id];
  // optimistic
  useApp.setState({ snap: { ...snap!, states: { ...snap!.states, [id]: { ...next, version: expected + 1 } } } });
  useApp.getState().recompute();
  try {
    const saved = await repo!.saveState(next, expected);
    const s = useApp.getState().snap!;
    useApp.setState({ snap: { ...s, states: { ...s.states, [id]: saved } } });
  } catch (e) {
    const s = useApp.getState().snap!;
    if (e instanceof ConflictError) {
      useApp.setState({ snap: { ...s, states: { ...s.states, [id]: e.current } } });
      useApp.getState().toast({ title: "Conflicte d'edició", body: e.message, tone: "err" });
    } else {
      const states = { ...s.states };
      if (before) states[id] = before; else delete states[id];
      useApp.setState({ snap: { ...s, states } });
      useApp.getState().toast({ title: "No s'ha pogut desar", body: e instanceof Error ? e.message : String(e), tone: "err" });
    }
    useApp.getState().recompute();
    throw e;
  }
}
