import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export default function OrdersPage() {
  return (
    <div className="flex-1 space-y-4 p-4 md:p-8 pt-6">
      <div className="flex items-center justify-between space-y-2">
        <h1 className="text-3xl font-bold tracking-tight font-headline">Pedidos</h1>
      </div>
      <Card>
        <CardHeader>
          <CardTitle>Gerenciamento de Pedidos de Produção</CardTitle>
          <CardDescription>
            Funcionalidade de pedidos a ser implementada aqui.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <p>Esta página irá mostrar a listagem de pedidos, detalhes, cronograma de fabricação e documentos.</p>
        </CardContent>
      </Card>
    </div>
  );
}
