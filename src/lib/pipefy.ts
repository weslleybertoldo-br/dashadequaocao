import { supabase } from "@/integrations/supabase/client";

export interface PipefyCard {
  id: string;
  title: string;
  current_phase: { name: string };
  current_phase_age: number;
  fields: { name: string; value: string }[];
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

const PIPEFY_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/pipefy-proxy`;

export async function fetchAllCardsForPhase(
  token: string,
  phaseId: string
): Promise<PipefyCard[]> {
  const allCards: PipefyCard[] = [];
  let hasNextPage = true;
  let cursor: string | null = null;

  while (hasNextPage) {
    const afterClause = cursor ? `, after: "${cursor}"` : "";
    const query = `{ phase(id: ${phaseId}) { cards(first: 50${afterClause}) { pageInfo { hasNextPage endCursor } edges { node { id title current_phase { name } current_phase_age fields { name value } } } } } }`;

    let lastError: Error | null = null;
    let responseData: any = null;

    for (let attempt = 0; attempt < 3; attempt++) {
      if (attempt > 0) {
        await new Promise((r) => setTimeout(r, 1000 * Math.pow(2, attempt - 1)));
      }

      const { data, error: functionError } = await supabase.functions.invoke("pipefy-proxy", {
        body: { token, query },
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

export interface PipefyConfig {
  token: string;
  phase9: string;
  phase10: string;
  phase5: string;
}

export function loadConfig(): PipefyConfig {
  return {
    token: localStorage.getItem("pipefy_token") || "",
    phase9: localStorage.getItem("pipefy_phase9") || "323044836",
    phase10: localStorage.getItem("pipefy_phase10") || "326702699",
    phase5: localStorage.getItem("pipefy_phase5") || "333848127",
  };
}

export function saveConfig(config: PipefyConfig) {
  localStorage.setItem("pipefy_token", config.token);
  localStorage.setItem("pipefy_phase9", config.phase9);
  localStorage.setItem("pipefy_phase10", config.phase10);
  localStorage.setItem("pipefy_phase5", config.phase5);
}
