import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export default function CustomersPage() {
  return (
    <div className="flex-1 space-y-4 p-4 md:p-8 pt-6">
      <div className="flex items-center justify-between space-y-2">
        <h1 className="text-3xl font-bold tracking-tight font-headline">Clientes</h1>
      </div>
      <Card>
        <CardHeader>
          <CardTitle>Cadastro de Clientes</CardTitle>
          <CardDescription>
            Funcionalidade de cadastro de clientes a ser implementada aqui.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <p>Esta página irá conter o formulário completo para registro e gerenciamento de clientes, conforme especificado na proposta.</p>
        </CardContent>
      </Card>
    </div>
  );
}
