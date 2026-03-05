import { useState, useCallback } from "react";
import { PipefyCard, fetchAllCardsForPhase, loadConfigFromServer } from "@/lib/pipefy";

interface PipefyData {
  phase9Cards: PipefyCard[];
  phase10Cards: PipefyCard[];
  phase5Cards: PipefyCard[];
}

export function usePipefyData() {
  const [data, setData] = useState<PipefyData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [phase11Cards, setPhase11Cards] = useState<PipefyCard[] | null>(null);
  const [phase11Loading, setPhase11Loading] = useState(false);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    setPhase11Cards(null);
    setPhase11Loading(true);

    try {
      const config = await loadConfigFromServer();

      // Fetch main phases first (fast)
      const [phase9Cards, phase10Cards, phase5Cards] = await Promise.all([
        fetchAllCardsForPhase(config.token, config.phase9),
        fetchAllCardsForPhase(config.token, config.phase10),
        fetchAllCardsForPhase(config.token, config.phase5),
      ]);

      setData({ phase9Cards, phase10Cards, phase5Cards });
      setLoading(false);

      // Fetch Phase 11 in background (slow - many cards)
      try {
        const cards = await fetchAllCardsForPhase(config.token, config.phase11);
        setPhase11Cards(cards);
      } catch {
        setPhase11Cards([]);
      } finally {
        setPhase11Loading(false);
      }
    } catch (err: any) {
      setError(err.message || "Erro ao buscar dados do Pipefy");
      setLoading(false);
      setPhase11Loading(false);
    }
  }, []);

  return { data, loading, error, fetchData, phase11Cards, phase11Loading };
}
