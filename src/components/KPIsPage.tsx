import { useState, useEffect, useMemo, useRef, useCallback } from "react";
import { TodayResult } from "@/lib/pipefy";

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

function chaveStorage(tipo: string, ano: number, mes: number) {
  return `kpi_${tipo}_${ano}_${mes}`;
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
  value: number | undefined;
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
      {value ?? "—"}
    </span>
  );
}

function KPITable({
  title,
  tipo,
  semanas,
  ano,
  mes,
  todayValue,
}: {
  title: string;
  tipo: string;
  semanas: Date[][];
  ano: number;
  mes: number;
  todayValue: number | null;
}) {
  const storageKey = chaveStorage(tipo, ano, mes);
  const [dados, setDados] = useState<Record<string, number>>(() => {
    try {
      return JSON.parse(localStorage.getItem(storageKey) || "{}");
    } catch {
      return {};
    }
  });

  // Auto-save today's value
  useEffect(() => {
    if (todayValue === null || todayValue === undefined) return;
    const hojeStr = new Date().toDateString();
    semanas.forEach((semana, sIdx) => {
      semana.forEach((dia, dIdx) => {
        if (dia.toDateString() === hojeStr) {
          const key = `sem${sIdx + 1}_dia${dIdx}`;
          setDados((prev) => {
            const next = { ...prev, [key]: todayValue };
            localStorage.setItem(storageKey, JSON.stringify(next));
            return next;
          });
        }
      });
    });
  }, [todayValue, semanas, storageKey]);

  const handleSave = useCallback(
    (key: string, value: number) => {
      setDados((prev) => {
        const next = { ...prev, [key]: value };
        localStorage.setItem(storageKey, JSON.stringify(next));
        return next;
      });
    },
    [storageKey]
  );

  const totalMes = useMemo(() => {
    return Object.values(dados).reduce((s, v) => s + (v || 0), 0);
  }, [dados]);

  const pctMes = META_MENSAL > 0 ? Math.round((totalMes / META_MENSAL) * 100) : 0;

  return (
    <div>
      {/* Section header */}
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
                (s, _, dIdx) => s + (dados[`sem${sIdx + 1}_dia${dIdx}`] || 0),
                0
              );
              const pct = META_SEMANAL > 0 ? Math.round((weekTotal / META_SEMANAL) * 100) : 0;

              return (
                <tr key={sIdx} className="group">
                  {/* Week label */}
                  <td
                    className="px-3 py-2 text-xs font-display font-bold text-muted-foreground whitespace-nowrap"
                    style={{ background: "hsl(225 15% 5%)" }}
                    rowSpan={1}
                  >
                    SEM {sIdx + 1}
                  </td>

                  {/* Day columns - date header + value in same row using flex */}
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
                          value={dados[key]}
                          onSave={(v) => handleSave(key, v)}
                        />
                      </td>
                    );
                  })}

                  {/* TOTAL */}
                  <td
                    className="px-3 py-2 text-center"
                    style={{ background: "hsl(225 20% 11%)" }}
                  >
                    <div className="text-[11px] text-muted-foreground mb-0.5">TOTAL</div>
                    <span className="font-mono text-base font-bold text-foreground">{weekTotal}</span>
                  </td>

                  {/* META */}
                  <td className="px-3 py-2 text-center" style={{ background: "hsl(var(--card))" }}>
                    <div className="text-[11px] text-muted-foreground mb-0.5">META</div>
                    <span className="font-mono text-base text-muted-foreground">{META_SEMANAL}</span>
                  </td>

                  {/* % */}
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

  // Compute month totals from localStorage
  const ativacaoData = useMemo(() => {
    try {
      return JSON.parse(localStorage.getItem(chaveStorage("ativacao", ano, mes)) || "{}");
    } catch { return {}; }
  }, [ano, mes, entradasHoje]);

  const finalizadosData = useMemo(() => {
    try {
      return JSON.parse(localStorage.getItem(chaveStorage("finalizados", ano, mes)) || "{}");
    } catch { return {}; }
  }, [ano, mes, concluidosHoje]);

  const totalAtivacao = Object.values(ativacaoData).reduce((s: number, v: any) => s + (v || 0), 0) as number;
  const totalFinalizados = Object.values(finalizadosData).reduce((s: number, v: any) => s + (v || 0), 0) as number;
  const pctAtivacao = Math.round((totalAtivacao / META_MENSAL) * 100);
  const pctFinalizados = Math.round((totalFinalizados / META_MENSAL) * 100);

  const MESES = ["Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho", "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"];

  return (
    <div className="space-y-8">
      {/* Month label */}
      <p className="text-xs text-muted-foreground font-display uppercase tracking-widest">
        {MESES[mes]} {ano}
      </p>

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
        ano={ano}
        mes={mes}
        todayValue={entradasHoje?.count ?? null}
      />

      {/* Finalizados table */}
      <KPITable
        title="Finalizados"
        tipo="finalizados"
        semanas={semanas}
        ano={ano}
        mes={mes}
        todayValue={concluidosHoje?.count ?? null}
      />
    </div>
  );
}
