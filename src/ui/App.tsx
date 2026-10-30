"use client";
import { useEffect } from "react";
import { AnimatePresence, motion } from "motion/react";
import { Loader2 } from "lucide-react";
import type { Repo } from "@/data/repo";
import { useApp } from "@/data/store";
import { Composer } from "./components/Composer";
import { ContractDrawer } from "./components/ContractDrawer";
import { CloseDialog, Toasts } from "./components/Overlays";
import { ProposalWizard } from "./components/ProposalWizard";
import { Logo, Shell } from "./components/Shell";
import { EASE_OUT } from "./components/ui";
import { AjustesView } from "./views/Ajustes";
import { CalendarioView } from "./views/Calendario";
import { CarteraView } from "./views/Cartera";
import { EstadisticasView } from "./views/Estadisticas";
import { HoyView } from "./views/Hoy";
import { KanbanView } from "./views/Kanban";
import { OfertasView } from "./views/Ofertas";
import { PlantillasView } from "./views/Plantillas";
import { SipsView } from "./views/Sips";

export default function App({ repo }: { repo: Repo }) {
  const { ready, error, view, init } = useApp();
  useEffect(() => { void init(repo); }, [repo, init]);

  if (!ready) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-4">
        <Logo />
        <Loader2 className="animate-spin text-muted" size={20} />
      </div>
    );
  }
  if (error) {
    return <div className="flex h-full items-center justify-center p-6 text-center text-sm"><div><p className="font-semibold">No s'han pogut carregar les dades</p><p className="mt-1 text-muted">{error}</p></div></div>;
  }
  return (
    <Shell>
      <AnimatePresence mode="wait">
        <motion.div key={view} className="h-full" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.14, ease: EASE_OUT }}>
          {view === "kanban" && <KanbanView />}
          {view === "hoy" && <HoyView />}
          {view === "calendario" && <CalendarioView />}
          {view === "cartera" && <CarteraView />}
          {view === "estadisticas" && <EstadisticasView />}
          {view === "propuestas" && <OfertasView />}
          {view === "plantillas" && <PlantillasView />}
          {view === "sips" && <SipsView />}
          {view === "ajustes" && <AjustesView />}
        </motion.div>
      </AnimatePresence>
      <ContractDrawer />
      <Composer />
      <ProposalWizard />
      <CloseDialog />
      <Toasts />
    </Shell>
  );
}
