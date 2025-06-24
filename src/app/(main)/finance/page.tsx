import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export default function FinancePage() {
  return (
    <div className="flex-1 space-y-4 p-4 md:p-8 pt-6">
      <div className="flex items-center justify-between space-y-2">
        <h1 className="text-3xl font-bold tracking-tight font-headline">Financeiro</h1>
      </div>
      <Card>
        <CardHeader>
          <CardTitle>Controle Financeiro por Pedido</CardTitle>
          <CardDescription>
            Funcionalidade de controle financeiro a ser implementada aqui.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <p>Esta página irá consolidar o valor de venda, custos e lucro de cada pedido, com acesso restrito.</p>
        </CardContent>
      </Card>
    </div>
  );
}
