"use client"
import React, { useEffect, useState, createContext, useContext } from "react";
import { signInAnonymously, onAuthStateChanged, type User } from "firebase/auth";
import { auth } from "@/lib/firebase";
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
  Package,
  ShieldCheck,
  ShoppingCart,
  Users,
} from "lucide-react";
import Link from "next/link";
import { usePathname } from 'next/navigation';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

const navItems = [
  { href: "/dashboard", icon: LayoutDashboard, label: "Dashboard" },
  { href: "/customers", icon: Users, label: "Clientes" },
  { href: "/company", icon: Building2, label: "Empresa" },
  { href: "/quotations", icon: FileText, label: "Orçamentos" },
  { href: "/orders", icon: ShoppingCart, label: "Pedidos" },
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

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
      setLoading(true);
      setError(null);
      if (currentUser) {
        setUser(currentUser);
      } else {
        try {
          const userCredential = await signInAnonymously(auth);
          setUser(userCredential.user);
        } catch (err: any) {
          console.error("Error signing in anonymously on state change:", err);
          if (err.code === 'auth/admin-restricted-operation') {
            setError(
              "A autenticação anônima não está habilitada. Por favor, acesse o Console do Firebase, vá para Authentication > Sign-in method e ative o provedor 'Anônimo'."
            );
          } else {
            setError(`Ocorreu um erro de autenticação: ${err.message}`);
          }
          setUser(null);
        }
      }
      setLoading(false);
    });
    return () => unsubscribe();
  }, []);

  return (
    <AuthContext.Provider value={{ user, loading, error }}>
      {children}
    </AuthContext.Provider>
  )
}

function AuthWrapper({ children, pathname }: { children: React.ReactNode; pathname: string; }) {
  const { error, loading } = useAuth();

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-background">
        <OrbitLogo className="w-24 h-24" />
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
            <CardTitle className="text-2xl font-headline text-destructive">Erro de Configuração</CardTitle>
          </CardHeader>
          <CardContent className="text-center space-y-4">
            <p className="text-muted-foreground">
              {error}
            </p>
            <p className="text-sm">
              Após corrigir a configuração, por favor, atualize a página.
            </p>
          </CardContent>
        </Card>
      </main>
    );
  }

  return (
    <SidebarProvider>
      <Sidebar>
        <SidebarHeader>
          <div className="flex items-center gap-2">
            <OrbitLogo className="w-8 h-8" />
            <h1 className="text-xl font-headline font-semibold text-primary">
              Sistema OrbIT
            </h1>
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
