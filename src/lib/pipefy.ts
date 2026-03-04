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

    const res = await fetch("https://api.pipefy.com/graphql", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ query }),
    });

    if (!res.ok) throw new Error(`HTTP ${res.status}`);

    const json: PhaseResponse = await res.json();
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
