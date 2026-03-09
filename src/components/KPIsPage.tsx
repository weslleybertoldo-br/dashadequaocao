import { useState, useEffect, useMemo, useRef, useCallback } from "react";
import { TodayResult } from "@/lib/pipefy";
import { useKPIHistory, hojeISO, DiaData } from "@/hooks/useKPIHistory";
import { lerMesSupabase, salvarDiaSupabase, lerUltimaAtualizacao } from "@/lib/supabaseData";
import { RefreshCw, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";

interface KPIsPageProps {
  entradasHoje: TodayResult | null;
  concluidosHoje: TodayResult | null;
}

const DIAS_LABEL = ["SEG", "TER", "QUA", "QUI", "SEX", "SÁB"];
const META_SEMANAL = 50;
const META_MENSAL = 200;

function gerarSemanasDoMes(ano: number, mes: number): Date[][] {
  const semanas: Date[][] = [];
  const primeiroDia = new Date(ano, mes, 1);
  const inicio = new Date(primeiroDia);
  const diaSemana = inicio.getDay();
  if (diaSemana !== 1) {
    const diasAteSegunda = diaSemana === 0 ? 1 : 8 - diaSemana;
    inicio.setDate(inicio.getDate() + diasAteSegunda);
  }
  for (let s = 0; s < 4; s++) {
    const diasDaSemana: Date[] = [];
    for (let d = 0; d < 6; d++) {
      const dia = new Date(inicio);
      dia.setDate(inicio.getDate() + d);
      diasDaSemana.push(dia);
    }
    semanas.push(diasDaSemana);
    inicio.setDate(inicio.getDate() + 7);
  }
  return semanas;
}

function formatarData(date: Date) {
  const d = String(date.getDate()).padStart(2, "0");
  const m = String(date.getMonth() + 1).padStart(2, "0");
  return `${d}/${m}`;
}

function toDateISO(date: Date): string {
  const d = String(date.getDate()).padStart(2, "0");
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const y = date.getFullYear();
  return `${y}-${m}-${d}`;
}

function getFaltamColor(faltam: number) {
  if (faltam === 0) return "text-success";
  if (faltam <= 15) return "text-warning";
  return "text-destructive";
}

function getPercentColor(pct: number) {
  if (pct >= 100) return "text-success";
  if (pct >= 70) return "text-warning";
  return "text-destructive";
}

function EditableCell({
  value,
  imoveis,
  onSave,
}: {
  value: number | null;
  imoveis: string[];
  onSave: (v: number) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (editing) inputRef.current?.focus();
  }, [editing]);

  const commit = () => {
    const n = parseInt(draft, 10);
    if (!isNaN(n) && n >= 0) onSave(n);
    setEditing(false);
  };

  if (editing) {
    return (
      <input
        ref={inputRef}
        type="number"
        min={0}
        className="w-12 bg-transparent text-center font-mono text-base text-foreground outline-none border-b border-primary/40"
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => e.key === "Enter" && commit()}
      />
    );
  }

  const display = (
    <span
      className={`cursor-pointer hover:text-primary transition-colors font-mono text-base ${imoveis.length > 0 ? "border-b border-dotted border-muted-foreground/40" : ""}`}
      onClick={() => {
        setDraft(String(value ?? 0));
        setEditing(true);
      }}
    >
      {value !== null ? value : "—"}
    </span>
  );

  if (imoveis.length > 0) {
    return (
      <Tooltip>
        <TooltipTrigger asChild>{display}</TooltipTrigger>
        <TooltipContent className="max-w-xs max-h-64 overflow-y-auto text-xs whitespace-pre-wrap">
          <div className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1">
            {imoveis.length} imóve{imoveis.length !== 1 ? "is" : "l"}
          </div>
          {imoveis.join("\n")}
        </TooltipContent>
      </Tooltip>
    );
  }

  return display;
}

