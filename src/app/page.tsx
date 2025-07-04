"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { OrbitLogo } from "@/components/logo";
import { loginUser } from "@/lib/auth";
import { Eye, EyeOff, Shield, Zap, Monitor } from "lucide-react";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [mounted, setMounted] = useState(false);
  const router = useRouter();
  const { toast } = useToast();

  useEffect(() => {
    setMounted(true);
  }, []);

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
      await loginUser(email, password);
      router.push("/dashboard");
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
    <main className="relative flex items-center justify-center min-h-screen bg-gradient-to-br from-slate-900 via-blue-900 to-indigo-900 p-4 overflow-hidden">
      {/* Animated background elements */}
      <div className="absolute inset-0 overflow-hidden">
        <div className="absolute -top-40 -right-40 w-80 h-80 bg-blue-500/10 rounded-full blur-3xl animate-pulse"></div>
        <div className="absolute -bottom-40 -left-40 w-80 h-80 bg-indigo-500/10 rounded-full blur-3xl animate-pulse delay-1000"></div>
        <div className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 w-96 h-96 bg-cyan-500/5 rounded-full blur-3xl animate-pulse delay-500"></div>
      </div>

      {/* Grid pattern overlay */}
      <div className="absolute inset-0 bg-[linear-gradient(rgba(59,130,246,0.03)_1px,transparent_1px),linear-gradient(90deg,rgba(59,130,246,0.03)_1px,transparent_1px)] bg-[size:50px_50px]"></div>

      {/* Floating particles */}
      {mounted && (
        <div className="absolute inset-0 overflow-hidden pointer-events-none">
          {[...Array(20)].map((_, i) => (
            <div
              key={i}
              className="absolute w-1 h-1 bg-blue-400/20 rounded-full animate-pulse"
              style={{
                left: `${Math.random() * 100}%`,
                top: `${Math.random() * 100}%`,
                animationDelay: `${Math.random() * 3}s`,
                animationDuration: `${2 + Math.random() * 2}s`,
              }}
            />
          ))}
        </div>
      )}

      <div className="relative z-10 w-full max-w-md mx-auto">
        {/* Main login card */}
        <Card className="shadow-2xl border-0 bg-white/5 backdrop-blur-xl animate-in fade-in-50 zoom-in-95 duration-700">
          <CardHeader className="text-center space-y-6 pb-8">
            <div className="flex justify-center">
              <div className="relative">
                <div className="absolute inset-0 bg-gradient-to-r from-blue-400 to-cyan-400 rounded-full blur-lg opacity-75 animate-pulse"></div>
                <OrbitLogo className="relative h-20 w-20 text-white drop-shadow-xl" />
              </div>
            </div>
            <div className="space-y-2">
              <CardTitle className="text-4xl font-bold bg-gradient-to-r from-blue-200 to-cyan-200 bg-clip-text text-transparent">
                Sistema OrbIT
              </CardTitle>
              <CardDescription className="text-blue-100/80 text-lg font-medium">
                Monitoramento de produção inteligente
              </CardDescription>
            </div>
          </CardHeader>

          <CardContent className="space-y-6">
            <form onSubmit={handleLogin} className="space-y-6">
              <div className="space-y-3">
                <Label htmlFor="email" className="text-blue-100 font-medium">
                  Email
                </Label>
                <div className="relative">
                  <Input 
                    id="email" 
                    type="email" 
                    placeholder="seu@email.com" 
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required 
                    disabled={isLoading}
                    className="bg-white/10 border-white/20 text-white placeholder:text-blue-200/50 focus:border-blue-400 focus:ring-blue-400/50 h-12 transition-all duration-300"
                  />
                  <div className="absolute inset-0 rounded-md bg-gradient-to-r from-blue-400/20 to-cyan-400/20 opacity-0 transition-opacity duration-300 hover:opacity-100 pointer-events-none"></div>
                </div>
              </div>

              <div className="space-y-3">
                <Label htmlFor="password" className="text-blue-100 font-medium">
                  Senha
                </Label>
                <div className="relative">
                  <Input 
                    id="password" 
                    type={showPassword ? "text" : "password"}
                    placeholder="********"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required 
                    disabled={isLoading}
                    className="bg-white/10 border-white/20 text-white placeholder:text-blue-200/50 focus:border-blue-400 focus:ring-blue-400/50 h-12 pr-12 transition-all duration-300"
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="absolute right-0 top-0 h-full px-3 py-2 hover:bg-white/10 text-blue-200 hover:text-white transition-colors"
                    onClick={() => setShowPassword(!showPassword)}
                  >
                    {showPassword ? (
                      <EyeOff className="h-4 w-4" />
                    ) : (
                      <Eye className="h-4 w-4" />
                    )}
                  </Button>
                  <div className="absolute inset-0 rounded-md bg-gradient-to-r from-blue-400/20 to-cyan-400/20 opacity-0 transition-opacity duration-300 hover:opacity-100 pointer-events-none"></div>
                </div>
              </div>

              <Button 
                type="submit" 
                className="w-full text-lg h-14 mt-8 font-bold bg-gradient-to-r from-blue-500 to-cyan-500 hover:from-blue-600 hover:to-cyan-600 text-white border-0 shadow-lg hover:shadow-xl transition-all duration-300 transform hover:scale-[1.02]"
                disabled={isLoading}
              >
                {isLoading ? (
                  <div className="flex items-center space-x-2">
                    <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
                    <span>Acessando Sistema...</span>
                  </div>
                ) : (
                  <div className="flex items-center space-x-2">
                    <Zap className="w-5 h-5" />
                    <span>Acessar Sistema</span>
                  </div>
                )}
              </Button>
            </form>

            {/* Feature highlights */}
            <div className="grid grid-cols-3 gap-4 pt-6 border-t border-white/10">
              <div className="text-center space-y-2">
                <Shield className="w-6 h-6 mx-auto text-blue-300" />
                <p className="text-xs text-blue-200/70 font-medium">Seguro</p>
              </div>
              <div className="text-center space-y-2">
                <Monitor className="w-6 h-6 mx-auto text-cyan-300" />
                <p className="text-xs text-blue-200/70 font-medium">Inteligente</p>
              </div>
              <div className="text-center space-y-2">
                <Zap className="w-6 h-6 mx-auto text-indigo-300" />
                <p className="text-xs text-blue-200/70 font-medium">Rápido</p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Footer with credits */}
        <div className="mt-8 text-center space-y-2">
          <p className="text-blue-200/60 text-sm font-medium">
            © 2025 Sistema OrbIT — Versão 1.0 — Todos os direitos reservados.
          </p>
          <p className="text-blue-300/80 text-sm">
            Desenvolvido por <span className="font-semibold bg-gradient-to-r from-blue-200 to-cyan-200 bg-clip-text text-transparent">Paulo Henrique Nascimento Ribeiro</span>
          </p>
        </div>
      </div>
    </main>
  );
}
