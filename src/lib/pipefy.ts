import { supabase } from "@/integrations/supabase/client";

export interface PipefyPhaseHistoryEntry {
  phase: { id: string };
  firstTimeIn: string;
}

export interface PipefyCard {
  id: string;
  title: string;
  current_phase: { name: string };
  current_phase_age: number;
  fields: { name: string; value: string }[];
  phases_history?: PipefyPhaseHistoryEntry[];
}

interface PageInfo {
  hasNextPage: boolean;
  endCursor: string | null;
}

interface PhaseResponse {
  data: {
    phase: {
      cards: {
        pageInfo: PageInfo;
        edges: { node: PipefyCard }[];
      };
    };
  };
  errors?: { message: string }[];
}

export async function fetchAllCardsForPhase(
  token: string,
  phaseId: string,
  includePhasesHistory = false,
  maxPages = Infinity
): Promise<PipefyCard[]> {
  const allCards: PipefyCard[] = [];
  let hasNextPage = true;
  let cursor: string | null = null;
  let page = 0;

  while (hasNextPage && page < maxPages) {
    page++;
    const afterClause = cursor ? `, after: "${cursor}"` : "";
    const phaseHistoryField = includePhasesHistory ? "phases_history { phase { id } firstTimeIn }" : "";
    const query = `{ phase(id: ${phaseId}) { cards(first: 50${afterClause}) { pageInfo { hasNextPage endCursor } edges { node { id title current_phase { name } current_phase_age fields { name value } ${phaseHistoryField} } } } } }`;

    let lastError: Error | null = null;
    let responseData: any = null;

    for (let attempt = 0; attempt < 3; attempt++) {
      if (attempt > 0) {
        await new Promise((r) => setTimeout(r, 1000 * Math.pow(2, attempt - 1)));
      }

      const bodyPayload: any = { query };
      if (token && token !== "__USE_SERVER_TOKEN__") {
        bodyPayload.token = token;
      }
      const { data, error: functionError } = await supabase.functions.invoke("pipefy-proxy", {
        body: bodyPayload,
      });

      if (functionError) {
        lastError = new Error(functionError.message || "Erro ao chamar pipefy-proxy");
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

    const json = responseData as PhaseResponse;
    if (json.errors?.length) throw new Error(json.errors[0].message);

    const cardsData = json.data.phase.cards;
    allCards.push(...cardsData.edges.map((e) => e.node));
    hasNextPage = cardsData.pageInfo.hasNextPage;
    cursor = cardsData.pageInfo.endCursor;
  }

  return allCards;
}

export function getField(card: PipefyCard, fieldName: string): string {
  return card.fields.find((f) => f.name === fieldName)?.value || "";
}

export function getDaysInPhase(card: PipefyCard): number {
  return Math.round((card.current_phase_age / 86400) * 10) / 10;
}

export interface TodayResult {
  count: number;
  titles: string[];
}

function getBrasiliaDateKey(date: Date): string {
  const brt = new Date(date.getTime() - 3 * 60 * 60 * 1000);
  return `${brt.getUTCFullYear()}-${String(brt.getUTCMonth() + 1).padStart(2, "0")}-${String(brt.getUTCDate()).padStart(2, "0")}`;
}

export function getTodayCardsByPhaseHistoryFromLoadedCards(
  cards: PipefyCard[],
  phaseId: string
): TodayResult {
  const todayStr = getBrasiliaDateKey(new Date());
  const titles: string[] = [];

  for (const card of cards) {
    const entry = card.phases_history?.find((h) => String(h.phase.id) === String(phaseId));
    if (!entry?.firstTimeIn) continue;
    const dateStr = getBrasiliaDateKey(new Date(entry.firstTimeIn));
    if (dateStr === todayStr) titles.push(card.title);
  }

  return { count: titles.length, titles };
}

/**
 * Fetch all cards in a phase, using phases_history to find cards
 * whose firstTimeIn for the target phase matches today (America/Sao_Paulo).
 */
export async function fetchTodayCardsByPhaseHistory(
  token: string,
  phaseId: string
): Promise<TodayResult> {
  const todayStr = getBrasiliaDateKey(new Date());

  const titles: string[] = [];
  let hasNextPage = true;
  let cursor: string | null = null;

  while (hasNextPage) {
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
      const { data, error: functionError } = await supabase.functions.invoke("pipefy-proxy", {
        body: bodyPayload,
      });
      if (functionError) { lastError = new Error(functionError.message); continue; }
      const json = data as any;
      if (json?.error && /502|504|Bad gateway/i.test(JSON.stringify(json))) { lastError = new Error("Pipefy indisponível"); continue; }
      if (!json?.data?.phase?.cards) { lastError = new Error("Resposta inválida"); continue; }
      responseData = json;
      lastError = null;
      break;
    }

    if (lastError || !responseData) throw lastError || new Error("Falha após 3 tentativas");

    const cardsData = responseData.data.phase.cards;
    for (const edge of cardsData.edges) {
      const history = edge.node.phases_history as PipefyPhaseHistoryEntry[] | undefined;
      if (!history) continue;
      const entry = history.find((h) => String(h.phase.id) === String(phaseId));
      if (entry?.firstTimeIn) {
        const dateStr = getBrasiliaDateKey(new Date(entry.firstTimeIn));
        if (dateStr === todayStr) titles.push(edge.node.title);
      }
    }
    hasNextPage = cardsData.pageInfo.hasNextPage;
    cursor = cardsData.pageInfo.endCursor;
  }

  return { count: titles.length, titles };
}

export interface PipefyConfig {
  token: string;
  phase9: string;
  phase10: string;
  phase5: string;
  phase11: string;
}

export async function loadConfigFromServer(): Promise<PipefyConfig> {
  const { data, error } = await supabase.functions.invoke("pipefy-config");
  
  const serverConfig = (!error && data) ? data : {};
  
  return {
    token: localStorage.getItem("pipefy_token") || "__USE_SERVER_TOKEN__",
    phase9: localStorage.getItem("pipefy_phase9") || serverConfig.phase9 || "323044836",
    phase10: localStorage.getItem("pipefy_phase10") || serverConfig.phase10 || "326702699",
    phase5: localStorage.getItem("pipefy_phase5") || serverConfig.phase5 || "333848127",
    phase11: localStorage.getItem("pipefy_phase11") || serverConfig.phase11 || "323044845",
  };
}

export function loadConfig(): PipefyConfig {
  return {
    token: localStorage.getItem("pipefy_token") || "__USE_SERVER_TOKEN__",
    phase9: localStorage.getItem("pipefy_phase9") || "323044836",
    phase10: localStorage.getItem("pipefy_phase10") || "326702699",
    phase5: localStorage.getItem("pipefy_phase5") || "333848127",
    phase11: localStorage.getItem("pipefy_phase11") || "323044845",
  };
}

export function saveConfig(config: PipefyConfig) {
  localStorage.setItem("pipefy_token", config.token);
  localStorage.setItem("pipefy_phase9", config.phase9);
  localStorage.setItem("pipefy_phase10", config.phase10);
  localStorage.setItem("pipefy_phase5", config.phase5);
}
