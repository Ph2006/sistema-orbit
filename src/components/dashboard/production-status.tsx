import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";

const StatusIndicator = ({ color, label }: { color: string; label: string }) => (
    <div className="flex items-center">
      <span className={`h-3 w-3 rounded-full ${color} mr-2`}></span>
      <span>{label}</span>
    </div>
  );

export function ProductionStatus() {

  const stages = [
    { name: "Corte", value: 90, status: "bg-green-500" },
    { name: "Solda", value: 75, status: "bg-green-500" },
    { name: "Usinagem", value: 50, status: "bg-yellow-500" },
    { name: "Montagem", value: 20, status: "bg-red-500" },
  ];

  return (
    <Card className="h-full hover:shadow-lg transition-shadow duration-300">
        <CardHeader>
            <CardTitle className="font-headline">Status da Produção</CardTitle>
            <CardDescription>Visão geral da fábrica em tempo real</CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
            <div>
                <h3 className="text-sm font-medium mb-2">Pedidos</h3>
                <div className="flex justify-between text-center">
                    <div>
                        <p className="text-2xl font-bold text-primary">42</p>
                        <p className="text-xs text-muted-foreground">Em Produção</p>
                    </div>
                    <div>
                        <p className="text-2xl font-bold">15</p>
                        <p className="text-xs text-muted-foreground">Finalizados</p>
                    </div>
                    <div>
                        <p className="text-2xl font-bold text-destructive">3</p>
                        <p className="text-xs text-muted-foreground">Parados</p>
                    </div>
                </div>
            </div>

            <Separator />

            <div>
                <h3 className="text-sm font-medium mb-4">Andamento por Etapa</h3>
                <div className="space-y-4">
                    {stages.map((stage) => (
                    <div key={stage.name}>
                        <div className="flex justify-between mb-1">
                        <span className="text-sm font-medium">{stage.name}</span>
                        <span className="text-sm text-muted-foreground">{stage.value}%</span>
                        </div>
                        <div className="w-full bg-muted rounded-full h-2.5">
                            <div className={`${stage.status} h-2.5 rounded-full`} style={{ width: `${stage.value}%` }}></div>
                        </div>
                    </div>
                    ))}
                </div>
            </div>

            <Separator />

            <div>
                <h3 className="text-sm font-medium mb-3">Status Geral</h3>
                <div className="flex justify-around">
                    <StatusIndicator color="bg-green-500" label="Normal" />
                    <StatusIndicator color="bg-yellow-500" label="Atenção" />
                    <StatusIndicator color="bg-red-500" label="Crítico" />
                </div>
            </div>
        </CardContent>
    </Card>
  );
}
