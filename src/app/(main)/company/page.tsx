import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export default function CompanyPage() {
  return (
    <div className="flex-1 space-y-4 p-4 md:p-8 pt-6">
      <div className="flex items-center justify-between space-y-2">
        <h1 className="text-3xl font-bold tracking-tight font-headline">Dados da Empresa</h1>
      </div>
      <Card>
        <CardHeader>
          <CardTitle>Informações da Empresa</CardTitle>
          <CardDescription>
            Funcionalidade de gerenciamento dos dados da empresa a ser implementada aqui.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <p>Esta página permitirá cadastrar a identidade da empresa, logotipo, equipe e outras configurações.</p>
        </CardContent>
      </Card>
    </div>
  );
}
