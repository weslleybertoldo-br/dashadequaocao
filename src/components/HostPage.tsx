import { useState, useMemo } from "react";
import { PipefyCard, getField, getDaysInPhase } from "@/lib/pipefy";
import { Input } from "@/components/ui/input";
import { Search, ArrowUpDown } from "lucide-react";
import { Button } from "@/components/ui/button";

interface HostPageProps {
  phase9Cards: PipefyCard[];
  phase10Cards: PipefyCard[];
}

interface HostData {
  name: string;
  cards: PipefyCard[];
  avgDays: number;
  phase9Count: number;
  phase10Count: number;
}

type SortKey = "name" | "total" | "avgDays" | "phase9" | "phase10";
type SortDir = "asc" | "desc";

export function HostPage({ phase9Cards, phase10Cards }: HostPageProps) {
  const [search, setSearch] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("total");
  const [sortDir, setSortDir] = useState<SortDir>("desc");

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir("desc");
    }
  };

  const hosts = useMemo(() => {
    const allCards = [...phase9Cards, ...phase10Cards];
    const map = new Map<string, PipefyCard[]>();

    allCards.forEach((card) => {
      const host = getField(card, "Anfitrião escolhido") || "Sem Anfitrião";
      if (!map.has(host)) map.set(host, []);
      map.get(host)!.push(card);
    });

    const hostList: HostData[] = Array.from(map.entries()).map(([name, cards]) => ({
      name,
      cards,
      avgDays: Math.round((cards.reduce((s, c) => s + getDaysInPhase(c), 0) / cards.length) * 10) / 10,
      phase9Count: cards.filter((c) => phase9Cards.includes(c)).length,
      phase10Count: cards.filter((c) => phase10Cards.includes(c)).length,
    }));

    return hostList;
  }, [phase9Cards, phase10Cards]);

  const filtered = useMemo(() => {
    const list = hosts.filter((h) => h.name.toLowerCase().includes(search.toLowerCase()));
    const mul = sortDir === "asc" ? 1 : -1;
    list.sort((a, b) => {
      switch (sortKey) {
        case "name": return mul * a.name.localeCompare(b.name);
        case "total": return mul * (a.cards.length - b.cards.length);
        case "avgDays": return mul * (a.avgDays - b.avgDays);
        case "phase9": return mul * (a.phase9Count - b.phase9Count);
        case "phase10": return mul * (a.phase10Count - b.phase10Count);
        default: return 0;
      }
    });
    return list;
  }, [hosts, search, sortKey, sortDir]);

  const getInitials = (name: string) =>
    name
      .split(" ")
      .slice(0, 2)
      .map((w) => w[0])
      .join("")
      .toUpperCase();

  const SortBtn = ({ label, k }: { label: string; k: SortKey }) => (
    <Button
      variant="ghost"
      size="sm"
      onClick={() => toggleSort(k)}
      className={`gap-1 text-xs h-7 px-2 ${sortKey === k ? "text-primary" : "text-muted-foreground"}`}
    >
      {label}
      <ArrowUpDown className="w-3 h-3" />
      {sortKey === k && <span className="text-[10px]">{sortDir === "asc" ? "↑" : "↓"}</span>}
    </Button>
  );

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-display font-bold">Por Anfitrião</h2>
        <div className="relative w-72">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="Buscar anfitrião..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9 bg-secondary border-border text-sm"
          />
        </div>
      </div>

      {/* Sort buttons */}
      <div className="flex items-center gap-1 flex-wrap">
        <span className="text-xs text-muted-foreground mr-1">Ordenar:</span>
        <SortBtn label="Nome" k="name" />
        <SortBtn label="Total" k="total" />
        <SortBtn label="Média Dias" k="avgDays" />
        <SortBtn label="Fase 9" k="phase9" />
        <SortBtn label="Fase 10" k="phase10" />
      </div>

      <div className="space-y-2">
        {filtered.map((host) => (
          <div
            key={host.name}
            className="flex items-center gap-4 bg-card border border-border rounded-lg px-5 py-4 hover:bg-secondary/30 transition-colors"
          >
            {/* Avatar */}
            <div className="w-10 h-10 rounded-full bg-primary/20 flex items-center justify-center text-primary font-display font-bold text-sm shrink-0">
              {getInitials(host.name)}
            </div>

            {/* Name */}
            <div className="flex-1 min-w-0">
              <p className="font-medium text-sm truncate">{host.name}</p>
            </div>

            {/* Stats boxes */}
            <div className="flex items-center gap-3">
              <div className="bg-secondary rounded-md px-3 py-1.5 text-center min-w-[80px]">
                <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Total Cards</p>
                <p className="text-lg font-mono font-bold">{host.cards.length}</p>
              </div>
              <div className="bg-secondary rounded-md px-3 py-1.5 text-center min-w-[80px]">
                <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Média Dias</p>
                <p className="text-lg font-mono font-bold">{host.avgDays}</p>
              </div>
            </div>

            {/* Phase tags */}
            <div className="flex items-center gap-2">
              {host.phase9Count > 0 && (
                <span className="inline-flex items-center gap-1 bg-warning/15 text-warning text-xs font-medium px-2.5 py-1 rounded-full">
                  Fase 9: {host.phase9Count}
                </span>
              )}
              {host.phase10Count > 0 && (
                <span className="inline-flex items-center gap-1 bg-destructive/15 text-destructive text-xs font-medium px-2.5 py-1 rounded-full">
                  Fase 10: {host.phase10Count}
                </span>
              )}
            </div>
          </div>
        ))}

        {filtered.length === 0 && (
          <div className="text-center text-muted-foreground py-12 text-sm">
            Nenhum anfitrião encontrado.
          </div>
        )}
      </div>
    </div>
  );
}
