import { useState, useEffect, useMemo, useRef, useCallback } from "react";
import { TodayResult } from "@/lib/pipefy";
import { hojeISO, DiaData } from "@/hooks/useKPIHistory";
import { lerMesSupabase, salvarDiaSupabase } from "@/lib/supabaseData";
import { supabase } from "@/integrations/supabase/client";
import { Loader2 } from "lucide-react";

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
  // Avancar para a primeira segunda-feira do mes (ou manter se ja for segunda)
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
      <div className="mb-3 border-b pb-2" style={{ borderColor: "hsl(var(--primary) / 0.4)" }}>
        <h3 style={{ fontSize: "var(--text-body)", fontWeight: "var(--font-weight-bold)", textTransform: "uppercase", letterSpacing: "0.1em" }}>
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
                    style={{ fontSize: "var(--text-sm)", fontWeight: "var(--font-weight-bold)", background: "hsl(var(--surface))" }}
                    className="px-3 py-2 text-muted-foreground whitespace-nowrap"
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
                    style={{ background: "hsl(var(--surface))" }}
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


  const [dadosMes, setDadosMes] = useState<Record<string, DiaData>>({});
  const [loadingMes, setLoadingMes] = useState(true);
  const [ativosTotais, setAtivosTotais] = useState<number | null>(null);

  // Load month data from Supabase
  useEffect(() => {
    setLoadingMes(true);
    lerMesSupabase(ano, mes).then((mapa) => {
      setDadosMes(mapa);
      setLoadingMes(false);
    });
  }, [ano, mes]);

  // Fetch total active properties from Sapron via RPC
  useEffect(() => {
    supabase.rpc("sapron_properties_list").then(({ data, error }) => {
      if (error || !data) return;
      const ativos = (data as { id: number; code: string; status: string }[])
        .filter((p) => p.status === "Active").length;
      setAtivosTotais(ativos);
    });
  }, []);

  // Reflect live dashboard values independently — each updates as soon as available
  useEffect(() => {
    if (entradasHoje === null) return;
    const hojeStr = hojeISO();
    setDadosMes((prev) => ({
      ...prev,
      [`${hojeStr}_ativacao`]: { total: entradasHoje.count, imoveis: entradasHoje.titles },
    }));
  }, [entradasHoje]);

  useEffect(() => {
    if (concluidosHoje === null) return;
    const hojeStr = hojeISO();
    setDadosMes((prev) => ({
      ...prev,
      [`${hojeStr}_finalizados`]: { total: concluidosHoje.count, imoveis: concluidosHoje.titles },
    }));
  }, [concluidosHoje]);

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
  const totalAtivacao = useMemo(() => {
    let tA = 0;
    semanas.forEach((semana) => {
      semana.forEach((dia) => {
        const dataISO = toDateISO(dia);
        tA += dadosMes[`${dataISO}_ativacao`]?.total ?? 0;
      });
    });
    return tA;
  }, [semanas, dadosMes]);

  const pctAtivacao = Math.round((totalAtivacao / META_MENSAL) * 100);

  const MESES = ["Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho", "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"];

  return (
    <div className="space-y-8">
      {/* Loading indicator */}
      {loadingMes && (
        <div className="flex items-center gap-2.5 px-4 py-2.5 bg-card border border-border rounded-lg text-sm text-muted-foreground">
          <Loader2 className="w-4 h-4 animate-spin text-primary" />
          Carregando dados do mês...
        </div>
      )}

      {/* Month label */}
      <p className="text-xs text-muted-foreground font-display uppercase tracking-widest">
        {MESES[mes]} {ano}
      </p>

      {/* Summary cards */}
      <div className="grid grid-cols-3 gap-4">
        <div className="bg-card border border-border rounded-lg p-4">
          <p className="text-xs text-muted-foreground mb-1">Total Ativações (mês)</p>
          <p className={`text-2xl font-mono font-bold ${getPercentColor(pctAtivacao)}`}>{totalAtivacao}</p>
        </div>
        <div className="bg-card border border-border rounded-lg p-4">
          <p className="text-xs text-muted-foreground mb-1">Meta Mensal Ativação</p>
          <p className="text-2xl font-mono font-bold text-foreground">{META_MENSAL}</p>
        </div>
        <div className="bg-card border border-border rounded-lg p-4">
          <p className="text-xs text-muted-foreground mb-1">Ativos Totais (Sapron)</p>
          <p className="text-2xl font-mono font-bold text-primary">
            {ativosTotais !== null ? ativosTotais.toLocaleString("pt-BR") : "..."}
          </p>
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
