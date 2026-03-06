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
  const [stage2Loading, setStage2Loading] = useState(false);
  const [stage2Duration, setStage2Duration] = useState<number | null>(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    setEntradasHoje(null);
    setConcluidosHoje(null);
    setTodayLoading(true);
    setStage2Loading(false);
    setStage2Duration(null);

    try {
      const config = await loadConfigFromServer();

      // ── STAGE 1 (fast): phases 8, 9, 10, 5 in parallel ──
      const [phase8Cards, phase9Cards, phase10Cards, phase5Cards] = await Promise.all([
        fetchAllCardsForPhase(config.token, config.phase8),
        fetchAllCardsForPhase(config.token, config.phase9),
        fetchAllCardsForPhase(config.token, config.phase10),
        fetchAllCardsForPhase(config.token, config.phase5),
      ]);

      setData({ phase9Cards, phase10Cards, phase5Cards });
      setLoading(false);

      const stage1Cards = [...phase8Cards, ...phase9Cards, ...phase10Cards];
      setEntradasHoje(countAtivosHoje(stage1Cards));
      setConcluidosHoje(countFinalizadosHoje(phase10Cards));
      setTodayLoading(false);

      // ── STAGE 2 (background): phase 11 full pagination ──
      setStage2Loading(true);
      const stage2Start = Date.now();

      fetchAllCardsForPhase(config.token, config.phase11)
        .then((phase11Cards) => {
          const allCardsMap = new Map<string, PipefyCard>();
          for (const card of [...stage1Cards, ...phase11Cards]) {
            allCardsMap.set(card.id, card);
          }
          setEntradasHoje(countAtivosHoje(Array.from(allCardsMap.values())));

          const finalizadosMap = new Map<string, PipefyCard>();
          for (const card of [...phase10Cards, ...phase11Cards]) {
            finalizadosMap.set(card.id, card);
          }
          setConcluidosHoje(countFinalizadosHoje(Array.from(finalizadosMap.values())));

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
  }, []);

  return { data, loading, error, fetchData, entradasHoje, concluidosHoje, todayLoading, stage2Loading, stage2Duration };
}
