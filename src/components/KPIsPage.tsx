import { useState, useEffect, useMemo, useRef, useCallback } from "react";
import { TodayResult } from "@/lib/pipefy";
import { useKPIHistory, lerDia } from "@/hooks/useKPIHistory";
import { RefreshCw, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";

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

function getPercentColor(pct: number) {
  if (pct >= 100) return "text-success";
  if (pct >= 70) return "text-warning";
  return "text-destructive";
}

function EditableCell({
  value,
  onSave,
}: {
  value: number | null;
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

  return (
    <span
      className="cursor-pointer hover:text-primary transition-colors font-mono text-base"
      onClick={() => {
        setDraft(String(value ?? 0));
        setEditing(true);
      }}
    >
      {value !== null ? value : "—"}
    </span>
  );
}

function KPITable({
  title,
  tipo,
  semanas,
  refreshTrigger,
}: {
  title: string;
  tipo: string;
  semanas: Date[][];
  refreshTrigger: number;
}) {
  // Read all values from per-day localStorage keys
  const [dados, setDados] = useState<Record<string, number | null>>({});

  // Load from per-day keys whenever refreshTrigger changes
  useEffect(() => {
    const newDados: Record<string, number | null> = {};
    semanas.forEach((semana, sIdx) => {
      semana.forEach((dia, dIdx) => {
        const key = `sem${sIdx + 1}_dia${dIdx}`;
        const dataISO = toDateISO(dia);
        newDados[key] = lerDia(dataISO, tipo);
      });
    });
    setDados(newDados);
  }, [semanas, tipo, refreshTrigger]);

  const handleSave = useCallback(
    (cellKey: string, dia: Date, value: number) => {
      const dataISO = toDateISO(dia);
      localStorage.setItem(`kpi_dia_${dataISO}_${tipo}`, String(value));
      setDados((prev) => ({ ...prev, [cellKey]: value }));
    },
    [tipo]
  );

  const totalMes = useMemo(() => {
    return Object.values(dados).reduce((s: number, v) => s + (v ?? 0), 0);
  }, [dados]);

  const pctMes = META_MENSAL > 0 ? Math.round((totalMes / META_MENSAL) * 100) : 0;

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
              const weekTotal = semana.reduce(
                (s, _, dIdx) => s + (dados[`sem${sIdx + 1}_dia${dIdx}`] ?? 0),
                0
              );
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
                    const key = `sem${sIdx + 1}_dia${dIdx}`;
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
                          value={dados[key] ?? null}
                          onSave={(v) => handleSave(key, dia, v)}
                        />
                      </td>
                    );
                  })}

                  <td
                    className="px-3 py-2 text-center"
                    style={{ background: "hsl(225 20% 11%)" }}
                  >
                    <div className="text-[11px] text-muted-foreground mb-0.5">TOTAL</div>
                    <span className="font-mono text-base font-bold text-foreground">{weekTotal}</span>
                  </td>

                  <td className="px-3 py-2 text-center" style={{ background: "hsl(var(--card))" }}>
                    <div className="text-[11px] text-muted-foreground mb-0.5">META</div>
                    <span className="font-mono text-base text-muted-foreground">{META_SEMANAL}</span>
                  </td>

                  <td className="px-3 py-2 text-center" style={{ background: "hsl(var(--card))" }}>
                    <div className="text-[11px] text-muted-foreground mb-0.5">%</div>
                    <span className={`font-mono text-base font-bold ${getPercentColor(pct)}`}>
                      {pct}%
                    </span>
                  </td>
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

  const { loadingKPI, progresso, refreshTrigger, forcarAtualizacao, kpiDuration } = useKPIHistory();

  const formatDuration = (seconds: number) => {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return m > 0 ? `${m}m ${s}s` : `${s}s`;
  };

  // Auto-save today's dashboard values when they update
  useEffect(() => {
    if (entradasHoje === null || concluidosHoje === null) return;
    const hojeStr = hoje.toDateString();
    semanas.forEach((semana) => {
      semana.forEach((dia) => {
        if (dia.toDateString() === hojeStr) {
          const dataISO = toDateISO(dia);
          localStorage.setItem(`kpi_dia_${dataISO}_ativacao`, String(entradasHoje.count));
          localStorage.setItem(`kpi_dia_${dataISO}_finalizados`, String(concluidosHoje.count));
        }
      });
    });
  }, [entradasHoje, concluidosHoje, semanas]);

  // Compute month totals from per-day localStorage keys
  const { totalAtivacao, totalFinalizados } = useMemo(() => {
    let tA = 0;
    let tF = 0;
    semanas.forEach((semana) => {
      semana.forEach((dia) => {
        const dataISO = toDateISO(dia);
        tA += lerDia(dataISO, "ativacao") ?? 0;
        tF += lerDia(dataISO, "finalizados") ?? 0;
      });
    });
    return { totalAtivacao: tA, totalFinalizados: tF };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [semanas, refreshTrigger, entradasHoje, concluidosHoje]);

  const pctAtivacao = Math.round((totalAtivacao / META_MENSAL) * 100);
  const pctFinalizados = Math.round((totalFinalizados / META_MENSAL) * 100);

  const MESES = ["Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho", "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"];

  return (
    <div className="space-y-8">
      {/* Loading indicator */}
      {loadingKPI && (
        <div className="flex items-center gap-2.5 px-4 py-2.5 bg-card border border-border rounded-lg text-sm text-muted-foreground">
          <Loader2 className="w-4 h-4 animate-spin text-primary" />
          {progresso || "Carregando histórico..."}
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
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="bg-card border border-border rounded-lg p-4">
          <p className="text-xs text-muted-foreground mb-1">Total Ativações (mês)</p>
          <p className={`text-2xl font-mono font-bold ${getPercentColor(pctAtivacao)}`}>{totalAtivacao}</p>
        </div>
        <div className="bg-card border border-border rounded-lg p-4">
          <p className="text-xs text-muted-foreground mb-1">Meta Mensal Ativação</p>
          <p className="text-2xl font-mono font-bold text-foreground">{META_MENSAL}</p>
        </div>
        <div className="bg-card border border-border rounded-lg p-4">
          <p className="text-xs text-muted-foreground mb-1">Total Finalizados (mês)</p>
          <p className={`text-2xl font-mono font-bold ${getPercentColor(pctFinalizados)}`}>{totalFinalizados}</p>
        </div>
        <div className="bg-card border border-border rounded-lg p-4">
          <p className="text-xs text-muted-foreground mb-1">Meta Mensal Finalizados</p>
          <p className="text-2xl font-mono font-bold text-foreground">{META_MENSAL}</p>
        </div>
      </div>

      {/* Ativação table */}
      <KPITable
        title="Ativação"
        tipo="ativacao"
        semanas={semanas}
        refreshTrigger={refreshTrigger}
      />

      {/* Finalizados table */}
      <KPITable
        title="Finalizados"
        tipo="finalizados"
        semanas={semanas}
        refreshTrigger={refreshTrigger}
      />
    </div>
  );
}
