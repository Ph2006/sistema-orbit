"use client";

import { createContext, useContext, useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { onAuthStateChanged, User } from "firebase/auth";
import { auth } from "@/lib/firebase";
import { Sidebar, SidebarContent, SidebarHeader, SidebarMenu, SidebarMenuButton, SidebarMenuItem, SidebarProvider, SidebarFooter, SidebarInset } from "@/components/ui/sidebar";
import { OrbitLogo } from "@/components/logo";
import Link from "next/link";
import { LayoutDashboard, Package, Users, ClipboardCheck, Building, Wrench, DollarSign, FileText, LogOut, ShoppingCart, TrendingUp } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { AlertTriangle } from "lucide-react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { logoutUser } from "@/lib/auth";
import { useToast } from "@/hooks/use-toast";
import { SidebarTrigger } from "@/components/ui/sidebar";

const AuthContext = createContext<{
  user: User | null;
  loading: boolean;
  error: string | null;
}>({
  user: null,
  loading: true,
  error: null,
});

export const useAuth = () => useContext(AuthContext);

const navItems = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/products", label: "Produtos", icon: ShoppingCart }, // ADICIONADO
  { href: "/orders", label: "Pedidos", icon: Package },
  { href: "/customers", label: "Clientes", icon: Users },
  { href: "/quality", label: "Qualidade", icon: ClipboardCheck },
  { href: "/materials", label: "Materiais", icon: Wrench },
  { href: "/costs", label: "Custos", icon: DollarSign },
  { href: "/quotations", label: "Orçamentos", icon: FileText },
  { href: "/finance", label: "Financeiro", icon: TrendingUp }, // ADICIONADO
  { href: "/company", label: "Empresa", icon: Building },
];

function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
      setLoading(true);
      setError(null);
      
      if (currentUser) {
        // Verificar se é um usuário real (não anônimo)
        if (currentUser.isAnonymous) {
          setError("Acesso não autorizado. Por favor, faça login com suas credenciais.");
          setUser(null);
          router.push('/');
        } else {
          setUser(currentUser);
        }
      } else {
        setUser(null);
        router.push('/');
      }
      
      setLoading(false);
    });
    
    return () => unsubscribe();
  }, [router]);

  return (
    <AuthContext.Provider value={{ user, loading, error }}>
      {children}
    </AuthContext.Provider>
  )
}

function LogoutButton() {
  const { toast } = useToast();
  const router = useRouter();

  const handleLogout = async () => {
    try {
      await logoutUser();
      router.push('/');
      toast({
        title: "Logout realizado com sucesso",
      });
    } catch (error) {
      toast({
        variant: "destructive",
        title: "Erro ao fazer logout",
      });
    }
  };

  return (
    <Button 
      variant="ghost" 
      onClick={handleLogout}
      className="w-full justify-start text-red-600 hover:text-red-700 hover:bg-red-50"
    >
      <LogOut className="mr-2 h-4 w-4" />
      Sair
    </Button>
  );
}

function AuthWrapper({ children, pathname }: { children: React.ReactNode; pathname: string; }) {
  const { error, loading, user } = useAuth();

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-background">
        <div className="text-center space-y-4">
          <OrbitLogo className="w-24 h-24 mx-auto animate-pulse" />
          <p className="text-muted-foreground">Carregando...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <main className="flex items-center justify-center min-h-screen bg-background p-4">
        <Card className="w-full max-w-lg mx-auto shadow-2xl">
          <CardHeader className="text-center">
            <div className="flex justify-center mb-4">
              <AlertTriangle className="h-16 w-16 text-destructive" />
            </div>
            <CardTitle className="text-2xl font-headline text-destructive">Erro de Autenticação</CardTitle>
          </CardHeader>
          <CardContent className="text-center space-y-4">
            <p className="text-muted-foreground">
              {error}
            </p>
            <Button onClick={() => window.location.href = '/'}>
              Ir para Login
            </Button>
          </CardContent>
        </Card>
      </main>
    );
  }

  if (!user) {
    return null; // Redirecionamento já foi feito no AuthProvider
  }

  return (
    <SidebarProvider>
      <Sidebar>
        <SidebarHeader>
          <div className="flex items-center gap-2">
            <OrbitLogo className="w-8 h-8" />
            <div>
              <h1 className="text-xl font-headline font-semibold text-primary">
                Sistema OrbIT
              </h1>
              <p className="text-xs text-muted-foreground">
                {user.email}
              </p>
            </div>
          </div>
        </SidebarHeader>
        <SidebarContent>
          <SidebarMenu>
            {navItems.map((item) => (
              <SidebarMenuItem key={item.href}>
                <SidebarMenuButton
                  asChild
                  isActive={pathname === item.href}
                  tooltip={{ children: item.label }}
                >
                  <Link href={item.href}>
                    <item.icon />
                    <span>{item.label}</span>
                  </Link>
                </SidebarMenuButton>
              </SidebarMenuItem>
            ))}
            <SidebarMenuItem>
              <LogoutButton />
            </SidebarMenuItem>
          </SidebarMenu>
        </SidebarContent>
        <SidebarFooter className="mt-auto p-4 text-center text-xs text-muted-foreground group-data-[collapsible=icon]:hidden">
          <p>© 2025 Sistema OrbIT — Versão 1.0 — Todos os direitos reservados.</p>
          <p className="mt-2">Desenvolvido por Paulo Henrique Nascimento Ribeiro.</p>
        </SidebarFooter>
      </Sidebar>
      <SidebarInset>
        <header className="flex items-center justify-start p-2 border-b">
          <SidebarTrigger />
        </header>
        {children}
      </SidebarInset>
    </SidebarProvider>
  );
}

export default function MainLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();

  return (
    <AuthProvider>
      <AuthWrapper pathname={pathname}>
        {children}
      </AuthWrapper>
    </AuthProvider>
  );
}
