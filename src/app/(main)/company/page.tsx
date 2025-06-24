
"use client";

import { useState, useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { doc, getDoc, setDoc } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useAuth } from "../layout";
import Image from "next/image";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { Skeleton } from "@/components/ui/skeleton";

const companySchema = z.object({
  nomeFantasia: z.string().min(3, "O nome fantasia é obrigatório."),
  cnpj: z.string().min(14, "O CNPJ deve ser válido."),
  inscricaoEstadual: z.string().optional(),
  email: z.string().email("O e-mail é inválido."),
  celular: z.string().min(10, "O celular deve ser válido."),
  endereco: z.string().min(10, "O endereço é obrigatório."),
});

type CompanyData = z.infer<typeof companySchema> & { logo?: { preview?: string } };

export default function CompanyPage() {
  const [isLoading, setIsLoading] = useState(true);
  const [logoPreview, setLogoPreview] = useState<string | null>(null);
  const { user, loading: authLoading } = useAuth();
  const { toast } = useToast();

  const form = useForm<z.infer<typeof companySchema>>({
    resolver: zodResolver(companySchema),
    defaultValues: {
      nomeFantasia: "",
      cnpj: "",
      inscricaoEstadual: "",
      email: "",
      celular: "",
      endereco: "",
    },
  });

  const fetchCompanyData = async () => {
    if (!user) return;
    setIsLoading(true);
    try {
      const companyRef = doc(db, "companies", "mecald", "settings", "company");
      const docSnap = await getDoc(companyRef);

      if (docSnap.exists()) {
        const data = docSnap.data() as CompanyData;
        form.reset(data);
        if (data.logo?.preview) {
          setLogoPreview(data.logo.preview);
        }
      } else {
        toast({
          variant: "destructive",
          title: "Documento não encontrado",
          description: "Não foi possível encontrar os dados da empresa no Firestore.",
        });
      }
    } catch (error) {
      console.error("Error fetching company data:", error);
      toast({
        variant: "destructive",
        title: "Erro ao buscar dados",
        description: "Ocorreu um erro ao carregar as informações da empresa.",
      });
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (!authLoading && user) {
      fetchCompanyData();
    }
  }, [user, authLoading]);

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        setLogoPreview(reader.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  const onSubmit = async (values: z.infer<typeof companySchema>) => {
    if (!user) {
        toast({
            variant: "destructive",
            title: "Erro de Autenticação",
            description: "Você precisa estar logado para salvar as alterações.",
        });
        return;
    }
    try {
      const companyRef = doc(db, "companies", "mecald", "settings", "company");
      const dataToSave = {
        ...values,
        logo: {
          preview: logoPreview,
        },
      };
      await setDoc(companyRef, dataToSave, { merge: true });
      toast({
        title: "Dados atualizados!",
        description: "As informações da empresa foram salvas com sucesso.",
      });
    } catch (error) {
      console.error("Error saving company data: ", error);
      toast({
        variant: "destructive",
        title: "Erro ao salvar",
        description: "Ocorreu um erro ao salvar os dados. Tente novamente.",
      });
    }
  };
  
  if (isLoading || authLoading) {
    return (
      <div className="flex-1 space-y-4 p-4 md:p-8 pt-6">
        <Skeleton className="h-10 w-1/3" />
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8 pt-4">
            <div className="md:col-span-1 space-y-4">
                <Skeleton className="h-8 w-1/4" />
                <Skeleton className="aspect-square w-full rounded-md" />
                <Skeleton className="h-10 w-full" />
            </div>
            <div className="md:col-span-2">
                <Skeleton className="h-96 w-full" />
            </div>
        </div>
      </div>
    )
  }

  return (
    <div className="flex-1 space-y-4 p-4 md:p-8 pt-6">
      <div className="flex items-center justify-between space-y-2">
        <h1 className="text-3xl font-bold tracking-tight font-headline">Dados da Empresa</h1>
      </div>
      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-8">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
            <div className="lg:col-span-1 flex flex-col items-center text-center">
              <h3 className="text-lg font-medium mb-4">Logotipo da Empresa</h3>
              <Card className="w-full max-w-xs aspect-square flex items-center justify-center overflow-hidden mb-4">
                <Image
                  src={logoPreview || "https://placehold.co/300x300.png"}
                  alt="Logotipo da empresa"
                  width={300}
                  height={300}
                  className="object-contain"
                  data-ai-hint="logo"
                />
              </Card>
              <FormControl>
                <Input 
                  type="file" 
                  accept="image/*" 
                  onChange={handleFileChange} 
                  className="cursor-pointer"
                />
              </FormControl>
            </div>

            <div className="lg:col-span-2">
              <Card>
                <CardHeader>
                  <CardTitle>Informações de Contato e Fiscais</CardTitle>
                  <CardDescription>
                    Mantenha os dados da sua empresa sempre atualizados.
                  </CardDescription>
                </CardHeader>
                <CardContent className="grid gap-6">
                  <FormField
                    control={form.control}
                    name="nomeFantasia"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Nome Fantasia</FormLabel>
                        <FormControl>
                          <Input placeholder="Nome comercial da empresa" {...field} value={field.value ?? ''} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <div className="grid md:grid-cols-2 gap-6">
                    <FormField
                      control={form.control}
                      name="cnpj"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>CNPJ</FormLabel>
                          <FormControl>
                            <Input placeholder="00.000.000/0000-00" {...field} value={field.value ?? ''} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name="inscricaoEstadual"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Inscrição Estadual</FormLabel>
                          <FormControl>
                            <Input placeholder="Opcional" {...field} value={field.value ?? ''} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>
                  <div className="grid md:grid-cols-2 gap-6">
                     <FormField
                        control={form.control}
                        name="email"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>E-mail</FormLabel>
                            <FormControl>
                              <Input type="email" placeholder="contato@suaempresa.com" {...field} value={field.value ?? ''} />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      <FormField
                        control={form.control}
                        name="celular"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Celular / WhatsApp</FormLabel>
                            <FormControl>
                              <Input placeholder="(XX) XXXXX-XXXX" {...field} value={field.value ?? ''} />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                  </div>
                  <FormField
                    control={form.control}
                    name="endereco"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Endereço Completo</FormLabel>
                        <FormControl>
                          <Textarea
                            placeholder="Rua, Número, Bairro, Cidade - Estado, CEP"
                            className="min-h-[100px]"
                            {...field}
                            value={field.value ?? ''}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </CardContent>
              </Card>
            </div>
          </div>
          <div className="flex justify-end pt-4">
            <Button type="submit" size="lg" disabled={form.formState.isSubmitting}>
              {form.formState.isSubmitting ? "Salvando..." : "Salvar Alterações"}
            </Button>
          </div>
        </form>
      </Form>
    </div>
  );
}
