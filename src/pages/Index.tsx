import { useEffect, useState } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { usePipefyData } from "@/hooks/usePipefyData";
import { loadConfig } from "@/lib/pipefy";
import { OverviewPage } from "@/components/OverviewPage";
import { HostPage } from "@/components/HostPage";
import { ConfigPage } from "@/components/ConfigPage";
import { Loader2, AlertTriangle, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";

const Index = () => {
  const { data, loading, error, fetchData } = usePipefyData();
  const [activeTab, setActiveTab] = useState("overview");

  useEffect(() => {
    const config = loadConfig();
    if (!config.token) {
      setActiveTab("config");
    } else {
      fetchData();
    }
  }, []);

  const handleTabChange = (value: string) => {
    setActiveTab(value);
    if (value !== "config" && !data && !loading) {
      const config = loadConfig();
      if (config.token) fetchData();
    }
  };

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b border-border bg-card/50 backdrop-blur-sm sticky top-0 z-50">
        <div className="container flex items-center justify-between h-14 px-6">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-primary flex items-center justify-center">
              <span className="text-primary-foreground font-display font-bold text-sm">S</span>
            </div>
            <h1 className="font-display font-bold text-lg tracking-tight">Seazone OPS</h1>
          </div>

          {activeTab !== "config" && (
            <Button
              variant="ghost"
              size="sm"
              onClick={fetchData}
              disabled={loading}
              className="gap-2 text-muted-foreground hover:text-foreground"
            >
              <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
              Atualizar
            </Button>
          )}
        </div>
      </header>

      {/* Content */}
      <div className="container px-6 py-6">
        <Tabs value={activeTab} onValueChange={handleTabChange}>
          <TabsList className="bg-secondary border border-border mb-6">
            <TabsTrigger value="overview" className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">
              Visão Geral
            </TabsTrigger>
            <TabsTrigger value="hosts" className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">
              Por Anfitrião
            </TabsTrigger>
            <TabsTrigger value="config" className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">
              Configuração
            </TabsTrigger>
          </TabsList>

          <TabsContent value="config">
            <ConfigPage />
          </TabsContent>

          <TabsContent value="overview">
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
                <Button variant="outline" size="sm" onClick={() => setActiveTab("config")}>
                  Ir para Configuração
                </Button>
              </div>
            )}
            {data && !loading && (
              <OverviewPage
                phase9Cards={data.phase9Cards}
                phase10Cards={data.phase10Cards}
                phase5Cards={data.phase5Cards}
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
                <Button variant="outline" size="sm" onClick={() => setActiveTab("config")}>
                  Ir para Configuração
                </Button>
              </div>
            )}
            {data && !loading && (
              <HostPage phase9Cards={data.phase9Cards} phase10Cards={data.phase10Cards} />
            )}
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
};

export default Index;
