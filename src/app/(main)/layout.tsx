"use client";

import React, { useEffect, useState, createContext, useContext } from "react";
import { onAuthStateChanged, type User } from "firebase/auth";
import { auth } from "@/lib/firebase";
import { getDevUser, isDevMode, clearDevUser } from "@/lib/dev-auth";
import {
  SidebarProvider,
  Sidebar,
  SidebarHeader,
  SidebarContent,
  SidebarFooter,
  SidebarMenu,
  SidebarMenuItem,
  SidebarMenuButton,
  SidebarInset,
  SidebarTrigger,
} from "@/components/ui/sidebar";
import { OrbitLogo } from "@/components/logo";
import {
  AlertTriangle,
  Banknote,
  Building2,
  Construction,
  DollarSign,
  FileText,
  LayoutDashboard,
  ListTodo,
  Package,
  ShieldCheck,
  ShoppingCart,
  Users,
  LogOut,
} from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from 'next/navigation';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { logoutUser } from "@/lib/auth";
import { useToast } from "@/hooks/use-toast";

const navItems = [
  { href: "/dashboard", icon: LayoutDashboard, label: "Dashboard" },
  { href: "/customers", icon: Users, label: "Clientes" },
  { href: "/company", icon: Building2, label: "Empresa" },
  { href: "/quotations", icon: FileText, label: "Orçamentos" },
  { href: "/orders", icon: ShoppingCart, label: "Pedidos" },
  { href: "/tasks", icon: ListTodo, label: "Tarefas Diárias" },
  { href: "/products", icon: Package, label: "Produtos" },
  { href: "/materials", icon: Construction, label: "Requisição de Materiais" },
  { href: "/costs", icon: DollarSign, label: "Centro de Custos" },
  { href: "/quality", icon: ShieldCheck, label: "Controle de Qualidade" },
  { href: "/finance", icon: Banknote, label: "Financeiro" },
];

interface AuthContextType {
  user: User | null;
  loading: boolean;
  error: string | null;
}

const AuthContext = createContext<AuthContextType>({ user: null, loading: true, error: null });

export const useAuth = () => useContext(AuthContext);

function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  useEffect(() => {
    setLoading(true);
    
    // In development mode, check for dev user first
    if (isDevMode()) {
      console.log('Checking for development user...');
      const devUser = getDevUser();
      if (devUser) {
        console.log('Development user found:', devUser);
        setUser(devUser as User);
        setLoading(false);
        return;
      } else {
        console.log('No development user found');
      }
    }

    const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
      console.log('Firebase auth state changed:', currentUser);
      setError(null);
      
      if (currentUser) {
        // In development mode, allow anonymous users for demo purposes
        if (currentUser.isAnonymous && isDevMode()) {
          console.log('Usuário anônimo autorizado para demonstração');
          setUser(currentUser);
        } else if (currentUser.isAnonymous) {
          setError("Acesso não autorizado. Por favor, faça login com suas credenciais.");
          setUser(null);
          router.push('/');
        } else {
          setUser(currentUser);
        }
      } else {
        // Check for dev user again before redirecting
        if (isDevMode()) {
          const devUser = getDevUser();
          if (devUser) {
            setUser(devUser as User);
            setLoading(false);
            return;
          }
        }
        
        // Se não há usuário, redirecionar para login
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
      
      // Force reload to clear state completely
      if (isDevMode()) {
        window.location.href = '/';
      } else {
        router.push('/');
      }
      
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

  // Se não há usuário autenticado, não renderiza nada (redirecionamento já foi feito)
  if (!user) {
    return null;
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
                {user.email || 'Usuário Demo'}
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
