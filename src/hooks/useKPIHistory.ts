import { useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { loadConfigFromServer } from "@/lib/pipefy";
import { salvarDiaSupabase, DiaData } from "@/lib/supabaseData";

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

// ── Fetch cards with phases_history ──────────────────────

interface PhaseHistoryEntry {
  phase: { id: string };
  firstTimeIn: string;
}

interface CardWithHistory {
  id: string;
  title: string;
  phases_history: PhaseHistoryEntry[];
}

async function buscarCardsComHistorico(
  phaseId: string,
  token: string
): Promise<CardWithHistory[]> {
  const allCards: CardWithHistory[] = [];
  let cursor: string | null = null;
  let hasNext = true;

  while (hasNext) {
    const afterClause = cursor ? `, after: "${cursor}"` : "";
    const query = `{ phase(id: ${phaseId}) { cards(first: 50${afterClause}) { pageInfo { hasNextPage endCursor } edges { node { id title phases_history { phase { id } firstTimeIn } } } } } }`;

    const bodyPayload: any = { query };
    if (token && token !== "__USE_SERVER_TOKEN__") {
      bodyPayload.token = token;
    }

    let lastError: Error | null = null;
    let responseData: any = null;

    for (let attempt = 0; attempt < 3; attempt++) {
      if (attempt > 0) {
        await new Promise((r) => setTimeout(r, 1000 * Math.pow(2, attempt - 1)));
      }

      const { data, error } = await supabase.functions.invoke("pipefy-proxy", {
        body: bodyPayload,
      });

      if (error) {
        lastError = new Error(error.message || "Erro ao chamar pipefy-proxy");
        continue;
      }

      const json = data as any;
      if (json?.error && /502|504|Bad gateway|Gateway time/i.test(JSON.stringify(json))) {
        lastError = new Error(`Pipefy indisponível (tentativa ${attempt + 1}/3)`);
        continue;
      }

      if (!json?.data?.phase?.cards) {
        lastError = new Error("Resposta inválida do proxy");
        continue;
      }

      responseData = json;
      lastError = null;
      break;
    }

    if (lastError || !responseData) {
      throw lastError || new Error("Falha após 3 tentativas");
    }

    const cards = responseData.data.phase.cards;
    allCards.push(...cards.edges.map((e: any) => e.node));
    hasNext = cards.pageInfo.hasNextPage;
    cursor = cards.pageInfo.endCursor;
  }

  return allCards;
}

// ── Count per day (with property names) ──────────────────

const FASE_9_ID = "323044836";
const FASE_11_ID = "323044845";

interface ContagemDia {
  total: number;
  imoveis: string[];
}

function contarPorDia(
  cards: CardWithHistory[],
  faseId: string,
  listaDeDatas: string[]
): Record<string, ContagemDia> {
  const resultado: Record<string, ContagemDia> = {};
  listaDeDatas.forEach((d) => (resultado[d] = { total: 0, imoveis: [] }));

  cards.forEach((card) => {
    const entrada = card.phases_history?.find(
      (h) => String(h.phase?.id) === String(faseId)
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

export interface DebugInfo {
  cardsF9: number;
  cardsF10: number;
  cardsF11: number;
  diasProcessados: number;
  lerMesResult: { rows: number; datas: string[] };
  erro: string | null;
}

export function useKPIHistory() {
  const [loadingKPI, setLoadingKPI] = useState(false);
  const [progresso, setProgresso] = useState<string | null>(null);
  const [refreshTrigger, setRefreshTrigger] = useState(0);
  const [kpiDuration, setKpiDuration] = useState<number | null>(null);
  const [debugInfo, setDebugInfo] = useState<DebugInfo | null>(null);

  const inicializar = useCallback(async () => {
    const dias = diasPassadosDoMes();
    if (dias.length === 0) return;

    setLoadingKPI(true);
    setKpiDuration(null);
    setDebugInfo(null);
    setProgresso("Buscando histórico do Pipefy...");
    const startTime = Date.now();

    const debug: DebugInfo = {
      cardsF9: 0, cardsF10: 0, cardsF11: 0,
      diasProcessados: 0,
      lerMesResult: { rows: 0, datas: [] },
      erro: null,
    };

    try {
      const config = await loadConfigFromServer();

      const [cardsF9, cardsF10, cardsF11] = await Promise.all([
        buscarCardsComHistorico("323044836", config.token),
        buscarCardsComHistorico("326702699", config.token),
        buscarCardsComHistorico("323044845", config.token),
      ]);

      debug.cardsF9 = cardsF9.length;
      debug.cardsF10 = cardsF10.length;
      debug.cardsF11 = cardsF11.length;

      setProgresso("Processando dados...");

      const vistos = new Set<string>();
      const cardsSemDuplicata: CardWithHistory[] = [];
      for (const c of [...cardsF9, ...cardsF10, ...cardsF11]) {
        if (!vistos.has(c.id)) {
          vistos.add(c.id);
          cardsSemDuplicata.push(c);
        }
      }

      const contagemAtivacao = contarPorDia(cardsSemDuplicata, FASE_9_ID, dias);
      const contagemFinalizados = contarPorDia(cardsSemDuplicata, FASE_11_ID, dias);

      debug.diasProcessados = dias.length;

      setProgresso("Salvando no banco de dados...");

      const savePromises: Promise<void>[] = [];
      dias.forEach((dataISO) => {
        const atv = contagemAtivacao[dataISO] ?? { total: 0, imoveis: [] };
        const fin = contagemFinalizados[dataISO] ?? { total: 0, imoveis: [] };
        savePromises.push(salvarDiaSupabase(dataISO, "ativacao", atv.total, atv.imoveis));
        savePromises.push(salvarDiaSupabase(dataISO, "finalizados", fin.total, fin.imoveis));
      });
      await Promise.all(savePromises);

      // Re-read from Supabase to verify
      setProgresso("Verificando dados salvos...");
      const hoje = toBRT(new Date());
      const mapa = await lerMesSupabase(hoje.getUTCFullYear(), hoje.getUTCMonth());
      const keys = Object.keys(mapa);
      debug.lerMesResult = {
        rows: keys.length,
        datas: [...new Set(keys.map(k => k.split("_").slice(0, 3).join("-")))].sort(),
      };

      setKpiDuration(Math.round((Date.now() - startTime) / 1000));
      setProgresso(null);
      setDebugInfo(debug);
      setRefreshTrigger((p) => p + 1);
    } catch (err: any) {
      console.error("Erro ao buscar histórico Pipefy:", err);
      debug.erro = err?.message || String(err);
      setDebugInfo(debug);
      setProgresso("Erro ao carregar histórico.");
    } finally {
      setLoadingKPI(false);
    }
  }, []);

  const forcarAtualizacao = useCallback(() => {
    inicializar();
  }, [inicializar]);

  return { loadingKPI, progresso, refreshTrigger, forcarAtualizacao, kpiDuration, debugInfo, setDebugInfo };
}
