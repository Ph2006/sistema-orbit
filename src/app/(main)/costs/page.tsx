import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export default function CostsPage() {
  return (
    <div className="flex-1 space-y-4 p-4 md:p-8 pt-6">
      <div className="flex items-center justify-between space-y-2">
        <h1 className="text-3xl font-bold tracking-tight font-headline">Centro de Custos</h1>
      </div>
      <Card>
        <CardHeader>
          <CardTitle>Controle de Custos por Pedido</CardTitle>
          <CardDescription>
            Funcionalidade de centro de custos a ser implementada aqui.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <p>Esta página permitirá o controle de custos estimados vs. realizados, com lançamentos por categoria e relatórios financeiros.</p>
        </CardContent>
      </Card>
    </div>
  );
}
