import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export default function QualityPage() {
  return (
    <div className="flex-1 space-y-4 p-4 md:p-8 pt-6">
      <div className="flex items-center justify-between space-y-2">
        <h1 className="text-3xl font-bold tracking-tight font-headline">Controle de Qualidade</h1>
      </div>
      <Card>
        <CardHeader>
          <CardTitle>Gestão da Qualidade</CardTitle>
          <CardDescription>
            Funcionalidade de controle de qualidade a ser implementada aqui.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <p>Esta página irá conter relatórios de qualidade, procedimentos, lições aprendidas e gestão de não conformidades.</p>
        </CardContent>
      </Card>
    </div>
  );
}
