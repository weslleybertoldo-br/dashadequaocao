import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { loadConfigFromServer } from "@/lib/pipefy";

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

function hojeISO(): string {
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

// ── localStorage helpers ─────────────────────────────────

function jaTemDado(dataISO: string, tipo: string): boolean {
  return localStorage.getItem(`kpi_dia_${dataISO}_${tipo}`) !== null;
}

function salvarDia(dataISO: string, tipo: string, valor: number): void {
  localStorage.setItem(`kpi_dia_${dataISO}_${tipo}`, String(valor));
}

export function lerDia(dataISO: string, tipo: string): number | null {
  const val = localStorage.getItem(`kpi_dia_${dataISO}_${tipo}`);
  return val !== null ? Number(val) : null;
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

// ── Count per day ────────────────────────────────────────

const FASE_9_ID = "323044836";
const FASE_11_ID = "323044845";

function contarPorDia(
  cards: CardWithHistory[],
  faseId: string,
  listaDeDatas: string[]
): Record<string, number> {
  const contagem: Record<string, number> = {};
  listaDeDatas.forEach((d) => (contagem[d] = 0));

  cards.forEach((card) => {
    const entrada = card.phases_history?.find(
      (h) => String(h.phase?.id) === String(faseId)
    );
    if (!entrada?.firstTimeIn) return;

    const dataBRT = toDateISO(toBRT(new Date(entrada.firstTimeIn)));
    if (contagem.hasOwnProperty(dataBRT)) {
      contagem[dataBRT]++;
    }
  });

  return contagem;
}

// ── Hook ─────────────────────────────────────────────────

export function useKPIHistory() {
  const [loadingKPI, setLoadingKPI] = useState(false);
  const [progresso, setProgresso] = useState<string | null>(null);
  const [refreshTrigger, setRefreshTrigger] = useState(0);
  const [kpiDuration, setKpiDuration] = useState<number | null>(null);

  const inicializar = useCallback(async (forceAll = false) => {
    const dias = diasPassadosDoMes();
    const hoje = hojeISO();

    const diasParaBuscar = dias.filter((d) => {
      if (forceAll) return true;
      if (d === hoje) return true;
      return !jaTemDado(d, "ativacao");
    });

    if (diasParaBuscar.length === 0) return;

    setLoadingKPI(true);
    setProgresso("Buscando histórico do Pipefy...");

    try {
      const config = await loadConfigFromServer();

      const [cardsF9, cardsF10, cardsF11] = await Promise.all([
        buscarCardsComHistorico("323044836", config.token),
        buscarCardsComHistorico("326702699", config.token),
        buscarCardsComHistorico("323044845", config.token),
      ]);

      setProgresso("Processando dados...");

      const vistos = new Set<string>();
      const cardsSemDuplicata: CardWithHistory[] = [];
      for (const c of [...cardsF9, ...cardsF10, ...cardsF11]) {
        if (!vistos.has(c.id)) {
          vistos.add(c.id);
          cardsSemDuplicata.push(c);
        }
      }

      const contagemAtivacao = contarPorDia(cardsSemDuplicata, FASE_9_ID, diasParaBuscar);
      const contagemFinalizados = contarPorDia(cardsSemDuplicata, FASE_11_ID, diasParaBuscar);

      diasParaBuscar.forEach((dataISO) => {
        salvarDia(dataISO, "ativacao", contagemAtivacao[dataISO] ?? 0);
        salvarDia(dataISO, "finalizados", contagemFinalizados[dataISO] ?? 0);
      });

      setProgresso(null);
      setRefreshTrigger((p) => p + 1);
    } catch (err: any) {
      console.error("Erro ao buscar histórico Pipefy:", err);
      setProgresso("Erro ao carregar histórico.");
    } finally {
      setLoadingKPI(false);
    }
  }, []);

  const forcarAtualizacao = useCallback(() => {
    const hoje = toBRT(new Date());
    const ano = hoje.getUTCFullYear();
    const mes = String(hoje.getUTCMonth() + 1).padStart(2, "0");
    const prefixo = `kpi_dia_${ano}-${mes}`;

    Object.keys(localStorage)
      .filter((k) => k.startsWith(prefixo))
      .forEach((k) => localStorage.removeItem(k));

    inicializar(true);
  }, [inicializar]);

  useEffect(() => {
    inicializar();
  }, [inicializar]);

  return { loadingKPI, progresso, refreshTrigger, forcarAtualizacao };
}
