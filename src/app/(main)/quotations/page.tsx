import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export default function QuotationsPage() {
  return (
    <div className="flex-1 space-y-4 p-4 md:p-8 pt-6">
      <div className="flex items-center justify-between space-y-2">
        <h1 className="text-3xl font-bold tracking-tight font-headline">Orçamentos</h1>
      </div>
      <Card>
        <CardHeader>
          <CardTitle>Criação e Gestão de Orçamentos</CardTitle>
          <CardDescription>
            Funcionalidade de orçamentos a ser implementada aqui.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <p>Esta página permitirá a criação de orçamentos detalhados, com itens, preços, condições comerciais e outras funcionalidades.</p>
        </CardContent>
      </Card>
    </div>
  );
}
