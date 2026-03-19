import { useMemo, useState } from "react";
import { PipefyCard, getField, getDaysInPhase } from "@/lib/pipefy";
import { Input } from "@/components/ui/input";
import { Search, ArrowUpDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

interface NoAdequacaoPageProps {
  phase9Cards: PipefyCard[];
  phase10Cards: PipefyCard[];
  phase5Cards: PipefyCard[];
}

type SortKey = "title" | "phase" | "host" | "days";
type SortDir = "asc" | "desc";

function DaysCell({ days }: { days: number }) {
  const color =
    days <= 7
      ? "text-success"
      : days <= 14
      ? "text-warning"
      : "text-destructive";
  return <span className={`font-mono font-medium ${color}`}>{days}</span>;
}

export function NoAdequacaoPage({ phase9Cards, phase10Cards, phase5Cards }: NoAdequacaoPageProps) {
  const [search, setSearch] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("title");
  const [sortDir, setSortDir] = useState<SortDir>("asc");

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir("asc");
    }
  };

  const cardsWithoutAdequacao = useMemo(() => {
    const phase5Titles = new Set(phase5Cards.map((c) => c.title.trim().toUpperCase()));

    const allCards = [
      ...phase9Cards.map((c) => ({ ...c, _phase: "Fase 9" })),
      ...phase10Cards.map((c) => ({ ...c, _phase: "Fase 10" })),
    ];

    return allCards.filter((c) => !phase5Titles.has(c.title.trim().toUpperCase()));
  }, [phase9Cards, phase10Cards, phase5Cards]);

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    let items = cardsWithoutAdequacao.map((card) => ({
      title: card.title,
      phase: card._phase,
      host: getField(card, "Anfitrião") || getField(card, "Anfitriao") || "—",
      days: getDaysInPhase(card),
    }));

    if (q) {
      items = items.filter(
        (item) =>
          item.title.toLowerCase().includes(q) ||
          item.host.toLowerCase().includes(q) ||
          item.phase.toLowerCase().includes(q)
      );
    }

    items.sort((a, b) => {
      let cmp = 0;
      switch (sortKey) {
        case "title": cmp = a.title.localeCompare(b.title); break;
        case "phase": cmp = a.phase.localeCompare(b.phase); break;
        case "host": cmp = a.host.localeCompare(b.host); break;
        case "days": cmp = a.days - b.days; break;
      }
      return sortDir === "asc" ? cmp : -cmp;
    });

    return items;
  }, [cardsWithoutAdequacao, search, sortKey, sortDir]);

  const SortButton = ({ label, sortKeyVal }: { label: string; sortKeyVal: SortKey }) => (
    <Button
      variant="ghost"
      size="sm"
      className="gap-1 -ml-3 text-muted-foreground hover:text-foreground"
      onClick={() => toggleSort(sortKeyVal)}
    >
      {label}
      <ArrowUpDown className="w-3.5 h-3.5" />
    </Button>
  );

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h2 style={{ fontSize: "var(--text-md)", fontWeight: "var(--font-weight-bold)" }}>Sem Adequação</h2>
          <p className="text-sm text-muted-foreground mt-1">
            Imóveis nas Fases 9/10 sem card correspondente na Fase 5.
            Total: <span className="font-semibold text-foreground">{cardsWithoutAdequacao.length}</span>
          </p>
        </div>
        <div className="relative w-64">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="Buscar imóvel, anfitrião..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9 bg-secondary border-border"
          />
        </div>
      </div>

      <div className="bg-card border border-border rounded-lg overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow className="bg-secondary/50">
              <TableHead><SortButton label="Imóvel" sortKeyVal="title" /></TableHead>
              <TableHead><SortButton label="Fase Atual" sortKeyVal="phase" /></TableHead>
              <TableHead><SortButton label="Anfitrião" sortKeyVal="host" /></TableHead>
              <TableHead className="text-right"><SortButton label="Dias na Fase" sortKeyVal="days" /></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.length === 0 ? (
              <TableRow>
                <TableCell colSpan={4} className="text-center text-muted-foreground py-8">
                  {search ? "Nenhum resultado encontrado." : "Todos os imóveis possuem adequação."}
                </TableCell>
              </TableRow>
            ) : (
              filtered.map((item, i) => (
                <TableRow key={`${item.title}-${i}`}>
                  <TableCell className="font-medium">{item.title}</TableCell>
                  <TableCell>{item.phase}</TableCell>
                  <TableCell>{item.host}</TableCell>
                  <TableCell className="text-right"><DaysCell days={item.days} /></TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
