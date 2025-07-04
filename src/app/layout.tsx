"use client";

import type { Metadata } from "next";
import { useEffect } from "react";
import { useRouter, usePathname } from "next/navigation";
import "./globals.css";
import { Toaster } from "@/components/ui/toaster";
import { getDevUser, isDevMode } from "@/lib/dev-auth";

function DevAuthChecker() {
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    if (isDevMode() && pathname !== '/') {
      console.log('Checking for development user on protected route...');
      const devUser = getDevUser();
      if (!devUser) {
        console.log('No development user found, redirecting to login');
        router.push('/');
      } else {
        console.log('Development user found, allowing access');
      }
    }
  }, [router, pathname]);

  return null;
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="pt-BR">
      <head>
        <title>Sistema OrbIT</title>
        <meta name="description" content="Monitoramento de produção inteligente" />
      </head>
      <body className="antialiased">
        <DevAuthChecker />
        {children}
        <Toaster />
      </body>
    </html>
  );
}
