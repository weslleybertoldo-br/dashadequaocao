import { useState } from "react";
import { PipefyConfig, loadConfig, saveConfig } from "@/lib/pipefy";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { Save } from "lucide-react";

export function ConfigPage() {
  const [config, setConfig] = useState<PipefyConfig>(loadConfig);

  const handleSave = () => {
    saveConfig(config);
    toast.success("Configuração salva com sucesso!");
  };

  return (
    <div className="max-w-xl mx-auto space-y-8">
      <div>
        <h2 className="text-2xl font-display font-bold text-foreground mb-2">Configuração</h2>
        <p className="text-muted-foreground text-sm">Configure os IDs das fases do Pipefy. O token é gerenciado automaticamente pelo backend.</p>
      </div>

      <div className="space-y-5 bg-card p-6 rounded-lg border border-border">

        <div className="grid grid-cols-3 gap-4">
          <div className="space-y-2">
            <Label className="text-sm text-muted-foreground">ID Fase 9</Label>
            <Input
              value={config.phase9}
              onChange={(e) => setConfig({ ...config, phase9: e.target.value })}
              className="bg-secondary border-border font-mono text-sm"
            />
          </div>
          <div className="space-y-2">
            <Label className="text-sm text-muted-foreground">ID Fase 10</Label>
            <Input
              value={config.phase10}
              onChange={(e) => setConfig({ ...config, phase10: e.target.value })}
              className="bg-secondary border-border font-mono text-sm"
            />
          </div>
          <div className="space-y-2">
            <Label className="text-sm text-muted-foreground">ID Fase 5</Label>
            <Input
              value={config.phase5}
              onChange={(e) => setConfig({ ...config, phase5: e.target.value })}
              className="bg-secondary border-border font-mono text-sm"
            />
          </div>
        </div>

        <Button onClick={handleSave} className="w-full gap-2">
          <Save className="w-4 h-4" /> Salvar Configuração
        </Button>
      </div>
    </div>
  );
}
