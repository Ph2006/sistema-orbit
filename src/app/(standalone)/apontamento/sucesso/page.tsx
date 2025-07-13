"use client";

import React from "react";
import { useRouter } from "next/navigation";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { CheckCircle, ArrowLeft, Home } from "lucide-react";
import { format } from "date-fns";
import { OrbitLogo } from "@/components/logo";

export default function AppointmentSuccessPage() {
  const router = useRouter();

  return (
    <div className="min-h-screen bg-gradient-to-br from-green-50 to-emerald-100 flex items-center justify-center p-4">
      <Card className="w-full max-w-md text-center">
        <CardHeader>
          <OrbitLogo className="h-12 w-12 mx-auto mb-4 text-green-600" />
          <div className="mx-auto w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mb-4">
            <CheckCircle className="h-8 w-8 text-green-600" />
          </div>
          <CardTitle className="text-green-800">Apontamento Registrado!</CardTitle>
          <CardDescription>
            Sua atividade foi registrada com sucesso no Sistema OrbIT.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="text-sm text-muted-foreground">
            <p>Data/Hora: {format(new Date(), "dd/MM/yyyy 'às' HH:mm")}</p>
          </div>
          <Separator />
          <div className="space-y-2">
            <Button
              onClick={() => router.push('/orders')}
              className="w-full"
            >
              <Home className="mr-2 h-4 w-4" />
              Acessar Sistema
            </Button>
            <Button
              variant="outline"
              onClick={() => router.back()}
              className="w-full"
            >
              <ArrowLeft className="mr-2 h-4 w-4" />
              Voltar
            </Button>
            <Button
              variant="ghost"
              onClick={() => window.close()}
              className="w-full text-xs"
            >
              Fechar Aba
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
