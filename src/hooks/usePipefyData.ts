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

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    setEntradasHoje(null);
    setConcluidosHoje(null);

    try {
      const config = await loadConfigFromServer();

      // Fetch all 4 phases in parallel, phases 9/10/11 with phases_history
      const [phase9Cards, phase10Cards, phase5Cards, phase11Cards] = await Promise.all([
        fetchAllCardsForPhase(config.token, config.phase9, true),
        fetchAllCardsForPhase(config.token, config.phase10, true),
        fetchAllCardsForPhase(config.token, config.phase5),
        fetchAllCardsForPhase(config.token, config.phase11, true),
      ]);

      setData({ phase9Cards, phase10Cards, phase5Cards });

      // Deduplicate cards from phases 9, 10, 11 by id
      const allCardsMap = new Map<string, PipefyCard>();
      for (const card of [...phase9Cards, ...phase10Cards, ...phase11Cards]) {
        allCardsMap.set(card.id, card);
      }
      const uniqueCards = Array.from(allCardsMap.values());

      // Calculate both metrics locally from deduplicated cards
      setEntradasHoje(getTodayCardsByPhaseHistoryFromLoadedCards(uniqueCards, config.phase9));
      setConcluidosHoje(getTodayCardsByPhaseHistoryFromLoadedCards(uniqueCards, config.phase11));

      setLoading(false);
    } catch (err: any) {
      setError(err.message || "Erro ao buscar dados do Pipefy");
      setLoading(false);
    }
  }, []);

  return { data, loading, error, fetchData, entradasHoje, concluidosHoje };
}
