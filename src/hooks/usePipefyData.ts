import { useState, useCallback } from "react";
import { PipefyCard, TodayResult, fetchAllCardsForPhase, fetchTodayCardsForPhase, loadConfigFromServer } from "@/lib/pipefy";

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

      // Start ALL fetches in parallel
      const mainPromise = Promise.all([
        fetchAllCardsForPhase(config.token, config.phase9),
        fetchAllCardsForPhase(config.token, config.phase10),
        fetchAllCardsForPhase(config.token, config.phase5),
      ]);

      const todayPromise = Promise.all([
        fetchTodayCardsForPhase(config.token, config.phase9, "started_current_phase_at").catch(() => ({ count: 0, titles: [] } as TodayResult)),
        fetchTodayCardsForPhase(config.token, config.phase11, "updated_at").catch(() => ({ count: 0, titles: [] } as TodayResult)),
      ]);

      // Resolve main data as soon as ready (don't wait for today counts)
      mainPromise.then(([phase9Cards, phase10Cards, phase5Cards]) => {
        setData({ phase9Cards, phase10Cards, phase5Cards });
        setLoading(false);
      });

      // Resolve today counts independently
      todayPromise.then(([entradas, concluidos]) => {
        setEntradasHoje(entradas);
        setConcluidosHoje(concluidos);
        setTodayLoading(false);
      });

      // Wait for both to settle (for error handling)
      await Promise.all([mainPromise, todayPromise]);
    } catch (err: any) {
      setError(err.message || "Erro ao buscar dados do Pipefy");
      setLoading(false);
      setTodayLoading(false);
    }
  }, []);

  return { data, loading, error, fetchData, entradasHoje, concluidosHoje, todayLoading };
}
