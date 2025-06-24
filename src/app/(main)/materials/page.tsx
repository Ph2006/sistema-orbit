import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export default function MaterialsPage() {
  return (
    <div className="flex-1 space-y-4 p-4 md:p-8 pt-6">
      <div className="flex items-center justify-between space-y-2">
        <h1 className="text-3xl font-bold tracking-tight font-headline">Requisição de Materiais</h1>
      </div>
      <Card>
        <CardHeader>
          <CardTitle>Requisição e Plano de Corte</CardTitle>
          <CardDescription>
            Funcionalidade de requisição de materiais a ser implementada aqui.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <p>Esta página irá conter o sistema de requisição de matéria-prima por item e o plano de corte otimizado.</p>
        </CardContent>
      </Card>
    </div>
  );
}
