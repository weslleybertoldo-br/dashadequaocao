import { useState, useCallback, useEffect, useRef } from "react";
import {
  PipefyCard,
  TodayResult,
  fetchAllCardsForPhase,
  fetchCardsUpdatedSince,
  countAtivosHoje,
  countFinalizadosHoje,
  loadConfigFromServer,
} from "@/lib/pipefy";
import { salvarSnapshotHoje, lerSnapshotsHoje, salvarDiaSupabase, salvarUltimaAtualizacao, SnapshotSaveResult } from "@/lib/supabaseData";
import { hojeISO } from "@/hooks/useKPIHistory";

interface PipefyData {
  phase9Cards: PipefyCard[];
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
  const [snapshotStatus, setSnapshotStatus] = useState<{ success: boolean; savedAt?: string; error?: string } | null>(null);

  // Track whether snapshots have been loaded — Pipefy fetch waits for this
  const snapshotLoadedRef = useRef(false);
  const snapshotPromiseRef = useRef<Promise<void> | null>(null);

  // Load cached snapshots on mount — runs ONCE and resolves quickly
  useEffect(() => {
    const promise = lerSnapshotsHoje().then((snap) => {
      if (snap["ativos_hoje"]) {
        setSnapshotEntradas({ count: snap["ativos_hoje"].valor, titles: snap["ativos_hoje"].imoveis });
      }
      if (snap["finalizados_hoje"]) {
        setSnapshotConcluidos({ count: snap["finalizados_hoje"].valor, titles: snap["finalizados_hoje"].imoveis });
      }
      snapshotLoadedRef.current = true;
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
      setSnapshotStatus({ success: true, savedAt: r1.savedAt });
      console.log("Snapshots salvos:", { ativos: ativos.count, finalizados: finalizados.count });
    } else {
      const errMsg = r1.error || r2.error || "Erro desconhecido";
      setSnapshotStatus({ success: false, error: errMsg });
      console.error("Falha ao salvar snapshots:", errMsg);
    }
  }, []);

  const fetchData = useCallback(async () => {
    // Wait for snapshot to load first so UI shows cached values before loading state
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

      const [phase8Cards, phase9Cards, phase10Cards, phase5Cards] = await Promise.all([
        fetchAllCardsForPhase(config.token, config.phase8),
        fetchAllCardsForPhase(config.token, config.phase9),
        fetchAllCardsForPhase(config.token, config.phase10),
        fetchAllCardsForPhase(config.token, config.phase5),
      ]);

      setData({ phase9Cards, phase10Cards, phase5Cards });
      setLoading(false);

      const stage1Cards = [...phase8Cards, ...phase9Cards, ...phase10Cards];
      const ativos = countAtivosHoje(stage1Cards, config.phase9);
      setEntradasHoje(ativos);

      // ── STAGE 2 (optimized): fetch only cards updated today ──
      setStage2Loading(true);
      const stage2Start = Date.now();

      // Build BRT start-of-day ISO string for the filter
      const now = new Date();
      const brt = new Date(now.getTime() - 3 * 60 * 60 * 1000);
      const todayStart = `${brt.getUTCFullYear()}-${String(brt.getUTCMonth() + 1).padStart(2, "0")}-${String(brt.getUTCDate()).padStart(2, "0")}T00:00:00-03:00`;

      fetchCardsUpdatedSince(config.token, config.pipeId, todayStart)
        .then(async (recentCards) => {
          // Merge stage1 + recently updated cards (includes phase 11 cards updated today)
          const allCardsMap = new Map<string, PipefyCard>();
          for (const card of [...stage1Cards, ...recentCards]) {
            allCardsMap.set(card.id, card);
          }
          const ativosFinal = countAtivosHoje(Array.from(allCardsMap.values()), config.phase9);
          setEntradasHoje(ativosFinal);

          // For finalizados: all cards updated today (includes phase 11 entries)
          const finalizadosFinal = countFinalizadosHoje(Array.from(allCardsMap.values()), config.phase11);
          setConcluidosHoje(finalizadosFinal);

          await persistSnapshot(ativosFinal, finalizadosFinal);

          // Auto-save today's KPI to kpi_historico
          const hojeStr = hojeISO();
          salvarDiaSupabase(hojeStr, "ativacao", ativosFinal.count, ativosFinal.titles);
          salvarDiaSupabase(hojeStr, "finalizados", finalizadosFinal.count, finalizadosFinal.titles);
          salvarUltimaAtualizacao();

          setStage2Duration(Math.round((Date.now() - stage2Start) / 1000));
          setStage2Loading(false);
        })
        .catch(async () => {
          const finalizadosFallback = countFinalizadosHoje(phase10Cards, config.phase11);
          setConcluidosHoje(finalizadosFallback);
          await persistSnapshot(ativos, finalizadosFallback);
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

  return { data, loading, error, fetchData, entradasHoje: effectiveEntradas, concluidosHoje: effectiveConcluidos, todayLoading, stage2Loading, stage2Duration, snapshotReady, snapshotStatus };
}
