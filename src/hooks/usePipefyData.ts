import { useState, useCallback, useEffect, useRef } from "react";
import {
  PipefyCard,
  TodayResult,
  fetchAllCardsForPhase,
  countAtivosHoje,
  countFinalizadosHoje,
  loadConfigFromServer,
} from "@/lib/pipefy";
import { salvarSnapshotHoje, lerSnapshotsHoje, salvarDiaSupabase, salvarUltimaAtualizacao } from "@/lib/supabaseData";
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

  const persistSnapshot = useCallback((ativos: TodayResult, finalizados: TodayResult) => {
    salvarSnapshotHoje("ativos_hoje", ativos.count, ativos.titles);
    salvarSnapshotHoje("finalizados_hoje", finalizados.count, finalizados.titles);
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
      const ativos = countAtivosHoje(stage1Cards);
      setEntradasHoje(ativos);

      // ── STAGE 2 (background): phase 11 full pagination ──
      setStage2Loading(true);
      const stage2Start = Date.now();

      fetchAllCardsForPhase(config.token, config.phase11)
        .then((phase11Cards) => {
          console.log(`[Stage2] phase11Cards: ${phase11Cards.length} cards`);
          const allCardsMap = new Map<string, PipefyCard>();
          for (const card of [...stage1Cards, ...phase11Cards]) {
            allCardsMap.set(card.id, card);
          }
          // Debug: find TAU0204 and log its field data
          const debugCard = Array.from(allCardsMap.values()).find(c => c.title === "TAU0204");
          if (debugCard) {
            const ativoField = debugCard.fields.find(f => f.name === "Enviar mensagem de aviso de imóvel ativado");
            console.log(`[Debug TAU0204] phase: ${debugCard.current_phase.name}, field: ${JSON.stringify(ativoField)}`);
          } else {
            console.log("[Debug TAU0204] NOT FOUND in any fetched phase");
          }
          const ativosFinal = countAtivosHoje(Array.from(allCardsMap.values()));
          console.log(`[Stage2] ativosFinal: ${ativosFinal.count}`, ativosFinal.titles);
          setEntradasHoje(ativosFinal);

          const finalizadosMap = new Map<string, PipefyCard>();
          for (const card of [...phase10Cards, ...phase11Cards]) {
            finalizadosMap.set(card.id, card);
          }
          const finalizadosFinal = countFinalizadosHoje(Array.from(finalizadosMap.values()));
          setConcluidosHoje(finalizadosFinal);

          persistSnapshot(ativosFinal, finalizadosFinal);

          // Auto-save today's KPI to kpi_historico
          const hojeStr = hojeISO();
          salvarDiaSupabase(hojeStr, "ativacao", ativosFinal.count, ativosFinal.titles);
          salvarDiaSupabase(hojeStr, "finalizados", finalizadosFinal.count, finalizadosFinal.titles);
          salvarUltimaAtualizacao();

          setStage2Duration(Math.round((Date.now() - stage2Start) / 1000));
          setStage2Loading(false);
        })
        .catch(() => {
          const finalizadosFallback = countFinalizadosHoje(phase10Cards);
          setConcluidosHoje(finalizadosFallback);
          persistSnapshot(ativos, finalizadosFallback);
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
