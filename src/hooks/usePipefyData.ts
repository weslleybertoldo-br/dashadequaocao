import { useState, useCallback } from "react";
import {
  PipefyCard,
  TodayResult,
  fetchAllCardsForPhase,
  countAtivosHoje,
  countFinalizadosHoje,
  loadConfigFromServer,
} from "@/lib/pipefy";

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
  const [todayLoading, setTodayLoading] = useState(false);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    setEntradasHoje(null);
    setConcluidosHoje(null);
    setTodayLoading(true);

    try {
      const config = await loadConfigFromServer();

      // ── STAGE 1 (fast): phases 8, 9, 10, 5 in parallel (no phases_history) ──
      const [phase8Cards, phase9Cards, phase10Cards, phase5Cards] = await Promise.all([
        fetchAllCardsForPhase(config.token, config.phase8),
        fetchAllCardsForPhase(config.token, config.phase9),
        fetchAllCardsForPhase(config.token, config.phase10),
        fetchAllCardsForPhase(config.token, config.phase5),
      ]);

      // Show tables immediately
      setData({ phase9Cards, phase10Cards, phase5Cards });
      setLoading(false);

      // Partial "Ativos hoje" from phases 8+9+10
      const stage1Cards = [...phase8Cards, ...phase9Cards, ...phase10Cards];
      setEntradasHoje(countAtivosHoje(stage1Cards));

      // Partial "Finalizados hoje" from phase 10
      setConcluidosHoje(countFinalizadosHoje(phase10Cards));

      // ── STAGE 2 (background): phase 11 full pagination ──
      fetchAllCardsForPhase(config.token, config.phase11)
        .then((phase11Cards) => {
          // Recalc "Ativos hoje": phases 8+9+10+11 deduplicated
          const allCardsMap = new Map<string, PipefyCard>();
          for (const card of [...stage1Cards, ...phase11Cards]) {
            allCardsMap.set(card.id, card);
          }
          const uniqueCards = Array.from(allCardsMap.values());
          setEntradasHoje(countAtivosHoje(uniqueCards));

          // Recalc "Finalizados hoje": phases 10+11 deduplicated
          const finalizadosMap = new Map<string, PipefyCard>();
          for (const card of [...phase10Cards, ...phase11Cards]) {
            finalizadosMap.set(card.id, card);
          }
          setConcluidosHoje(countFinalizadosHoje(Array.from(finalizadosMap.values())));

          setTodayLoading(false);
        })
        .catch(() => {
          // Keep stage 1 values, just stop loading
          setTodayLoading(false);
        });
    } catch (err: any) {
      setError(err.message || "Erro ao buscar dados do Pipefy");
      setLoading(false);
      setTodayLoading(false);
    }
  }, []);

  return { data, loading, error, fetchData, entradasHoje, concluidosHoje, todayLoading };
}
