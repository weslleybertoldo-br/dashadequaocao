import { useState, useCallback } from "react";
import { PipefyCard, TodayResult, fetchAllCardsForPhase, getTodayCardsByPhaseHistoryFromLoadedCards, loadConfigFromServer } from "@/lib/pipefy";

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

      // STAGE 1: Fast load — tables (phases 9/10 WITH phases_history for reuse)
      const [phase9Cards, phase10Cards, phase5Cards] = await Promise.all([
        fetchAllCardsForPhase(config.token, config.phase9, true),
        fetchAllCardsForPhase(config.token, config.phase10, true),
        fetchAllCardsForPhase(config.token, config.phase5),
      ]);

      setData({ phase9Cards, phase10Cards, phase5Cards });
      setLoading(false);

      // STAGE 2: Background — fetch ALL phase 11 cards
      fetchAllCardsForPhase(config.token, config.phase11, true)
        .then((phase11Cards) => {
          // Merge phases 9+10+11, deduplicate by id
          const allCardsMap = new Map<string, PipefyCard>();
          for (const card of [...phase9Cards, ...phase10Cards, ...phase11Cards]) {
            allCardsMap.set(card.id, card);
          }
          const uniqueCards = Array.from(allCardsMap.values());
          setEntradasHoje(getTodayCardsByPhaseHistoryFromLoadedCards(uniqueCards, config.phase9));
          setConcluidosHoje(getTodayCardsByPhaseHistoryFromLoadedCards(phase11Cards, config.phase11));
          setTodayLoading(false);
        })
        .catch(() => {
          setEntradasHoje({ count: 0, titles: [] });
          setConcluidosHoje({ count: 0, titles: [] });
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
