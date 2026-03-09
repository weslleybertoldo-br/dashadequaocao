import { supabase } from "@/integrations/supabase/client";

export interface PhaseHistoryEntry {
  phase: { id: string };
  firstTimeIn: string;
}

export interface PipefyCard {
  id: string;
  title: string;
  current_phase: { name: string };
  current_phase_age: number;
  fields: { name: string; value: string; updated_at?: string }[];
  phases_history: PhaseHistoryEntry[];
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

/**
 * Fetch all cards for a given phase with automatic pagination via cursor.
 * Includes retry logic with exponential backoff.
 */
export async function fetchAllCardsForPhase(
  token: string,
  phaseId: string,
  maxPages = Infinity
): Promise<PipefyCard[]> {
  const allCards: PipefyCard[] = [];
  let hasNextPage = true;
  let cursor: string | null = null;
  let page = 0;

  while (hasNextPage && page < maxPages) {
    page++;
    const afterClause = cursor ? `, after: "${cursor}"` : "";
    const query = `{ phase(id: ${phaseId}) { cards(first: 50${afterClause}) { pageInfo { hasNextPage endCursor } edges { node { id title current_phase { name } current_phase_age fields { name value updated_at } phases_history { phase { id } firstTimeIn } } } } } }`;

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

/**
 * Fetch cards updated since a given ISO timestamp using allCards + filter.
 * Much faster than full phase pagination for "today" queries (~3000 → ~50 cards).
 */
export async function fetchCardsUpdatedSince(
  token: string,
  pipeId: string,
  sinceISO: string,
  maxPages = Infinity
): Promise<PipefyCard[]> {
  const allCards: PipefyCard[] = [];
  let hasNextPage = true;
  let cursor: string | null = null;
  let page = 0;

  while (hasNextPage && page < maxPages) {
    page++;
    const afterClause = cursor ? `, after: "${cursor}"` : "";
    const query = `{ allCards(pipeId: ${pipeId}, first: 50${afterClause}, filter: {field: "updated_at", operator: gte, value: "${sinceISO}"}) { pageInfo { hasNextPage endCursor } edges { node { id title current_phase { name } current_phase_age fields { name value updated_at } phases_history { phase { id } firstTimeIn } } } } }`;

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

      if (!json?.data?.allCards) {
        lastError = new Error("Resposta inválida do proxy (allCards)");
        continue;
      }

      responseData = json;
      lastError = null;
      break;
    }

    if (lastError || !responseData) {
      throw lastError || new Error("Falha após 3 tentativas (allCards)");
    }

    const json = responseData;
    if (json.errors?.length) throw new Error(json.errors[0].message);

    const cardsData = json.data.allCards;
    allCards.push(...cardsData.edges.map((e: any) => e.node));
    hasNextPage = cardsData.pageInfo.hasNextPage;
    cursor = cardsData.pageInfo.endCursor;
  }

  return allCards;
}

// ── Field helpers ────────────────────────────────────────

export function getField(card: PipefyCard, fieldName: string): string {
  return card.fields.find((f) => f.name === fieldName)?.value || "";
}

export function getDaysInPhase(card: PipefyCard): number {
  return Math.round((card.current_phase_age / 86400) * 10) / 10;
}

// ── BRT date helpers ─────────────────────────────────────

export function toBRTDateKey(date: Date): string {
  const brt = new Date(date.getTime() - 3 * 60 * 60 * 1000);
  return `${brt.getUTCFullYear()}-${String(brt.getUTCMonth() + 1).padStart(2, "0")}-${String(brt.getUTCDate()).padStart(2, "0")}`;
}

function todayBRTKey(): string {
  return toBRTDateKey(new Date());
}


// ── Phase history helpers ────────────────────────────────
// Card "ativo hoje" = entered Phase 9 for the first time today (BRT)
// Card "finalizado hoje" = entered Phase 11 for the first time today (BRT)

function enteredPhaseTodayBRT(card: PipefyCard, phaseId: string): boolean {
  const entry = card.phases_history?.find((h) => String(h.phase.id) === String(phaseId));
  if (!entry?.firstTimeIn) return false;
  return toBRTDateKey(new Date(entry.firstTimeIn)) === todayBRTKey();
}

export function getAtivoHoje(card: PipefyCard, phase9Id: string): boolean {
  return enteredPhaseTodayBRT(card, phase9Id);
}

export function getFinalizadoHoje(card: PipefyCard, phase11Id: string): boolean {
  return enteredPhaseTodayBRT(card, phase11Id);
}

// ── Today result type ────────────────────────────────────

export interface TodayResult {
  count: number;
  titles: string[];
}

export function countAtivosHoje(cards: PipefyCard[], phase9Id: string): TodayResult {
  const titles: string[] = [];
  for (const card of cards) {
    if (getAtivoHoje(card, phase9Id)) titles.push(card.title);
  }
  return { count: titles.length, titles };
}

export function countFinalizadosHoje(cards: PipefyCard[], phase11Id: string): TodayResult {
  const titles: string[] = [];
  for (const card of cards) {
    if (getFinalizadoHoje(card, phase11Id)) titles.push(card.title);
  }
  return { count: titles.length, titles };
}

// ── Config ───────────────────────────────────────────────

export interface PipefyConfig {
  token: string;
  pipeId: string;
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
    pipeId: localStorage.getItem("pipefy_pipeId") || serverConfig.pipeId || "303781436",
    phase9: localStorage.getItem("pipefy_phase9") || serverConfig.phase9 || "323044836",
    phase10: localStorage.getItem("pipefy_phase10") || serverConfig.phase10 || "326702699",
    phase5: localStorage.getItem("pipefy_phase5") || serverConfig.phase5 || "333848127",
    phase11: localStorage.getItem("pipefy_phase11") || serverConfig.phase11 || "323044845",
  };
}

export function loadConfig(): PipefyConfig {
  return {
    token: localStorage.getItem("pipefy_token") || "__USE_SERVER_TOKEN__",
    pipeId: localStorage.getItem("pipefy_pipeId") || "303781436",
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
