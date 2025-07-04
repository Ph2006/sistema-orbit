"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { OrbitLogo } from "@/components/logo"; // Caminho correto
import { loginUser } from "@/lib/auth";
import { Eye, EyeOff } from "lucide-react";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const router = useRouter();
  const { toast } = useToast();

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!email || !password) {
      toast({
        variant: "destructive",
        title: "Campos obrigatórios",
        description: "Por favor, preencha email e senha",
      });
      return;
    }

    setIsLoading(true);

    try {
      const user = await loginUser(email, password);
      
      // If we got a mock user, we need to navigate manually since Firebase auth state won't change
      if (process.env.NODE_ENV === 'development' && user && localStorage.getItem('mockUser')) {
        window.location.href = '/dashboard';
      } else {
        router.push("/dashboard");
      }
      
      toast({
        title: "Login realizado com sucesso!",
        description: "Bem-vindo ao Sistema OrbIT",
      });
    } catch (error: any) {
      toast({
        variant: "destructive",
        title: "Erro no login",
        description: error.message || "Credenciais inválidas",
      });
    } finally {
      setIsLoading(false);
    }
  };

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
          <form onSubmit={handleLogin} className="space-y-6">
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input 
                id="email" 
                type="email" 
                placeholder="seu@email.com" 
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required 
                disabled={isLoading}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="password">Senha</Label>
              <div className="relative">
                <Input 
                  id="password" 
                  type={showPassword ? "text" : "password"}
                  placeholder="********"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required 
                  disabled={isLoading}
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="absolute right-0 top-0 h-full px-3 py-2 hover:bg-transparent"
                  onClick={() => setShowPassword(!showPassword)}
                >
                  {showPassword ? (
                    <EyeOff className="h-4 w-4" />
                  ) : (
                    <Eye className="h-4 w-4" />
                  )}
                </Button>
              </div>
            </div>
            <Button 
              type="submit" 
              className="w-full text-lg h-12 mt-4 font-bold"
              disabled={isLoading}
            >
              {isLoading ? "Entrando..." : "Entrar"}
            </Button>
            {process.env.NODE_ENV === 'development' && (
              <div className="text-center text-sm text-muted-foreground mt-4 p-3 bg-muted/50 rounded-md">
                <p className="font-medium">Demonstração:</p>
                <p>Use <code className="px-1 py-0.5 bg-background rounded">demo@sistema-orbit.com</code> com qualquer senha</p>
                <p>ou qualquer email em caso de erro de conexão</p>
              </div>
            )}
          </form>
        </CardContent>
      </Card>
    </main>
  );
}
