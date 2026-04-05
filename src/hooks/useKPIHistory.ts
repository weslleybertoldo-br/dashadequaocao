import { useState, useCallback } from "react";
import {
  fetchCardsUpdatedSince,
  loadConfigFromServer,
  PipefyCard,
} from "@/lib/pipefy";
import { contarAtivacoesSapron, clearSapronCache } from "@/lib/sapron";
import { salvarDiaSupabase, salvarUltimaAtualizacao } from "@/lib/supabaseData";

// Re-export for consumers
export type { DiaData } from "@/lib/supabaseData";

// ── BRT date helpers ─────────────────────────────────────

function toBRT(date: Date): Date {
  return new Date(date.getTime() - 3 * 60 * 60 * 1000);
}

function toDateISO(date: Date): string {
  const d = String(date.getUTCDate()).padStart(2, "0");
  const m = String(date.getUTCMonth() + 1).padStart(2, "0");
  const y = date.getUTCFullYear();
  return `${y}-${m}-${d}`;
}

export function hojeISO(): string {
  return toDateISO(toBRT(new Date()));
}

function diasPassadosDoMes(): string[] {
  const hoje = toBRT(new Date());
  const ano = hoje.getUTCFullYear();
  const mes = hoje.getUTCMonth();
  const diaHoje = hoje.getUTCDate();
  const dias: string[] = [];

  for (let d = 1; d <= diaHoje; d++) {
    const dia = new Date(Date.UTC(ano, mes, d));
    const diaSemana = dia.getUTCDay();
    if (diaSemana !== 0) {
      dias.push(toDateISO(dia));
    }
  }
  return dias;
}

// ── Count finalizados per day using Pipefy phases_history ──

const FASE_11_ID = "323044845";

interface ContagemDia {
  total: number;
  imoveis: string[];
}

function contarFinalizadosPorDia(
  cards: PipefyCard[],
  listaDeDatas: string[]
): Record<string, ContagemDia> {
  const resultado: Record<string, ContagemDia> = {};
  listaDeDatas.forEach((d) => (resultado[d] = { total: 0, imoveis: [] }));

  cards.forEach((card) => {
    const entrada = card.phases_history?.find(
      (h) => String(h.phase?.id) === String(FASE_11_ID)
    );
    if (!entrada?.firstTimeIn) return;

    const dataBRT = toDateISO(toBRT(new Date(entrada.firstTimeIn)));
    if (resultado.hasOwnProperty(dataBRT)) {
      resultado[dataBRT].total++;
      resultado[dataBRT].imoveis.push(card.title);
    }
  });

  return resultado;
}

// ── Hook ─────────────────────────────────────────────────

export function useKPIHistory() {
  const [loadingKPI, setLoadingKPI] = useState(false);
  const [progresso, setProgresso] = useState<string | null>(null);
  const [refreshTrigger, setRefreshTrigger] = useState(0);

  const inicializar = useCallback(async () => {
    const dias = diasPassadosDoMes();
    if (dias.length === 0) return;

    setLoadingKPI(true);

    try {
      // ── Ativacao: busca do Sapron (status_log com status "Active") ──
      setProgresso("Buscando ativacoes do Sapron...");
      clearSapronCache();
      const contagemAtivacao = await contarAtivacoesSapron(dias);

      // ── Finalizados: busca do Pipefy (phases_history Fase 11) ──
      setProgresso("Buscando finalizados do Pipefy...");
      const config = await loadConfigFromServer();
      const primeiroDia = dias[0];
      const sinceISO = `${primeiroDia}T00:00:00-03:00`;

      const allCards = await fetchCardsUpdatedSince(config.token, config.pipeId, sinceISO);

      // Deduplicate
      const vistos = new Set<string>();
      const cardsSemDuplicata: PipefyCard[] = [];
      for (const c of allCards) {
        if (!vistos.has(c.id)) {
          vistos.add(c.id);
          cardsSemDuplicata.push(c);
        }
      }

      const contagemFinalizados = contarFinalizadosPorDia(cardsSemDuplicata, dias);

      // ── Salvar no banco ──
      setProgresso("Salvando no banco de dados...");

      const savePromises: Promise<void>[] = [];
      dias.forEach((dataISO) => {
        const atv = contagemAtivacao[dataISO] ?? { total: 0, imoveis: [] };
        const fin = contagemFinalizados[dataISO] ?? { total: 0, imoveis: [] };
        savePromises.push(salvarDiaSupabase(dataISO, "ativacao", atv.total, atv.imoveis));
        savePromises.push(salvarDiaSupabase(dataISO, "finalizados", fin.total, fin.imoveis));
      });
      await Promise.all(savePromises);

      await salvarUltimaAtualizacao();

      setProgresso(null);
      setRefreshTrigger((p) => p + 1);
    } catch (err: any) {
      console.error("Erro ao buscar historico:", err);
      setProgresso("Erro ao carregar historico.");
    } finally {
      setLoadingKPI(false);
    }
  }, []);

  const forcarAtualizacao = useCallback(() => {
    inicializar();
  }, [inicializar]);

  return { loadingKPI, progresso, refreshTrigger, forcarAtualizacao };
}
