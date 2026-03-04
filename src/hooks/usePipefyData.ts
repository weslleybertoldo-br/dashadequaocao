import { useState, useCallback } from "react";
import { PipefyCard, fetchAllCardsForPhase, loadConfig } from "@/lib/pipefy";

interface PipefyData {
  phase9Cards: PipefyCard[];
  phase10Cards: PipefyCard[];
  phase5Cards: PipefyCard[];
}

export function usePipefyData() {
  const [data, setData] = useState<PipefyData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    const config = loadConfig();

    setLoading(true);
    setError(null);

    try {
      const [phase9Cards, phase10Cards, phase5Cards] = await Promise.all([
        fetchAllCardsForPhase(config.token, config.phase9),
        fetchAllCardsForPhase(config.token, config.phase10),
        fetchAllCardsForPhase(config.token, config.phase5),
      ]);

      setData({ phase9Cards, phase10Cards, phase5Cards });
    } catch (err: any) {
      setError(err.message || "Erro ao buscar dados do Pipefy");
    } finally {
      setLoading(false);
    }
  }, []);

  return { data, loading, error, fetchData };
}