function KPITable({
  title,
  tipo,
  semanas,
  dadosMes,
  onSaveCell,
  showMetaColumns = true,
}: {
  title: string;
  tipo: string;
  semanas: Date[][];
  dadosMes: Record<string, DiaData>;
  onSaveCell: (dataISO: string, tipo: string, value: number, imoveis: string[]) => void;
  showMetaColumns?: boolean;
}) {
  return (
    <div>
      <div className="mb-3 border-b border-primary/40 pb-2">
        <h3 className="font-display font-bold text-sm uppercase tracking-widest text-foreground">
          {title}
        </h3>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full border-collapse min-w-[700px]">
          <tbody>
            {semanas.map((semana, sIdx) => {
              const weekTotal = semana.reduce((s, dia) => {
                const key = `${toDateISO(dia)}_${tipo}`;
                return s + (dadosMes[key]?.total ?? 0);
              }, 0);
              const pct = META_SEMANAL > 0 ? Math.round((weekTotal / META_SEMANAL) * 100) : 0;

              return (
                <tr key={sIdx} className="group">
                  <td
                    className="px-3 py-2 text-xs font-display font-bold text-muted-foreground whitespace-nowrap"
                    style={{ background: "hsl(225 15% 5%)" }}
                  >
                    SEM {sIdx + 1}
                  </td>

                  {semana.map((dia, dIdx) => {
                    const dataISO = toDateISO(dia);
                    const key = `${dataISO}_${tipo}`;
                    const dado = dadosMes[key] ?? null;
                    return (
                      <td
                        key={dIdx}
                        className="px-2 py-2 text-center"
                        style={{ background: "hsl(var(--card))" }}
                      >
                        <div className="text-[11px] text-muted-foreground mb-0.5">
                          {DIAS_LABEL[dIdx]} {formatarData(dia)}
                        </div>
                        <EditableCell
                          value={dado?.total ?? null}
                          imoveis={dado?.imoveis ?? []}
                          onSave={(v) => onSaveCell(dataISO, tipo, v, dado?.imoveis ?? [])}
                        />
                      </td>
                    );
                  })}

                  <td
                    className="px-3 py-2 text-center"
                    style={{ background: "hsl(225 20% 11%)" }}
                  >
                    <div className="text-[11px] text-muted-foreground mb-0.5">TOTAL</div>
                    <span
                      className="font-mono font-bold"
                      style={!showMetaColumns ? { fontSize: "1.25rem", color: "#06b6d4" } : { fontSize: "1rem" }}
                    >
                      {weekTotal}
                    </span>
                  </td>

                  {showMetaColumns && (
                    <>
                      <td className="px-3 py-2 text-center" style={{ background: "hsl(var(--card))" }}>
                        <div className="text-[11px] text-muted-foreground mb-0.5">META</div>
                        <span className="font-mono text-base text-muted-foreground">{META_SEMANAL}</span>
                      </td>

                      <td className="px-3 py-2 text-center" style={{ background: "hsl(var(--card))" }}>
                        <div className="text-[11px] text-muted-foreground mb-0.5">FALTAM</div>
                        {(() => {
                          const faltam = Math.max(0, META_SEMANAL - weekTotal);
                          return (
                            <span className={`font-mono text-base font-bold ${getFaltamColor(faltam)}`}>
                              {faltam === 0 ? "✓" : faltam}
                            </span>
                          );
                        })()}
                      </td>
                    </>
                  )}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export function KPIsPage({ entradasHoje, concluidosHoje }: KPIsPageProps) {
  const hoje = new Date();
  const ano = hoje.getFullYear();
  const mes = hoje.getMonth();

  const semanas = useMemo(() => gerarSemanasDoMes(ano, mes), [ano, mes]);

  const { loadingKPI, progresso, refreshTrigger, forcarAtualizacao } = useKPIHistory();

  const [dadosMes, setDadosMes] = useState<Record<string, DiaData>>({});
  const [loadingMes, setLoadingMes] = useState(true);
  const [ultimaAtualizacao, setUltimaAtualizacao] = useState<string | null>(null);

  // Load month data and last update timestamp from Supabase
  useEffect(() => {
    setLoadingMes(true);
    Promise.all([
      lerMesSupabase(ano, mes),
      lerUltimaAtualizacao(),
    ]).then(([mapa, ts]) => {
      setDadosMes(mapa);
      setUltimaAtualizacao(ts);
      setLoadingMes(false);
    });
  }, [ano, mes, refreshTrigger]);

  // Auto-save today's dashboard values to Supabase
  useEffect(() => {
    if (entradasHoje === null || concluidosHoje === null) return;
    const hojeStr = hojeISO();

    salvarDiaSupabase(hojeStr, "ativacao", entradasHoje.count, entradasHoje.titles);
    salvarDiaSupabase(hojeStr, "finalizados", concluidosHoje.count, concluidosHoje.titles);

    setDadosMes((prev) => ({
      ...prev,
      [`${hojeStr}_ativacao`]: { total: entradasHoje.count, imoveis: entradasHoje.titles },
      [`${hojeStr}_finalizados`]: { total: concluidosHoje.count, imoveis: concluidosHoje.titles },
    }));
  }, [entradasHoje, concluidosHoje]);

  // Handle manual cell edit
  const handleSaveCell = useCallback(
    (dataISO: string, tipo: string, value: number, imoveis: string[]) => {
      salvarDiaSupabase(dataISO, tipo, value, imoveis);
      setDadosMes((prev) => ({
        ...prev,
        [`${dataISO}_${tipo}`]: { total: value, imoveis },
      }));
    },
    []
  );

  // Compute month totals
  const { totalAtivacao, totalFinalizados } = useMemo(() => {
    let tA = 0;
    let tF = 0;
    semanas.forEach((semana) => {
      semana.forEach((dia) => {
        const dataISO = toDateISO(dia);
        tA += dadosMes[`${dataISO}_ativacao`]?.total ?? 0;
        tF += dadosMes[`${dataISO}_finalizados`]?.total ?? 0;
      });
    });
    return { totalAtivacao: tA, totalFinalizados: tF };
  }, [semanas, dadosMes]);

  const pctAtivacao = Math.round((totalAtivacao / META_MENSAL) * 100);
  const pctFinalizados = Math.round((totalFinalizados / META_MENSAL) * 100);

  const MESES = ["Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho", "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"];

  return (
    <div className="space-y-8">
      {/* Last update timestamp */}
      {ultimaAtualizacao && !loadingKPI && (
        <div className="text-xs text-muted-foreground">
          Atualizado em{" "}
          {new Date(ultimaAtualizacao).toLocaleString("pt-BR", {
            hour: "2-digit",
            minute: "2-digit",
            day: "2-digit",
            month: "2-digit",
            year: "numeric",
            timeZone: "America/Sao_Paulo",
          }).replace(",", " ·")}
        </div>
      )}

      {/* Loading indicator */}
      {(loadingKPI || loadingMes) && (
        <div className="flex items-center gap-2.5 px-4 py-2.5 bg-card border border-border rounded-lg text-sm text-muted-foreground">
          <Loader2 className="w-4 h-4 animate-spin text-primary" />
          {loadingKPI ? (progresso || "Carregando histórico...") : "Carregando dados do mês..."}
        </div>
      )}

      {/* Error message */}
      {!loadingKPI && progresso && (
        <div className="flex items-center gap-2.5 px-4 py-2.5 bg-card border border-destructive/30 rounded-lg text-sm text-destructive">
          {progresso}
        </div>
      )}

      {/* Month label + refresh button */}
      <div className="flex items-center justify-between">
        <p className="text-xs text-muted-foreground font-display uppercase tracking-widest">
          {MESES[mes]} {ano}
        </p>
        <Button
          variant="ghost"
          size="sm"
          onClick={forcarAtualizacao}
          disabled={loadingKPI}
          className="gap-2 text-muted-foreground hover:text-foreground text-xs"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${loadingKPI ? "animate-spin" : ""}`} />
          Atualizar histórico
        </Button>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 gap-4">
        <div className="bg-card border border-border rounded-lg p-4">
          <p className="text-xs text-muted-foreground mb-1">Total Ativações (mês)</p>
          <p className={`text-2xl font-mono font-bold ${getPercentColor(pctAtivacao)}`}>{totalAtivacao}</p>
        </div>
        <div className="bg-card border border-border rounded-lg p-4">
          <p className="text-xs text-muted-foreground mb-1">Meta Mensal Ativação</p>
          <p className="text-2xl font-mono font-bold text-foreground">{META_MENSAL}</p>
        </div>
      </div>

      {/* Ativação table */}
      <KPITable
        title="Ativação"
        tipo="ativacao"
        semanas={semanas}
        dadosMes={dadosMes}
        onSaveCell={handleSaveCell}
      />

      {/* Finalizados table */}
      <KPITable
        title="Finalizados"
        tipo="finalizados"
        semanas={semanas}
        dadosMes={dadosMes}
        onSaveCell={handleSaveCell}
        showMetaColumns={false}
      />
    </div>
  );
}
