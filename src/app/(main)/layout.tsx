"use client"
import React, { useEffect, useState, createContext, useContext } from "react";
import { signInAnonymously, onAuthStateChanged, type User } from "firebase/auth";
import { auth } from "@/lib/firebase";
import {
  SidebarProvider,
  Sidebar,
  SidebarHeader,
  SidebarContent,
  SidebarMenu,
  SidebarMenuItem,
  SidebarMenuButton,
  SidebarInset,
  SidebarTrigger,
} from "@/components/ui/sidebar";
import { OrbitLogo } from "@/components/logo";
import {
  Banknote,
  Building2,
  Construction,
  DollarSign,
  FileText,
  LayoutDashboard,
  ShieldCheck,
  ShoppingCart,
  Users,
} from "lucide-react";
import Link from "next/link";
import { usePathname } from 'next/navigation';

const navItems = [
  { href: "/dashboard", icon: LayoutDashboard, label: "Dashboard" },
  { href: "/customers", icon: Users, label: "Clientes" },
  { href: "/company", icon: Building2, label: "Empresa" },
  { href: "/quotations", icon: FileText, label: "Orçamentos" },
  { href: "/orders", icon: ShoppingCart, label: "Pedidos" },
  { href: "/materials", icon: Construction, label: "Requisição de Materiais" },
  { href: "/costs", icon: DollarSign, label: "Centro de Custos" },
  { href: "/quality", icon: ShieldCheck, label: "Controle de Qualidade" },
  { href: "/finance", icon: Banknote, label: "Financeiro" },
];

interface AuthContextType {
  user: User | null;
  loading: boolean;
}

const AuthContext = createContext<AuthContextType>({ user: null, loading: true });

export const useAuth = () => useContext(AuthContext);

function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
      setLoading(true);
      if (currentUser) {
        setUser(currentUser);
      } else {
        try {
          const userCredential = await signInAnonymously(auth);
          setUser(userCredential.user);
        } catch (error) {
          console.error("Error signing in anonymously on state change:", error);
          setUser(null);
        }
      }
      setLoading(false);
    });
    return () => unsubscribe();
  }, []);

  return (
    <AuthContext.Provider value={{ user, loading }}>
      {children}
    </AuthContext.Provider>
  )
}

export default function MainLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();

  return (
    <AuthProvider>
      <SidebarProvider>
        <Sidebar>
          <SidebarHeader>
            <div className="flex items-center gap-2">
              <OrbitLogo className="w-8 h-8" />
              <h1 className="text-xl font-headline font-semibold text-primary">
                Orbit System
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
        </Sidebar>
        <SidebarInset>
          <header className="flex items-center justify-start p-2 border-b">
              <SidebarTrigger />
          </header>
          {children}
        </SidebarInset>
      </SidebarProvider>
    </AuthProvider>
  );
}
