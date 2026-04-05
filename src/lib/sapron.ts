// ── Sapron API credentials (informativo — em producao migrar para Edge Function) ──
// URL: https://api.sapron.com.br/
// Header: X-SAPRON-API-KEY: ***REDACTED_SAPRON_API_KEY***
// Usuario: operacao-automacao@seazone.com.br
// Senha: ***REDACTED_SAPRON_PASSWORD***

const SAPRON_API_URL = "https://api.sapron.com.br";
const SAPRON_API_KEY = "***REDACTED_SAPRON_API_KEY***";

export interface StatusLogEntry {
  id: number;
  created_at: string;
  status: string;
  exchange_date: string;
  property: number;
  user_who_changed: number | null;
}

export interface PropertyListItem {
  id: number;
  code: string;
  status: string;
}

export interface SapronAtivacaoDia {
  total: number;
  imoveis: string[]; // property codes
}

// ── Fetch direto da API Sapron ──

async function sapronFetch<T>(endpoint: string): Promise<T> {
  const url = `${SAPRON_API_URL}/${endpoint}`;
  const response = await fetch(url, {
    method: "GET",
    headers: {
      "X-SAPRON-API-KEY": SAPRON_API_KEY,
    },
  });

  if (!response.ok) {
    throw new Error(`Sapron HTTP ${response.status}: ${endpoint}`);
  }

  return response.json() as Promise<T>;
}

// ── Cache em memoria para evitar chamadas repetidas ──

let cachedStatusLog: StatusLogEntry[] | null = null;
let cachedProperties: PropertyListItem[] | null = null;
let cacheTimestamp = 0;
const CACHE_TTL = 5 * 60 * 1000; // 5 minutos

function isCacheValid(): boolean {
  return Date.now() - cacheTimestamp < CACHE_TTL;
}

export function clearSapronCache(): void {
  cachedStatusLog = null;
  cachedProperties = null;
  cacheTimestamp = 0;
}

async function getStatusLog(): Promise<StatusLogEntry[]> {
  if (cachedStatusLog && isCacheValid()) return cachedStatusLog;
  cachedStatusLog = await sapronFetch<StatusLogEntry[]>("property/status_log/");
  cacheTimestamp = Date.now();
  return cachedStatusLog;
}

async function getPropertiesList(): Promise<PropertyListItem[]> {
  if (cachedProperties && isCacheValid()) return cachedProperties;
  cachedProperties = await sapronFetch<PropertyListItem[]>("properties/properties_list/");
  return cachedProperties;
}

// ── Build property ID -> code map ──

async function buildPropertyCodeMap(): Promise<Map<number, string>> {
  const properties = await getPropertiesList();
  const map = new Map<number, string>();
  for (const p of properties) {
    map.set(p.id, p.code);
  }
  return map;
}

// ── Contar ativacoes por dia (status_log com status "Active") ──

export async function contarAtivacoesSapron(
  listaDeDatas: string[]
): Promise<Record<string, SapronAtivacaoDia>> {
  const [statusLog, codeMap] = await Promise.all([
    getStatusLog(),
    buildPropertyCodeMap(),
  ]);

  const resultado: Record<string, SapronAtivacaoDia> = {};
  for (const d of listaDeDatas) {
    resultado[d] = { total: 0, imoveis: [] };
  }

  // Filtrar apenas entradas com status "Active"
  const activeEntries = statusLog.filter((entry) => entry.status === "Active");

  for (const entry of activeEntries) {
    const dataLog = entry.exchange_date; // formato "YYYY-MM-DD"
    if (resultado.hasOwnProperty(dataLog)) {
      const code = codeMap.get(entry.property) || `ID:${entry.property}`;
      // Evitar duplicatas (mesmo imovel ativado mais de uma vez no dia)
      if (!resultado[dataLog].imoveis.includes(code)) {
        resultado[dataLog].total++;
        resultado[dataLog].imoveis.push(code);
      }
    }
  }

  return resultado;
}

// ── Ativos hoje ──

export async function getAtivosHojeSapron(): Promise<{
  count: number;
  titles: string[];
}> {
  const now = new Date();
  const brt = new Date(now.getTime() - 3 * 60 * 60 * 1000);
  const hojeISO = `${brt.getUTCFullYear()}-${String(brt.getUTCMonth() + 1).padStart(2, "0")}-${String(brt.getUTCDate()).padStart(2, "0")}`;

  const resultado = await contarAtivacoesSapron([hojeISO]);
  const hoje = resultado[hojeISO] || { total: 0, imoveis: [] };

  return { count: hoje.total, titles: hoje.imoveis };
}
