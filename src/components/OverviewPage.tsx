import { useState, useEffect, useMemo, useCallback } from "react";
import { PipefyCard, TodayResult, getField, getDaysInPhase } from "@/lib/pipefy";
import { Input } from "@/components/ui/input";
import { Search, ArrowUpDown, Loader2, RefreshCw } from "lucide-react";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { ExcecaoData, lerTodasExcecoesSupabase, salvarExcecaoSupabase } from "@/lib/supabaseData";

function ExcecaoRow({
  cardTitle,
  excecoesMapa,
  onUpdate,
}: {
  cardTitle: string;
  excecoesMapa: Record<string, ExcecaoData>;
  onUpdate: (imovelId: string, campo: "excecao" | "observacao", valor: string) => void;
}) {
  const dados = excecoesMapa[cardTitle] ?? { excecao: "", observacao: "" };

  const selectBg = dados.excecao === "Liberado exceção"
    ? "bg-success/10"
    : dados.excecao === "Exceção parcial"
    ? "bg-warning/10"
    : "bg-secondary";

  const selectText = dados.excecao === "Liberado exceção"
    ? "text-success"
    : dados.excecao === "Exceção parcial"
    ? "text-warning"
    : "text-muted-foreground";

  return (
    <>
      <td className="px-4 py-3 text-sm">
        <select
          value={dados.excecao}
          onChange={(e) => onUpdate(cardTitle, "excecao", e.target.value)}
          className={`${selectBg} ${selectText} border border-border rounded-md px-2 py-1 text-xs cursor-pointer outline-none min-w-[140px]`}
        >
          <option value="">— Selecionar —</option>
          <option value="Liberado exceção">Liberado exceção</option>
          <option value="Exceção parcial">Exceção parcial</option>
        </select>
      </td>
      <td className="px-4 py-3 text-sm">
        <input
          type="text"
          value={dados.observacao}
          onChange={(e) => onUpdate(cardTitle, "observacao", e.target.value)}
          placeholder="Observação..."
          className="bg-secondary border border-border rounded-md px-2.5 py-1 text-xs text-foreground outline-none min-w-[180px] w-full focus:border-primary transition-colors"
        />
      </td>
    </>
  );
}

interface OverviewPageProps {
  phase9Cards: PipefyCard[];
  phase10Cards: PipefyCard[];
  phase5Cards: PipefyCard[];
  entradasHoje: TodayResult | null;
  concluidosHoje: TodayResult | null;
  todayLoading: boolean;
  stage2Loading: boolean;
  stage2Duration: number | null;
  tablesLoading?: boolean;
}


type SortDir = "asc" | "desc";
interface SortState {
  key: string;
  dir: SortDir;
}

function DaysCell({ days }: { days: number }) {
  const color =
    days <= 7
      ? "text-success"
      : days <= 14
      ? "text-warning"
      : "text-destructive";
  return <span className={`font-mono font-medium ${color}`}>{days}</span>;
}

function TruncatedCell({ text }: { text: string }) {
  if (!text) return <span className="text-muted-foreground">—</span>;
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span className="block max-w-[200px] truncate cursor-default">{text}</span>
      </TooltipTrigger>
      <TooltipContent className="max-w-sm whitespace-pre-wrap text-xs">
        {text}
      </TooltipContent>
    </Tooltip>
  );
}

function SortableHeader({
  label,
  sortKey,
  sort,
  onSort,
}: {
  label: string;
  sortKey: string;
  sort: SortState;
  onSort: (key: string) => void;
}) {
  const active = sort.key === sortKey;
  return (
    <th
      className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider cursor-pointer select-none hover:text-foreground transition-colors"
      onClick={() => onSort(sortKey)}
    >
      <span className="inline-flex items-center gap-1">
        {label}
        <ArrowUpDown className={`w-3 h-3 ${active ? "text-primary" : "text-muted-foreground/40"}`} />
      </span>
    </th>
  );
}

