import { supabase } from "@/integrations/supabase/client";

// ── KPI Histórico ────────────────────────────────────────

export interface DiaData {
  total: number;
  imoveis: string[];
}

export async function salvarDiaSupabase(
  dataISO: string,
  tipo: string,
  total: number,
  imoveis: string[] = []
): Promise<void> {
  const { error } = await supabase
    .from("kpi_historico")
    .upsert(
      {
        data_iso: dataISO,
        tipo,
        total,
        imoveis: imoveis as any,
        atualizado_em: new Date().toISOString(),
      },
      { onConflict: "data_iso,tipo" }
    );
  if (error) console.error("Erro ao salvar kpi_historico:", error);
}

export async function lerMesSupabase(
  ano: number,
  mes: number
): Promise<Record<string, DiaData>> {
  const mesStr = String(mes + 1).padStart(2, "0");
  const inicioMes = `${ano}-${mesStr}-01`;
  const proximoMes = mes + 1 > 11
    ? `${ano + 1}-01-01`
    : `${ano}-${String(mes + 2).padStart(2, "0")}-01`;

  const { data, error } = await supabase
    .from("kpi_historico")
    .select("data_iso, tipo, total, imoveis")
    .gte("data_iso", inicioMes)
    .lt("data_iso", proximoMes);

  console.log("[lerMesSupabase]", inicioMes, "→", data?.length ?? 0, "rows", error ?? "OK");

  if (error) {
    console.error("Erro ao ler kpi_historico:", error);
    return {};
  }

  const mapa: Record<string, DiaData> = {};
  (data ?? []).forEach((row) => {
    mapa[`${row.data_iso}_${row.tipo}`] = {
      total: row.total,
      imoveis: (row.imoveis as string[]) ?? [],
    };
  });
  return mapa;
}

// ── Pipe2 Exceções ───────────────────────────────────────

export interface ExcecaoData {
  excecao: string;
  observacao: string;
}

export async function salvarExcecaoSupabase(
  imovelId: string,
  excecao: string,
  observacao: string
): Promise<void> {
  const { error } = await supabase
    .from("pipe2_excecoes")
    .upsert(
      {
        imovel_id: imovelId,
        excecao,
        observacao,
        atualizado_em: new Date().toISOString(),
      },
      { onConflict: "imovel_id" }
    );
  if (error) console.error("Erro ao salvar pipe2_excecoes:", error);
}

export async function lerTodasExcecoesSupabase(): Promise<
  Record<string, ExcecaoData>
> {
  const { data, error } = await supabase
    .from("pipe2_excecoes")
    .select("imovel_id, excecao, observacao");

  if (error) {
    console.error("Erro ao ler pipe2_excecoes:", error);
    return {};
  }

  const mapa: Record<string, ExcecaoData> = {};
  (data ?? []).forEach((row) => {
    mapa[row.imovel_id] = { excecao: row.excecao, observacao: row.observacao };
  });
  return mapa;
}

// ── Dashboard Settings ───────────────────────────────────

export async function salvarUltimaAtualizacao(): Promise<void> {
  const agora = new Date().toISOString();
  const { error } = await supabase
    .from("dashboard_settings")
    .upsert(
      { chave: "kpi_ultima_atualizacao", valor: agora, atualizado_em: agora },
      { onConflict: "chave" }
    );
  if (error) console.error("Erro ao salvar última atualização:", error);
}

export async function lerUltimaAtualizacao(): Promise<string | null> {
  const { data, error } = await supabase
    .from("dashboard_settings")
    .select("valor")
    .eq("chave", "kpi_ultima_atualizacao")
    .maybeSingle();
  if (error) {
    console.error("Erro ao ler última atualização:", error);
    return null;
  }
  return data?.valor ?? null;
}

// ── Snapshot Hoje (cache Ativos/Finalizados) ─────────────

export interface SnapshotHoje {
  valor: number;
  imoveis: string[];
}

export interface SnapshotSaveResult {
  success: boolean;
  savedAt?: string;
  error?: string;
}

export async function salvarSnapshotHoje(
  chave: string,
  valor: number,
  imoveis: string[]
): Promise<SnapshotSaveResult> {
  const salvo_em = new Date().toISOString();
  const { error } = await supabase
    .from("kpi_snapshot_hoje")
    .upsert(
      {
        chave,
        valor,
        imoveis: imoveis as any,
        salvo_em,
      },
      { onConflict: "chave" }
    );
  if (error) {
    console.error("ERRO ao salvar snapshot:", chave, error);
    return { success: false, error: error.message };
  }
  console.log("Snapshot salvo:", { chave, valor, imoveis: imoveis.length });
  return { success: true, savedAt: salvo_em };
}

export async function lerSnapshotsHoje(): Promise<Record<string, SnapshotHoje>> {
  const { data, error } = await supabase
    .from("kpi_snapshot_hoje")
    .select("chave, valor, imoveis");
  if (error) {
    console.error("Erro ao ler snapshots:", error);
    return {};
  }
  const mapa: Record<string, SnapshotHoje> = {};
  (data ?? []).forEach((row) => {
    mapa[row.chave] = { valor: row.valor, imoveis: (row.imoveis as string[]) ?? [] };
  });
  return mapa;
}

// ── Migração localStorage → Supabase ─────────────────────

export async function migrarLocalStorageParaSupabase(): Promise<void> {
  if (localStorage.getItem("supabase_migrado_v1")) return;

  // Migrar KPI histórico
  const chavesKpi = Object.keys(localStorage).filter((k) =>
    k.startsWith("kpi_dia_")
  );
  for (const chave of chavesKpi) {
    const raw = localStorage.getItem(chave);
    if (!raw) continue;
    const partes = chave.replace("kpi_dia_", "");
    const lastUnderscore = partes.lastIndexOf("_");
    if (lastUnderscore === -1) continue;
    const dataISO = partes.substring(0, lastUnderscore);
    const tipo = partes.substring(lastUnderscore + 1);
    try {
      const parsed = JSON.parse(raw);
      const total = typeof parsed === "number" ? parsed : parsed.total ?? 0;
      const imoveis =
        typeof parsed === "object" && !Array.isArray(parsed)
          ? parsed.imoveis ?? []
          : [];
      await salvarDiaSupabase(dataISO, tipo, total, imoveis);
    } catch (e) {
      console.error(`Falha ao migrar KPI ${chave}:`, e instanceof Error ? e.message : e);
    }
  }

  // Migrar exceções
  const chavesExcecao = Object.keys(localStorage).filter((k) =>
    k.startsWith("excecao_")
  );
  for (const chave of chavesExcecao) {
    const raw = localStorage.getItem(chave);
    if (!raw) continue;
    const imovelId = chave.replace("excecao_", "");
    try {
      const { excecao, observacao } = JSON.parse(raw);
      await salvarExcecaoSupabase(
        imovelId,
        excecao ?? "",
        observacao ?? ""
      );
    } catch (e) {
      console.error(`Falha ao migrar exceção ${chave}:`, e instanceof Error ? e.message : e);
    }
  }

  localStorage.setItem("supabase_migrado_v1", "true");
}
