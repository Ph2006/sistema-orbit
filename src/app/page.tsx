import Link from "next/link";
import { OrbitLogo } from "@/components/logo";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export default function LoginPage() {
  return (
    <main className="flex items-center justify-center min-h-screen bg-background p-4">
      <div className="absolute inset-0 -z-10 h-full w-full bg-background bg-[radial-gradient(theme(colors.border)_1px,transparent_1px)] [background-size:16px_16px]"></div>
      <Card className="w-full max-w-md mx-auto shadow-2xl animate-in fade-in-50 zoom-in-95 duration-500 bg-card/95 backdrop-blur-sm">
        <CardHeader className="text-center">
          <div className="flex justify-center mb-4">
            <OrbitLogo className="h-16 w-16" />
          </div>
          <CardTitle className="text-3xl font-headline text-primary">Sistema OrbIT</CardTitle>
          <CardDescription className="text-lg">
            Monitoramento de produção inteligente
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form className="space-y-6">
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input id="email" type="email" placeholder="seu@email.com" required />
            </div>
            <div className="space-y-2">
              <Label htmlFor="password">Senha</Label>
              <Input id="password" type="password" required placeholder="********" />
            </div>
            <Button asChild className="w-full text-lg h-12 mt-4 font-bold">
              <Link href="/dashboard">Entrar</Link>
            </Button>
          </form>
        </CardContent>
      </Card>
      
      {/* Indicador de versão para verificar deploy */}
      <div className="fixed bottom-2 right-2 text-xs text-muted-foreground bg-background/80 px-2 py-1 rounded">
        v2025.07.01-deploy
      </div>
    </main>
  );
}
