import { useEffect, useState, useCallback } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { usePipefyData } from "@/hooks/usePipefyData";
import { loadConfig } from "@/lib/pipefy";
import { OverviewPage } from "@/components/OverviewPage";
import { HostPage } from "@/components/HostPage";
import { NoAdequacaoPage } from "@/components/NoAdequacaoPage";
import { KPIsPage } from "@/components/KPIsPage";
import { Loader2, AlertTriangle, RefreshCw, Clock, Settings, Sun, Moon } from "lucide-react";
import { useTheme } from "@/hooks/useTheme";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";

function getBrasiliaTime() {
  return new Date(new Date().toLocaleString("en-US", { timeZone: "America/Sao_Paulo" }));
}

function formatTime(date: Date | null) {
  if (!date) return "—";
  return date.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
}

const Index = () => {
  const { data, loading, error, fetchData, entradasHoje, concluidosHoje, todayLoading, stage2Loading, stage2Duration, snapshotReady } = usePipefyData();
  const { dark, toggle: toggleTheme } = useTheme();
  const [activeTab, setActiveTab] = useState("overview");
  const [lastUpdate, setLastUpdate] = useState<Date | null>(null);
  const [nextRefresh, setNextRefresh] = useState<string>("");
  const [showPasswordDialog, setShowPasswordDialog] = useState(false);
  const [password, setPassword] = useState("");
  const [passwordError, setPasswordError] = useState(false);
  const [hiddenUnlocked, setHiddenUnlocked] = useState(false);

  const handleUnlockHidden = () => {
    if (password === "***REDACTED_PASSWORD***") {
      setHiddenUnlocked(true);
      setShowPasswordDialog(false);
      setActiveTab("no-adequacao");
      setPassword("");
      setPasswordError(false);
    } else {
      setPasswordError(true);
    }
  };

  const handleSettingsClick = () => {
    if (hiddenUnlocked) {
      setActiveTab("no-adequacao");
    } else {
      setShowPasswordDialog(true);
      setPassword("");
      setPasswordError(false);
    }
  };

  const doRefresh = useCallback(() => {
    const config = loadConfig();
    if (config.token) {
      fetchData();
      setLastUpdate(new Date());
    }
  }, [fetchData]);

  useEffect(() => {
    doRefresh();
  }, []);

  useEffect(() => {
    const SCHEDULES = [
      { hour: 6, minute: 0 },
      { hour: 19, minute: 0 },
    ];

    const getNextSchedule = () => {
      const now = getBrasiliaTime();
      for (const s of SCHEDULES) {
        if (now.getHours() < s.hour || (now.getHours() === s.hour && now.getMinutes() < s.minute)) {
          return `${String(s.hour).padStart(2, "0")}:${String(s.minute).padStart(2, "0")}`;
        }
      }
      return `${String(SCHEDULES[0].hour).padStart(2, "0")}:${String(SCHEDULES[0].minute).padStart(2, "0")} (amanhã)`;
    };

    setNextRefresh(getNextSchedule());

    const interval = setInterval(() => {
      const now = getBrasiliaTime();
      const h = now.getHours();
      const m = now.getMinutes();

      for (const s of SCHEDULES) {
        if (h === s.hour && m === s.minute && now.getSeconds() < 5) {
          doRefresh();
          break;
        }
      }

      setNextRefresh(getNextSchedule());
    }, 4000);

    return () => clearInterval(interval);
  }, [doRefresh]);

  const handleTabChange = (value: string) => {
    setActiveTab(value);
    if (!data && !loading) {
      const config = loadConfig();
      if (config.token) doRefresh();
    }
  };

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border bg-card sticky top-0 z-50" style={{ boxShadow: "var(--elevation-sm)" }}>
        <div className="container flex items-center justify-between h-14 px-6">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-primary flex items-center justify-center">
              <span className="text-primary-foreground" style={{ fontSize: "var(--text-body)", fontWeight: "var(--font-weight-bold)" }}>S</span>
            </div>
            <span style={{ fontSize: "var(--text-base)", fontWeight: "var(--font-weight-bold)" }}>KPI Adequação - Final do Funil</span>
          </div>

          <div className="flex items-center gap-4">
            <span className="text-muted-foreground" style={{ fontSize: "var(--text-body)", fontWeight: "var(--font-weight-medium)" }}>
              by Weslley Bertoldo
            </span>
            {activeTab !== "no-adequacao" && (
              <>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <div className="flex items-center gap-1.5 text-muted-foreground" style={{ fontSize: "var(--text-sm)" }}>
                      <Clock className="w-3.5 h-3.5" />
                      <span style={{ fontFamily: "monospace" }}>
                        {lastUpdate ? formatTime(lastUpdate) : "—"}
                      </span>
                      <span className="opacity-50">|</span>
                      <span className="opacity-70">próx: {nextRefresh}</span>
                    </div>
                  </TooltipTrigger>
                  <TooltipContent>
                    <span className="detail-regular">Auto-refresh às 06:00 e 19:00 (Brasília)</span>
                  </TooltipContent>
                </Tooltip>

                <Button
                  variant="ghost"
                  size="sm"
                  onClick={doRefresh}
                  disabled={loading}
                  className="gap-2 text-muted-foreground hover:text-foreground"
                >
                  <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
                  Atualizar
                </Button>
              </>
            )}

            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={handleSettingsClick}
                  className="text-muted-foreground hover:text-foreground h-8 w-8"
                >
                  <Settings className="w-4 h-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>
                <span className="detail-regular">Sem Adequação</span>
              </TooltipContent>
            </Tooltip>
          </div>
        </div>
      </header>

      <div className="container px-6 py-6">
        <Tabs value={activeTab} onValueChange={handleTabChange}>
          <TabsList className="bg-secondary border border-border mb-6 rounded-full">
            <TabsTrigger value="overview" className="rounded-full data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">
              Visão Geral
            </TabsTrigger>
            <TabsTrigger value="hosts" className="rounded-full data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">
              Por Anfitrião
            </TabsTrigger>
            <TabsTrigger value="kpis" className="rounded-full data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">
              KPI's
            </TabsTrigger>
          </TabsList>

          <TabsContent value="overview">
            {loading && !data && !entradasHoje && !concluidosHoje && !snapshotReady && (
              <div className="flex flex-col items-center justify-center py-24 gap-3">
                <Loader2 className="w-8 h-8 animate-spin text-primary" />
                <p className="text-sm text-muted-foreground">Carregando dados do Pipefy...</p>
              </div>
            )}
            {error && !data && (
              <div className="flex flex-col items-center justify-center py-24 gap-3">
                <AlertTriangle className="w-8 h-8 text-destructive" />
                <p className="text-sm text-destructive">{error}</p>
              </div>
            )}
            {(data || entradasHoje || concluidosHoje) && (
              <OverviewPage
                phase9Cards={data?.phase9Cards ?? []}
                phase10Cards={data?.phase10Cards ?? []}
                phase5Cards={data?.phase5Cards ?? []}
                entradasHoje={entradasHoje}
                concluidosHoje={concluidosHoje}
                todayLoading={todayLoading}
                stage2Loading={stage2Loading}
                stage2Duration={stage2Duration}
                tablesLoading={loading}
              />
            )}
          </TabsContent>

          <TabsContent value="hosts">
            {loading && (
              <div className="flex flex-col items-center justify-center py-24 gap-3">
                <Loader2 className="w-8 h-8 animate-spin text-primary" />
                <p className="text-sm text-muted-foreground">Carregando dados do Pipefy...</p>
              </div>
            )}
            {error && (
              <div className="flex flex-col items-center justify-center py-24 gap-3">
                <AlertTriangle className="w-8 h-8 text-destructive" />
                <p className="text-sm text-destructive">{error}</p>
              </div>
            )}
            {data && !loading && (
              <HostPage phase9Cards={data.phase9Cards} phase10Cards={data.phase10Cards} />
            )}
          </TabsContent>

          <TabsContent value="kpis">
            <KPIsPage entradasHoje={entradasHoje} concluidosHoje={concluidosHoje} />
          </TabsContent>

          {hiddenUnlocked && (
            <TabsContent value="no-adequacao">
              {loading && (
                <div className="flex flex-col items-center justify-center py-24 gap-3">
                  <Loader2 className="w-8 h-8 animate-spin text-primary" />
                  <p className="text-sm text-muted-foreground">Carregando dados do Pipefy...</p>
                </div>
              )}
              {error && (
                <div className="flex flex-col items-center justify-center py-24 gap-3">
                  <AlertTriangle className="w-8 h-8 text-destructive" />
                  <p className="text-sm text-destructive">{error}</p>
                </div>
              )}
              {data && !loading && (
                <NoAdequacaoPage
                  phase9Cards={data.phase9Cards}
                  phase10Cards={data.phase10Cards}
                  phase5Cards={data.phase5Cards}
                />
              )}
            </TabsContent>
          )}
        </Tabs>
      </div>

      <Dialog open={showPasswordDialog} onOpenChange={setShowPasswordDialog}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Acesso Restrito</DialogTitle>
          </DialogHeader>
          <div className="space-y-2">
            <Input
              type="password"
              placeholder="Digite a senha..."
              value={password}
              onChange={(e) => { setPassword(e.target.value); setPasswordError(false); }}
              onKeyDown={(e) => e.key === "Enter" && handleUnlockHidden()}
              className={passwordError ? "border-destructive" : ""}
            />
            {passwordError && (
              <p className="text-xs text-destructive">Senha incorreta</p>
            )}
          </div>
          <DialogFooter>
            <Button onClick={handleUnlockHidden}>Entrar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default Index;
