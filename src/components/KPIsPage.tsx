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

const DIAS_LABEL = ["SEG", "TER", "QUA", "QUI", "SEX", "SAB"];
const META_SEMANAL = 50;
const META_MENSAL = 200;
const MESES_LABEL = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];
const MESES_FULL = ["Janeiro", "Fevereiro", "Marco", "Abril", "Maio", "Junho", "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"];

// ── Helpers ──

function getBRT(): Date {
  return new Date(new Date().toLocaleString("en-US", { timeZone: "America/Sao_Paulo" }));
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

// ── Gerar semanas do mes ──
// Semana 1 = semana (Seg-Sab) que contem o dia 1
// Ultima semana = semana que contem o ultimo dia Seg-Sab do mes
// Se o ultimo dia do mes cai no domingo, nao gera semana extra

function gerarSemanasDoMes(ano: number, mes: number): Date[][] {
  const semanas: Date[][] = [];

  // Achar a segunda-feira da semana que contem o dia 1
  const dia1 = new Date(ano, mes, 1);
  const dow = dia1.getDay(); // 0=dom 1=seg ...
  const inicio = new Date(dia1);
  if (dow === 0) {
    // Dia 1 eh domingo: a semana Seg-Sab ja passou, proxima segunda = dia 2
    inicio.setDate(inicio.getDate() + 1);
  } else if (dow !== 1) {
    // Voltar para a segunda anterior
    inicio.setDate(inicio.getDate() - (dow - 1));
  }

  // Ultimo dia do mes
  const ultimoDia = new Date(ano, mes + 1, 0); // dia 30 ou 31 etc

  // Gerar semanas ate cobrir o ultimo dia util (Seg-Sab) do mes
  const cursor = new Date(inicio);
  while (true) {
    const segunda = new Date(cursor);
    const sabado = new Date(cursor);
    sabado.setDate(sabado.getDate() + 5);

    // Se a segunda ja passou do ultimo dia do mes, parar
    if (segunda.getMonth() > mes && segunda.getFullYear() >= ano) break;
    if (segunda.getFullYear() > ano) break;

    // Verificar se esta semana tem pelo menos um dia Seg-Sab dentro do mes
    let temDiaNoMes = false;
    const diasDaSemana: Date[] = [];
    for (let d = 0; d < 6; d++) {
      const dia = new Date(cursor);
      dia.setDate(cursor.getDate() + d);
      diasDaSemana.push(dia);
      if (dia.getMonth() === mes && dia.getFullYear() === ano) {
        temDiaNoMes = true;
      }
    }

    if (temDiaNoMes) {
      semanas.push(diasDaSemana);
    }

    cursor.setDate(cursor.getDate() + 7);

    // Safety: max 6 semanas
    if (semanas.length >= 6) break;
  }

  return semanas;
}

// ── Determinar qual mes exibir ──
// Se a segunda-feira da semana que contem o dia 1 do mes atual ainda nao chegou,
// mostra o mes anterior

function getMesExibido(ano: number, mes: number): { ano: number; mes: number } {
  const hoje = getBRT();
  hoje.setHours(0, 0, 0, 0);

  const dia1 = new Date(ano, mes, 1);
  const dow = dia1.getDay();
  const segundaDaSemana1 = new Date(dia1);
  if (dow === 0) {
    segundaDaSemana1.setDate(segundaDaSemana1.getDate() + 1);
  } else if (dow !== 1) {
    segundaDaSemana1.setDate(segundaDaSemana1.getDate() - (dow - 1));
  }

  if (hoje < segundaDaSemana1) {
    // Ainda nao chegou a segunda da primeira semana do mes atual
    // Mostrar mes anterior
    if (mes === 0) return { ano: ano - 1, mes: 11 };
    return { ano, mes: mes - 1 };
  }
  return { ano, mes };
}

// ── Componentes ──

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
      {value !== null ? value : "\u2014"}
    </span>
  );

  if (imoveis.length > 0) {
    return (
      <Tooltip>
        <TooltipTrigger asChild>{display}</TooltipTrigger>
        <TooltipContent className="max-w-xs max-h-64 overflow-y-auto text-xs whitespace-pre-wrap">
          <div className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1">
            {imoveis.length} {imoveis.length !== 1 ? "imoveis" : "imovel"}
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
                              {faltam === 0 ? "\u2713" : faltam}
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

// ── Pagina principal ──

export function KPIsPage({ entradasHoje, concluidosHoje }: KPIsPageProps) {
  const agora = getBRT();
  const anoReal = agora.getFullYear();
  const mesReal = agora.getMonth();

  // Determinar qual mes exibir (pode ser o anterior se a semana ainda nao virou)
  const { ano, mes } = useMemo(() => getMesExibido(anoReal, mesReal), [anoReal, mesReal]);

  const semanas = useMemo(() => gerarSemanasDoMes(ano, mes), [ano, mes]);

  const [dadosMes, setDadosMes] = useState<Record<string, DiaData>>({});
  const [loadingMes, setLoadingMes] = useState(true);
  const [ativosTotais, setAtivosTotais] = useState<number | null>(null);
  const [resumoMensal, setResumoMensal] = useState<Record<string, number>>({});

  // ── Sapron: busca status_log + properties_list para ativacao ──
  useEffect(() => {
    setLoadingMes(true);

    Promise.all([
      supabase.rpc("sapron_status_log"),
      supabase.rpc("sapron_properties_list"),
      // Finalizados: buscar do kpi_historico (Pipefy)
      (() => {
        const mesesNecessarios = new Set<string>();
        mesesNecessarios.add(`${ano}-${mes}`);
        semanas.forEach((semana) => {
          semana.forEach((dia) => {
            mesesNecessarios.add(`${dia.getFullYear()}-${dia.getMonth()}`);
          });
        });
        return Promise.all(
          Array.from(mesesNecessarios).map((key) => {
            const [a, m] = key.split("-").map(Number);
            return lerMesSupabase(a, m);
          })
        );
      })(),
    ]).then(([statusLogRes, propsRes, finalizadosMeses]) => {
      const mapa: Record<string, DiaData> = {};

      // 1. Finalizados do kpi_historico (so pegar _finalizados)
      finalizadosMeses.forEach((r) => {
        Object.entries(r).forEach(([key, val]) => {
          if (key.endsWith("_finalizados")) {
            mapa[key] = val;
          }
        });
      });

      // 2. Ativacao do Sapron
      if (!statusLogRes.error && statusLogRes.data && !propsRes.error && propsRes.data) {
        const logs = statusLogRes.data as { status: string; exchange_date: string; property: number }[];
        const props = propsRes.data as { id: number; code: string; status: string }[];

        // Map property ID -> code
        const codeMap = new Map<number, string>();
        props.forEach((p) => codeMap.set(p.id, p.code));

        // Ativos totais
        setAtivosTotais(props.filter((p) => p.status === "Active").length);

        // Agrupar ativacoes por dia (primeira ativacao de cada imovel naquele dia)
        const activeEntries = logs.filter((e) => e.status === "Active");
        const porDia: Record<string, Set<number>> = {};
        activeEntries.forEach((entry) => {
          const dia = entry.exchange_date;
          if (!porDia[dia]) porDia[dia] = new Set();
          porDia[dia].add(entry.property);
        });

        Object.entries(porDia).forEach(([dia, propSet]) => {
          const codes = Array.from(propSet).map((id) => codeMap.get(id) || `ID:${id}`);
          mapa[`${dia}_ativacao`] = { total: propSet.size, imoveis: codes };
        });

        // Resumo mensal
        const resumo: Record<string, number> = {};
        for (let m = 0; m <= mesReal; m++) {
          const mesStr = `${anoReal}-${String(m + 1).padStart(2, "0")}`;
          const propsDoMes = new Set<number>();
          activeEntries.forEach((entry) => {
            if (entry.exchange_date.startsWith(mesStr)) {
              propsDoMes.add(entry.property);
            }
          });
          resumo[String(m)] = propsDoMes.size;
        }
        setResumoMensal(resumo);
      }

      setDadosMes(mapa);
      setLoadingMes(false);
    });
  }, [ano, mes, semanas, anoReal, mesReal]);

  // Reflect live finalizados from Pipefy
  useEffect(() => {
    if (concluidosHoje === null) return;
    const hojeStr = hojeISO();
    setDadosMes((prev) => ({
      ...prev,
      [`${hojeStr}_finalizados`]: { total: concluidosHoje.count, imoveis: concluidosHoje.titles },
    }));
  }, [concluidosHoje]);

  // Handle manual cell edit (so para finalizados)
  const handleSaveCell = useCallback(
    (dataISO: string, tipo: string, value: number, imoveis: string[]) => {
      if (tipo === "finalizados") {
        salvarDiaSupabase(dataISO, tipo, value, imoveis);
      }
      setDadosMes((prev) => ({
        ...prev,
        [`${dataISO}_${tipo}`]: { total: value, imoveis },
      }));
    },
    []
  );

  // Compute month totals (apenas dias do mes exibido)
  const totalAtivacao = useMemo(() => {
    let tA = 0;
    semanas.forEach((semana) => {
      semana.forEach((dia) => {
        if (dia.getMonth() === mes && dia.getFullYear() === ano) {
          const dataISO = toDateISO(dia);
          tA += dadosMes[`${dataISO}_ativacao`]?.total ?? 0;
        }
      });
    });
    return tA;
  }, [semanas, dadosMes, ano, mes]);

  const pctAtivacao = Math.round((totalAtivacao / META_MENSAL) * 100);

  return (
    <div className="space-y-8">
      {/* Loading indicator */}
      {loadingMes && (
        <div className="flex items-center gap-2.5 px-4 py-2.5 bg-card border border-border rounded-lg text-sm text-muted-foreground">
          <Loader2 className="w-4 h-4 animate-spin text-primary" />
          Carregando dados do mes...
        </div>
      )}

      {/* Month label */}
      <p className="text-xs text-muted-foreground font-display uppercase tracking-widest">
        {MESES_FULL[mes]} {ano}
      </p>

      {/* Summary cards */}
      <div className="grid grid-cols-3 gap-4">
        <div className="bg-card border border-border rounded-lg p-4">
          <p className="text-xs text-muted-foreground mb-1">Total Ativacoes (mes)</p>
          <p className={`text-2xl font-mono font-bold ${getPercentColor(pctAtivacao)}`}>{totalAtivacao}</p>
        </div>
        <div className="bg-card border border-border rounded-lg p-4">
          <p className="text-xs text-muted-foreground mb-1">Meta Mensal Ativacao</p>
          <p className="text-2xl font-mono font-bold text-foreground">{META_MENSAL}</p>
        </div>
        <div className="bg-card border border-border rounded-lg p-4">
          <p className="text-xs text-muted-foreground mb-1">Ativos Totais (Sapron)</p>
          <p className="text-2xl font-mono font-bold text-primary">
            {ativosTotais !== null ? ativosTotais.toLocaleString("pt-BR") : "..."}
          </p>
        </div>
      </div>

      {/* Resumo mensal de ativacoes */}
      <div className="flex gap-2 flex-wrap">
        {Array.from({ length: mesReal + 1 }, (_, m) => {
          const total = resumoMensal[String(m)] ?? 0;
          const isMesExibido = m === mes;
          return (
            <div
              key={m}
              className={`px-3 py-1.5 rounded-md text-center ${isMesExibido ? "bg-primary/15 border border-primary/30" : "bg-card border border-border"}`}
              style={{ minWidth: 60 }}
            >
              <div className="text-[10px] text-muted-foreground uppercase">{MESES_LABEL[m]}</div>
              <div className={`text-sm font-mono font-bold ${isMesExibido ? "text-primary" : "text-foreground"}`}>
                {total}
              </div>
            </div>
          );
        })}
      </div>

      {/* Ativacao table */}
      <KPITable
        title="Ativacao"
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