export function OverviewPage({ phase9Cards, phase10Cards, phase5Cards, entradasHoje, concluidosHoje, todayLoading, stage2Loading, stage2Duration, tablesLoading }: OverviewPageProps) {
  const pipe1Cards = useMemo(() => [...phase9Cards, ...phase10Cards], [phase9Cards, phase10Cards]);

  const [search1, setSearch1] = useState("");
  const [search2, setSearch2] = useState("");
  const [sort1, setSort1] = useState<SortState>({ key: "days", dir: "desc" });
  const [sort2, setSort2] = useState<SortState>({ key: "title", dir: "asc" });
  const [excecoesMapa, setExcecoesMapa] = useState<Record<string, ExcecaoData>>({});

  // Load exceções from Supabase on mount
  useEffect(() => {
    lerTodasExcecoesSupabase().then(setExcecoesMapa);
  }, []);

  const handleExcecaoUpdate = useCallback((imovelId: string, campo: "excecao" | "observacao", valor: string) => {
    setExcecoesMapa((prev) => {
      const atual = prev[imovelId] ?? { excecao: "", observacao: "" };
      const novo = { ...atual, [campo]: valor };
      salvarExcecaoSupabase(imovelId, novo.excecao, novo.observacao);
      return { ...prev, [imovelId]: novo };
    });
  }, []);

  const toggleSort = (setter: React.Dispatch<React.SetStateAction<SortState>>) => (key: string) => {
    setter((prev) =>
      prev.key === key ? { key, dir: prev.dir === "asc" ? "desc" : "asc" } : { key, dir: "asc" }
    );
  };

  // Stats
  const avgDays = (cards: PipefyCard[]) => {
    if (!cards.length) return 0;
    return Math.round((cards.reduce((s, c) => s + getDaysInPhase(c), 0) / cards.length) * 10) / 10;
  };

  const simpleStats = [
    { label: "Ativos não Finalizados", value: pipe1Cards.length },
    { label: "Total Fase 5", value: phase5Cards.length },
    { label: "Lead time - Não finalizados", value: avgDays(pipe1Cards) },
  ];

  // Filtered & sorted pipe1
  const filteredPipe1 = useMemo(() => {
    let cards = pipe1Cards.filter(
      (c) =>
        c.title.toLowerCase().includes(search1.toLowerCase()) ||
        getField(c, "Anfitrião escolhido").toLowerCase().includes(search1.toLowerCase())
    );
    cards.sort((a, b) => {
      const dir = sort1.dir === "asc" ? 1 : -1;
      switch (sort1.key) {
        case "title": return a.title.localeCompare(b.title) * dir;
        case "phase": return a.current_phase.name.localeCompare(b.current_phase.name) * dir;
        case "host": return getField(a, "Anfitrião escolhido").localeCompare(getField(b, "Anfitrião escolhido")) * dir;
        case "days": return (getDaysInPhase(a) - getDaysInPhase(b)) * dir;
        default: return 0;
      }
    });
    return cards;
  }, [pipe1Cards, search1, sort1]);

  // Filtered & sorted pipe2
  const filteredPipe2 = useMemo(() => {
    let cards = phase5Cards.filter((c) => c.title.toLowerCase().includes(search2.toLowerCase()));
    cards.sort((a, b) => {
      const dir = sort2.dir === "asc" ? 1 : -1;
      switch (sort2.key) {
        case "title": return a.title.localeCompare(b.title) * dir;
        case "validacao": return getField(a, "Validação Enxoval").localeCompare(getField(b, "Validação Enxoval")) * dir;
        case "itens": return getField(a, "Itens faltantes atualmente").localeCompare(getField(b, "Itens faltantes atualmente")) * dir;
        case "manutencoes": return getField(a, "Manutenções pendentes atualmente").localeCompare(getField(b, "Manutenções pendentes atualmente")) * dir;
        default: return 0;
      }
    });
    return cards;
  }, [phase5Cards, search2, sort2]);

  return (
    <div className="space-y-8">
      {/* Summary Cards */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        {simpleStats.map((s) => (
          <div key={s.label} className="bg-card border border-border rounded-lg p-4">
            <p className="text-xs text-muted-foreground mb-1">{s.label}</p>
            <p className="text-2xl font-mono font-bold text-foreground">{s.value}</p>
          </div>
        ))}

        {/* Ativos hoje + Finalizados hoje wrapper */}
        <div className="col-span-2 space-y-1.5">
          {/* Duration label or loading indicator */}
          <div className="h-4 flex items-center gap-1.5">
            {stage2Loading ? (
              <>
                <RefreshCw className="w-3 h-3 animate-spin text-muted-foreground" />
                <span className="text-[11px] text-muted-foreground">Atualizando dados completos…</span>
              </>
            ) : stage2Duration !== null ? (
              <span className="text-[11px] text-muted-foreground">
                Atualizado em {stage2Duration >= 60 ? `${Math.floor(stage2Duration / 60)}m ${stage2Duration % 60}s` : `${stage2Duration}s`}
              </span>
            ) : null}
          </div>

          <div className="grid grid-cols-2 gap-4">
            {/* Ativos hoje */}
            <div className="bg-card border border-border rounded-lg p-4">
              <div className="flex items-center gap-1.5 mb-1">
                <p className="text-xs text-muted-foreground">Ativos hoje</p>
                {stage2Loading && <RefreshCw className="w-3 h-3 animate-spin text-muted-foreground/60" />}
              </div>
              {todayLoading && !entradasHoje ? (
                <Loader2 className="w-5 h-5 animate-spin text-primary mt-1" />
              ) : entradasHoje && entradasHoje.count > 0 ? (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <p className="text-2xl font-mono font-bold text-foreground cursor-default">{entradasHoje.count}</p>
                  </TooltipTrigger>
                  <TooltipContent className="max-w-xs max-h-64 overflow-y-auto text-xs whitespace-pre-wrap">
                    {entradasHoje.titles.join("\n")}
                  </TooltipContent>
                </Tooltip>
              ) : (
                <p className="text-2xl font-mono font-bold text-foreground">{entradasHoje?.count ?? "—"}</p>
              )}
            </div>

            {/* Finalizados hoje */}
            <div className="bg-card border border-border rounded-lg p-4">
              <div className="flex items-center gap-1.5 mb-1">
                <p className="text-xs text-muted-foreground">Finalizados hoje</p>
                {stage2Loading && <RefreshCw className="w-3 h-3 animate-spin text-muted-foreground/60" />}
              </div>
              {todayLoading && !concluidosHoje ? (
                <Loader2 className="w-5 h-5 animate-spin text-primary mt-1" />
              ) : concluidosHoje && concluidosHoje.count > 0 ? (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <p className="text-2xl font-mono font-bold text-foreground cursor-default">{concluidosHoje.count}</p>
                  </TooltipTrigger>
                  <TooltipContent className="max-w-xs max-h-64 overflow-y-auto text-xs whitespace-pre-wrap">
                    {concluidosHoje.titles.join("\n")}
                  </TooltipContent>
                </Tooltip>
              ) : (
                <p className="text-2xl font-mono font-bold text-foreground">{concluidosHoje?.count ?? "—"}</p>
              )}
            </div>
          </div>
        </div>
      </div>

      {tablesLoading ? (
        <div className="flex flex-col items-center justify-center py-16 gap-3">
          <Loader2 className="w-6 h-6 animate-spin text-primary" />
          <p className="text-sm text-muted-foreground">Carregando tabelas...</p>
        </div>
      ) : (
      <>
      {/* Pipe 1 Table */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h3 style={{ fontSize: "var(--text-base)", fontWeight: "var(--font-weight-bold)" }}>Pipe 1 — Fases 9 e 10</h3>
          <div className="relative w-64">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              placeholder="Buscar imóvel ou anfitrião..."
              value={search1}
              onChange={(e) => setSearch1(e.target.value)}
              className="pl-9 bg-secondary border-border text-sm"
            />
          </div>
        </div>
        <div className="bg-card border border-border rounded-xl overflow-hidden" style={{ boxShadow: "var(--elevation-sm)" }}>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-secondary/50">
                <tr>
                  <SortableHeader label="Imóvel" sortKey="title" sort={sort1} onSort={toggleSort(setSort1)} />
                  <SortableHeader label="Fase" sortKey="phase" sort={sort1} onSort={toggleSort(setSort1)} />
                  <SortableHeader label="Anfitrião" sortKey="host" sort={sort1} onSort={toggleSort(setSort1)} />
                  <SortableHeader label="Dias na Fase" sortKey="days" sort={sort1} onSort={toggleSort(setSort1)} />
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {filteredPipe1.map((card) => (
                  <tr key={card.id} className="hover:bg-secondary/30 transition-colors">
                    <td className="px-4 py-3 text-sm font-medium">{card.title}</td>
                    <td className="px-4 py-3 text-sm text-muted-foreground">{card.current_phase.name}</td>
                    <td className="px-4 py-3 text-sm">{getField(card, "Anfitrião escolhido") || "—"}</td>
                    <td className="px-4 py-3 text-sm"><DaysCell days={getDaysInPhase(card)} /></td>
                  </tr>
                ))}
                {filteredPipe1.length === 0 && (
                  <tr><td colSpan={4} className="px-4 py-8 text-center text-muted-foreground text-sm">Nenhum card encontrado.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* Pipe 2 Table */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h3 style={{ fontSize: "var(--text-base)", fontWeight: "var(--font-weight-bold)" }}>Pipe 2 — Fase 5</h3>
          <div className="relative w-64">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              placeholder="Buscar imóvel..."
              value={search2}
              onChange={(e) => setSearch2(e.target.value)}
              className="pl-9 bg-secondary border-border text-sm"
            />
          </div>
        </div>
        <div className="bg-card border border-border rounded-xl overflow-hidden" style={{ boxShadow: "var(--elevation-sm)" }}>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-secondary/50">
                <tr>
                  <SortableHeader label="Imóvel" sortKey="title" sort={sort2} onSort={toggleSort(setSort2)} />
                  <SortableHeader label="Validação Enxoval" sortKey="validacao" sort={sort2} onSort={toggleSort(setSort2)} />
                  <SortableHeader label="Itens Faltantes" sortKey="itens" sort={sort2} onSort={toggleSort(setSort2)} />
                  <SortableHeader label="Manutenções Pendentes" sortKey="manutencoes" sort={sort2} onSort={toggleSort(setSort2)} />
                  <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider min-w-[150px]">Exceção</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider min-w-[200px]">Observação</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {filteredPipe2.map((card) => (
                  <tr key={card.id} className="hover:bg-secondary/30 transition-colors">
                    <td className="px-4 py-3 text-sm font-medium">{card.title}</td>
                    <td className="px-4 py-3 text-sm"><TruncatedCell text={getField(card, "Validação Enxoval")} /></td>
                    <td className="px-4 py-3 text-sm"><TruncatedCell text={getField(card, "Itens faltantes atualmente")} /></td>
                    <td className="px-4 py-3 text-sm"><TruncatedCell text={getField(card, "Manutenções pendentes atualmente")} /></td>
                    <ExcecaoRow cardTitle={card.title} excecoesMapa={excecoesMapa} onUpdate={handleExcecaoUpdate} />
                  </tr>
                ))}
                {filteredPipe2.length === 0 && (
                  <tr><td colSpan={6} className="px-4 py-8 text-center text-muted-foreground text-sm">Nenhum card encontrado.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
      </>
      )}
    </div>
  );
}
