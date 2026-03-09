import { useState, useCallback, useEffect } from "react";
import {
  PipefyCard,
  TodayResult,
  fetchAllCardsForPhase,
  countAtivosHoje,
  countFinalizadosHoje,
  loadConfigFromServer,
} from "@/lib/pipefy";
import { salvarSnapshotHoje, lerSnapshotsHoje } from "@/lib/supabaseData";

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
  const [todayLoading, setTodayLoading] = useState(false);
  const [stage2Loading, setStage2Loading] = useState(false);
  const [stage2Duration, setStage2Duration] = useState<number | null>(null);

  // Load cached snapshots on mount — independent of Pipefy state
  useEffect(() => {
    lerSnapshotsHoje().then((snap) => {
      if (snap["ativos_hoje"]) {
        setSnapshotEntradas({ count: snap["ativos_hoje"].valor, titles: snap["ativos_hoje"].imoveis });
      }
      if (snap["finalizados_hoje"]) {
        setSnapshotConcluidos({ count: snap["finalizados_hoje"].valor, titles: snap["finalizados_hoje"].imoveis });
      }
    });
  }, []);

  const persistSnapshot = useCallback((ativos: TodayResult, finalizados: TodayResult) => {
    salvarSnapshotHoje("ativos_hoje", ativos.count, ativos.titles);
    salvarSnapshotHoje("finalizados_hoje", finalizados.count, finalizados.titles);
  }, []);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    // Don't reset entradasHoje/concluidosHoje — keep cached values visible
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
      const finalizados = countFinalizadosHoje(phase10Cards);
      setEntradasHoje(ativos);
      setConcluidosHoje(finalizados);
      persistSnapshot(ativos, finalizados);

      // ── STAGE 2 (background): phase 11 full pagination ──
      setStage2Loading(true);
      const stage2Start = Date.now();

      fetchAllCardsForPhase(config.token, config.phase11)
        .then((phase11Cards) => {
          const allCardsMap = new Map<string, PipefyCard>();
          for (const card of [...stage1Cards, ...phase11Cards]) {
            allCardsMap.set(card.id, card);
          }
          const ativosFinal = countAtivosHoje(Array.from(allCardsMap.values()));
          setEntradasHoje(ativosFinal);

          const finalizadosMap = new Map<string, PipefyCard>();
          for (const card of [...phase10Cards, ...phase11Cards]) {
            finalizadosMap.set(card.id, card);
          }
          const finalizadosFinal = countFinalizadosHoje(Array.from(finalizadosMap.values()));
          setConcluidosHoje(finalizadosFinal);

          persistSnapshot(ativosFinal, finalizadosFinal);
          setStage2Duration(Math.round((Date.now() - stage2Start) / 1000));
          setStage2Loading(false);
        })
        .catch(() => {
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

  return { data, loading, error, fetchData, entradasHoje: effectiveEntradas, concluidosHoje: effectiveConcluidos, todayLoading, stage2Loading, stage2Duration };
}
