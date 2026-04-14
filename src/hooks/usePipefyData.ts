import { useState, useCallback, useEffect, useRef } from "react";
import {
  PipefyCard,
  TodayResult,
  fetchAllCardsForPhase,
  fetchCardsUpdatedSince,
  countFinalizadosHoje,
  loadConfigFromServer,
} from "@/lib/pipefy";
import { getAtivosHojeSapron, clearSapronCache } from "@/lib/sapron";
import { salvarSnapshotHoje, lerSnapshotsHoje, salvarDiaSupabase, salvarUltimaAtualizacao } from "@/lib/supabaseData";
import { hojeISO } from "@/hooks/useKPIHistory";

interface PipefyData {
  phase10Cards: PipefyCard[];
  phase5Cards: PipefyCard[];
}

export function usePipefyData() {
  const [data, setData] = useState<PipefyData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [entradasHoje, setEntradasHoje] = useState<TodayResult | null>(null);
  const [concluidosHoje, setConcluidosHoje] = useState<TodayResult | null>(null);
  const [snapshotEntradas, setSnapshotEntradas] = useState<TodayResult | null>(null);
  const [snapshotConcluidos, setSnapshotConcluidos] = useState<TodayResult | null>(null);
  const [snapshotReady, setSnapshotReady] = useState(false);
  const [todayLoading, setTodayLoading] = useState(false);
  const [stage2Loading, setStage2Loading] = useState(false);
  const [stage2Duration, setStage2Duration] = useState<number | null>(null);

  // Snapshot data ref — synchronously available after await
  const snapshotDataRef = useRef<{ entradas: TodayResult | null; concluidos: TodayResult | null }>({ entradas: null, concluidos: null });
  const snapshotPromiseRef = useRef<Promise<void> | null>(null);

  // Load cached snapshots on mount — runs ONCE
  useEffect(() => {
    const promise = lerSnapshotsHoje().then((snap) => {
      if (snap["ativos_hoje"]) {
        const val = { count: snap["ativos_hoje"].valor, titles: snap["ativos_hoje"].imoveis };
        snapshotDataRef.current.entradas = val;
        setSnapshotEntradas(val);
      }
      if (snap["finalizados_hoje"]) {
        const val = { count: snap["finalizados_hoje"].valor, titles: snap["finalizados_hoje"].imoveis };
        snapshotDataRef.current.concluidos = val;
        setSnapshotConcluidos(val);
      }
      setSnapshotReady(true);
    });
    snapshotPromiseRef.current = promise;
  }, []);

  const persistSnapshot = useCallback(async (ativos: TodayResult, finalizados: TodayResult) => {
    const [r1, r2] = await Promise.all([
      salvarSnapshotHoje("ativos_hoje", ativos.count, ativos.titles),
      salvarSnapshotHoje("finalizados_hoje", finalizados.count, finalizados.titles),
    ]);
    if (r1.success && r2.success) {
      console.log("Snapshots salvos:", { ativos: ativos.count, finalizados: finalizados.count });
    } else {
      console.error("Falha ao salvar snapshots:", r1.error || r2.error);
    }
  }, []);

  const fetchData = useCallback(async () => {
    // 1. FIRST: ensure snapshot is loaded and applied
    if (snapshotPromiseRef.current) {
      await snapshotPromiseRef.current;
    }

    setLoading(true);
    setError(null);
    setTodayLoading(false);
    setStage2Loading(false);
    setStage2Duration(null);

    try {
      const config = await loadConfigFromServer();

      // 2. THEN: fetch Pipefy data
      const [phase10Cards, phase5Cards] = await Promise.all([
        fetchAllCardsForPhase(config.token, config.phase10),
        fetchAllCardsForPhase(config.token, config.phase5),
      ]);

      setData({ phase10Cards, phase5Cards });
      setLoading(false);

      const stage1Cards = phase10Cards;

      // ── STAGE 2: Ativacoes via Sapron + Finalizados via Pipefy ──
      setStage2Loading(true);
      const stage2Start = Date.now();

      const now = new Date();
      const brt = new Date(now.getTime() - 3 * 60 * 60 * 1000);
      const todayStart = `${brt.getUTCFullYear()}-${String(brt.getUTCMonth() + 1).padStart(2, "0")}-${String(brt.getUTCDate()).padStart(2, "0")}T00:00:00-03:00`;

      Promise.all([
        getAtivosHojeSapron(),
        fetchCardsUpdatedSince(config.token, config.pipeId, todayStart),
      ])
        .then(async ([ativosSapron, recentCards]) => {
          // Ativacoes: dados do Sapron
          setEntradasHoje(ativosSapron);

          // Finalizados: dados do Pipefy
          const allCardsMap = new Map<string, PipefyCard>();
          for (const card of [...stage1Cards, ...recentCards]) {
            allCardsMap.set(card.id, card);
          }
          const finalizadosFinal = countFinalizadosHoje(Array.from(allCardsMap.values()), config.phase11);
          setConcluidosHoje(finalizadosFinal);

          await persistSnapshot(ativosSapron, finalizadosFinal);

          const hojeStr = hojeISO();
          salvarDiaSupabase(hojeStr, "ativacao", ativosSapron.count, ativosSapron.titles);
          salvarDiaSupabase(hojeStr, "finalizados", finalizadosFinal.count, finalizadosFinal.titles);
          salvarUltimaAtualizacao();

          setStage2Duration(Math.round((Date.now() - stage2Start) / 1000));
          setStage2Loading(false);
        })
        .catch(async (err) => {
          console.error("Stage 2 error:", err);
          // Fallback: tenta Sapron separado, finalizados do Pipefy
          try {
            const ativosFallback = await getAtivosHojeSapron();
            setEntradasHoje(ativosFallback);
          } catch {
            setEntradasHoje({ count: 0, titles: [] });
          }
          const finalizadosFallback = countFinalizadosHoje(stage1Cards, config.phase11);
          setConcluidosHoje(finalizadosFallback);
          setStage2Loading(false);
        });
    } catch (err: any) {
      setError(err.message || "Erro ao buscar dados do Pipefy");
      setLoading(false);
      setTodayLoading(false);
    }
  }, [persistSnapshot]);

  // Effective values: Pipefy data wins, otherwise snapshot
  const effectiveEntradas = entradasHoje ?? snapshotEntradas;
  const effectiveConcluidos = concluidosHoje ?? snapshotConcluidos;

  return { data, loading, error, fetchData, entradasHoje: effectiveEntradas, concluidosHoje: effectiveConcluidos, todayLoading, stage2Loading, stage2Duration, snapshotReady };
}
