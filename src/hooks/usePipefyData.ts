import { useState, useCallback } from "react";
import { PipefyCard, fetchAllCardsForPhase, fetchTodayCountForPhase, loadConfigFromServer } from "@/lib/pipefy";

interface PipefyData {
  phase9Cards: PipefyCard[];
  phase10Cards: PipefyCard[];
  phase5Cards: PipefyCard[];
}

export function usePipefyData() {
  const [data, setData] = useState<PipefyData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [entradasHoje, setEntradasHoje] = useState<number | null>(null);
  const [concluidosHoje, setConcluidosHoje] = useState<number | null>(null);
  const [todayLoading, setTodayLoading] = useState(false);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    setEntradasHoje(null);
    setConcluidosHoje(null);
    setTodayLoading(true);

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

      // Fetch today counts in background (lightweight queries, no fields)
      try {
        const [entradas, concluidos] = await Promise.all([
          fetchTodayCountForPhase(config.token, config.phase9),
          fetchTodayCountForPhase(config.token, config.phase11),
        ]);
        setEntradasHoje(entradas);
        setConcluidosHoje(concluidos);
      } catch {
        setEntradasHoje(0);
        setConcluidosHoje(0);
      } finally {
        setTodayLoading(false);
      }
    } catch (err: any) {
      setError(err.message || "Erro ao buscar dados do Pipefy");
      setLoading(false);
      setTodayLoading(false);
    }
  }, []);

  return { data, loading, error, fetchData, entradasHoje, concluidosHoje, todayLoading };
}
