
"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { collection, getDocs, setDoc, doc, deleteDoc, writeBatch, Timestamp, updateDoc, arrayUnion, arrayRemove, getDoc } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { PlusCircle, Search, Pencil, Trash2, RefreshCw } from "lucide-react";
import { useAuth } from "../layout";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Checkbox } from "@/components/ui/checkbox";
import { Separator } from "@/components/ui/separator";

const productSchema = z.object({
  code: z.string().min(1, { message: "O código do produto é obrigatório." }),
  description: z.string().min(3, { message: "A descrição é obrigatória." }),
  unitPrice: z.coerce.number().min(0, { message: "O preço unitário deve ser um número positivo." }),
  unitWeight: z.coerce.number().min(0).optional(),
  manufacturingStages: z.array(z.string()).optional(),
});

type Product = z.infer<typeof productSchema> & { id: string };

export default function ProductsPage() {
  const [products, setProducts] = useState<Product[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [productToDelete, setProductToDelete] = useState<Product | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [isSyncing, setIsSyncing] = useState(false);
  
  const [manufacturingStages, setManufacturingStages] = useState<string[]>([]);
  const [isLoadingStages, setIsLoadingStages] = useState(true);
  const [newStageName, setNewStageName] = useState("");
  const [activeTab, setActiveTab] = useState("catalog");

  const { toast } = useToast();
  const { user, loading: authLoading } = useAuth();

  const form = useForm<z.infer<typeof productSchema>>({
    resolver: zodResolver(productSchema),
    defaultValues: {
      code: "",
      description: "",
      unitPrice: 0,
      unitWeight: 0,
      manufacturingStages: [],
    },
  });

  const stagesDocRef = useMemo(() => doc(db, "companies", "mecald", "settings", "manufacturingStages"), []);

  const fetchStages = useCallback(async () => {
    setIsLoadingStages(true);
    try {
        const docSnap = await getDoc(stagesDocRef);
        if (docSnap.exists() && Array.isArray(docSnap.data().stages)) {
            setManufacturingStages(docSnap.data().stages);
        } else {
            setManufacturingStages([]);
        }
    } catch (error) {
        console.error("Error fetching manufacturing stages:", error);
        toast({ variant: "destructive", title: "Erro ao buscar etapas" });
        setManufacturingStages([]);
    } finally {
        setIsLoadingStages(false);
    }
  }, [stagesDocRef, toast]);

  const handleAddStage = useCallback(async () => {
    const stageToAdd = newStageName.trim();
    if (!stageToAdd) {
        toast({
            variant: "destructive",
            title: "Campo vazio",
            description: "Por favor, digite o nome da etapa para adicionar.",
        });
        return;
    }
    try {
      await setDoc(stagesDocRef, {
        stages: arrayUnion(stageToAdd)
      }, { merge: true });
      
      setNewStageName("");
      toast({ title: "Etapa adicionada!" });
      await fetchStages();
    } catch (error) {
      console.error("Error adding stage:", error);
      toast({ variant: "destructive", title: "Erro ao adicionar etapa" });
    }
  }, [newStageName, stagesDocRef, fetchStages, toast]);

  const handleDeleteStage = useCallback(async (stageToDelete: string) => {
    try {
      await updateDoc(stagesDocRef, {
        stages: arrayRemove(stageToDelete)
      });
      toast({ title: "Etapa removida!" });
      await fetchStages();
    } catch (error) {
      console.error("Error deleting stage:", error);
      toast({ variant: "destructive", title: "Erro ao remover etapa" });
    }
  }, [stagesDocRef, fetchStages, toast]);

  const fetchProducts = useCallback(async () => {
    setIsLoading(true);
    try {
      const querySnapshot = await getDocs(collection(db, "companies", "mecald", "products"));
      const productsList = querySnapshot.docs.map((doc) => ({
        id: doc.id,
        ...(doc.data() as Omit<Product, 'id'>),
      }));
      setProducts(productsList);
    } catch (error) {
      console.error("Error fetching products: ", error);
      toast({
        variant: "destructive",
        title: "Erro ao buscar produtos",
        description: "Ocorreu um erro ao carregar o catálogo de produtos.",
      });
    } finally {
      setIsLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    if (!authLoading && user) {
      fetchProducts();
      fetchStages();
    }
  }, [user, authLoading, fetchProducts, fetchStages]);
  
  const syncProductsFromQuotations = useCallback(async () => {
    setIsSyncing(true);
    toast({ title: "Sincronizando...", description: "Buscando produtos em orçamentos existentes." });
    
    try {
        const quotationsSnapshot = await getDocs(collection(db, "companies", "mecald", "quotations"));
        const productsToSync = new Map<string, any>();

        quotationsSnapshot.forEach((quotationDoc) => {
            const quotationData = quotationDoc.data();
            if (Array.isArray(quotationData.items)) {
                quotationData.items.forEach((item: any) => {
                    if (item.code && typeof item.code === 'string' && item.code.trim() !== "") {
                        const productData = {
                            code: item.code.trim(),
                            description: item.description || "Sem descrição",
                            unitPrice: Number(item.unitPrice) || 0,
                            unitWeight: Number(item.unitWeight) || 0,
                        };
                        productsToSync.set(productData.code, productData);
                    }
                });
            }
        });
        
        if (productsToSync.size === 0) {
            toast({ title: "Nenhum produto novo encontrado", description: "Seu catálogo já parece estar atualizado." });
            setIsSyncing(false);
            return;
        }

        const batch = writeBatch(db);
        const productsCollectionRef = collection(db, "companies", "mecald", "products");

        productsToSync.forEach((productData, productCode) => {
            const productRef = doc(productsCollectionRef, productCode);
            batch.set(productRef, { ...productData, updatedAt: Timestamp.now() }, { merge: true });
        });

        await batch.commit();

        toast({ title: "Sincronização Concluída!", description: `${productsToSync.size} produtos foram adicionados ou atualizados.` });
        await fetchProducts();

    } catch (error) {
        console.error("Error syncing products from quotations: ", error);
        toast({
            variant: "destructive",
            title: "Erro na Sincronização",
            description: "Não foi possível sincronizar os produtos. Verifique o console.",
        });
    } finally {
        setIsSyncing(false);
    }
  }, [toast, fetchProducts]);

  const onSubmit = async (values: z.infer<typeof productSchema>) => {
    try {
      const productRef = doc(db, "companies", "mecald", "products", values.code);
      
      if (selectedProduct && selectedProduct.id !== values.code) {
        await deleteDoc(doc(db, "companies", "mecald", "products", selectedProduct.id));
      }
      
      await setDoc(productRef, values, { merge: true });

      toast({
        title: selectedProduct ? "Produto atualizado!" : "Produto adicionado!",
        description: `O produto "${values.description}" foi salvo com sucesso.`,
      });

      form.reset();
      setIsFormOpen(false);
      setSelectedProduct(null);
      await fetchProducts();
    } catch (error) {
      console.error("Error saving product: ", error);
      toast({
        variant: "destructive",
        title: "Erro ao salvar produto",
        description: "Ocorreu um erro ao salvar os dados. Tente novamente.",
      });
    }
  };
  
  const handleAddClick = () => {
    setSelectedProduct(null);
    form.reset({ code: "", description: "", unitPrice: 0, unitWeight: 0, manufacturingStages: [] });
    setIsFormOpen(true);
  };
  
  const handleEditClick = (product: Product) => {
    setSelectedProduct(product);
    form.reset({
      ...product,
      manufacturingStages: product.manufacturingStages || []
    });
    setIsFormOpen(true);
  };
  
  const handleDeleteClick = (product: Product) => {
    setProductToDelete(product);
    setIsDeleteDialogOpen(true);
  };

  const handleConfirmDelete = async () => {
    if (!productToDelete) return;
    try {
      await deleteDoc(doc(db, "companies", "mecald", "products", productToDelete.id));
      toast({ title: "Produto excluído!", description: "O produto foi removido do catálogo." });
      setProductToDelete(null);
      setIsDeleteDialogOpen(false);
      await fetchProducts();
    } catch (error) {
      console.error("Error deleting product: ", error);
      toast({
        variant: "destructive",
        title: "Erro ao excluir",
        description: "Não foi possível remover o produto. Tente novamente.",
      });
    }
  };
  
  const filteredProducts = products.filter((product) => {
    const query = searchQuery.toLowerCase();
    return (
      product.code.toLowerCase().includes(query) ||
      product.description.toLowerCase().includes(query)
    );
  });

  return (
    <>
      <div className="flex-1 space-y-4 p-4 md:p-8 pt-6">
        <div className="flex items-center justify-between space-y-2">
          <h1 className="text-3xl font-bold tracking-tight font-headline">Produtos e Etapas</h1>
            <div className="flex items-center gap-2">
                 <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input
                        placeholder="Buscar por código ou descrição..."
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        className="pl-9 w-64"
                    />
                 </div>
                 <Button onClick={syncProductsFromQuotations} variant="outline" disabled={isSyncing}>
                    <RefreshCw className={`mr-2 h-4 w-4 ${isSyncing ? 'animate-spin' : ''}`} />
                    {isSyncing ? "Sincronizando..." : "Sincronizar Catálogo"}
                 </Button>
                 <Button onClick={handleAddClick}>
                    <PlusCircle className="mr-2 h-4 w-4" />
                    Adicionar Produto
                 </Button>
            </div>
        </div>

        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
            <TabsList>
                <TabsTrigger value="catalog">Catálogo de Produtos</TabsTrigger>
                <TabsTrigger value="stages">Etapas de Fabricação</TabsTrigger>
            </TabsList>
            <TabsContent value="catalog" className="mt-4">
                <Card>
                    <CardHeader>
                        <CardTitle>Produtos Cadastrados</CardTitle>
                        <CardDescription>
                        Gerencie os produtos e serviços que sua empresa oferece.
                        </CardDescription>
                    </CardHeader>
                    <CardContent>
                        {isLoading ? (
                        <div className="space-y-4 p-4">
                            <Skeleton className="h-10 w-full" />
                            <Skeleton className="h-10 w-full" />
                            <Skeleton className="h-10 w-full" />
                        </div>
                        ) : (
                            <Table>
                            <TableHeader>
                                <TableRow>
                                <TableHead className="w-[200px]">Código</TableHead>
                                <TableHead>Descrição</TableHead>
                                <TableHead className="w-[180px] text-right">Preço Unitário (R$)</TableHead>
                                <TableHead className="w-[100px] text-center">Ações</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {filteredProducts.length > 0 ? (
                                filteredProducts.map((product) => (
                                    <TableRow key={product.id}>
                                    <TableCell className="font-mono">{product.code}</TableCell>
                                    <TableCell className="font-medium">{product.description}</TableCell>
                                    <TableCell className="text-right">{product.unitPrice.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</TableCell>
                                    <TableCell className="text-center">
                                        <div className="flex items-center justify-center gap-2">
                                            <Button variant="ghost" size="icon" onClick={() => handleEditClick(product)}>
                                                <Pencil className="h-4 w-4" />
                                                <span className="sr-only">Editar</span>
                                            </Button>
                                            <Button variant="ghost" size="icon" className="text-destructive hover:text-destructive" onClick={() => handleDeleteClick(product)}>
                                                <Trash2 className="h-4 w-4" />
                                                <span className="sr-only">Excluir</span>
                                            </Button>
                                        </div>
                                    </TableCell>
                                    </TableRow>
                                ))
                                ) : (
                                <TableRow>
                                    <TableCell colSpan={4} className="text-center h-24">
                                    Nenhum produto encontrado.
                                    </TableCell>
                                </TableRow>
                                )}
                            </TableBody>
                            </Table>
                        )}
                    </CardContent>
                </Card>
            </TabsContent>
            <TabsContent value="stages" className="mt-4">
                <Card>
                    <CardHeader>
                        <CardTitle>Etapas de Fabricação</CardTitle>
                        <CardDescription>
                            Cadastre e gerencie as etapas do seu processo produtivo. Elas serão usadas para planejar o lead time dos produtos.
                        </CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-6">
                        <div className="flex items-center gap-2">
                            <Input 
                                placeholder="Nome da nova etapa (ex: Solda, Pintura)"
                                value={newStageName}
                                onChange={(e) => setNewStageName(e.target.value)}
                            />
                            <Button onClick={handleAddStage}>
                                <PlusCircle className="mr-2 h-4 w-4" />
                                Adicionar Etapa
                            </Button>
                        </div>
                        <Separator />
                        {isLoadingStages ? (
                            <Skeleton className="h-24 w-full" />
                        ) : (
                            <div>
                                <h3 className="text-sm font-medium text-muted-foreground mb-4">ETAPAS CADASTRADAS</h3>
                                {manufacturingStages.length > 0 ? (
                                    <div className="space-y-2">
                                    {manufacturingStages.map((stage) => (
                                        <div key={stage} className="flex items-center justify-between rounded-md border p-3">
                                            <p className="font-medium">{stage}</p>
                                            <Button variant="ghost" size="icon" className="text-destructive hover:text-destructive" onClick={() => handleDeleteStage(stage)}>
                                                <Trash2 className="h-4 w-4" />
                                                <span className="sr-only">Excluir etapa {stage}</span>
                                            </Button>
                                        </div>
                                    ))}
                                    </div>
                                ) : (
                                    <p className="text-center text-muted-foreground py-4">Nenhuma etapa cadastrada.</p>
                                )}
                            </div>
                        )}
                    </CardContent>
                </Card>
            </TabsContent>
        </Tabs>
      </div>

      <Dialog open={isFormOpen} onOpenChange={setIsFormOpen}>
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>{selectedProduct ? "Editar Produto" : "Adicionar Novo Produto"}</DialogTitle>
            <DialogDescription>
              {selectedProduct ? "Altere os dados do produto." : "Preencha os campos para cadastrar um novo produto."}
            </DialogDescription>
          </DialogHeader>
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4 pt-4">
                <FormField control={form.control} name="code" render={({ field }) => (
                    <FormItem>
                        <FormLabel>Código do Produto</FormLabel>
                        <FormControl><Input placeholder="Ex: PROD-001" {...field} disabled={!!selectedProduct} /></FormControl>
                        <FormMessage />
                    </FormItem>
                )} />
                 <FormField control={form.control} name="description" render={({ field }) => (
                    <FormItem>
                        <FormLabel>Descrição</FormLabel>
                        <FormControl><Textarea placeholder="Descrição detalhada do produto ou serviço" {...field} /></FormControl>
                        <FormMessage />
                    </FormItem>
                )} />
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <FormField control={form.control} name="unitPrice" render={({ field }) => (
                        <FormItem>
                            <FormLabel>Preço Unitário (R$)</FormLabel>
                            <FormControl><Input type="number" placeholder="0.00" {...field} /></FormControl>
                            <FormMessage />
                        </FormItem>
                    )} />
                     <FormField control={form.control} name="unitWeight" render={({ field }) => (
                        <FormItem>
                            <FormLabel>Peso Unit. (kg)</FormLabel>
                            <FormControl><Input type="number" placeholder="0.00" {...field} value={field.value ?? ''} /></FormControl>
                            <FormMessage />
                        </FormItem>
                    )} />
                </div>
                
                <Separator />

                <FormField
                    control={form.control}
                    name="manufacturingStages"
                    render={() => (
                        <FormItem>
                            <div className="mb-4">
                                <FormLabel className="text-base">Etapas de Fabricação</FormLabel>
                                <FormDescription>
                                    Selecione as etapas que este produto normalmente percorre.
                                </FormDescription>
                            </div>
                            <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                                {manufacturingStages.map((stage) => (
                                    <FormField
                                        key={stage}
                                        control={form.control}
                                        name="manufacturingStages"
                                        render={({ field }) => {
                                            return (
                                                <FormItem
                                                    key={stage}
                                                    className="flex flex-row items-start space-x-3 space-y-0"
                                                >
                                                    <FormControl>
                                                        <Checkbox
                                                            checked={field.value?.includes(stage)}
                                                            onCheckedChange={(checked) => {
                                                                return checked
                                                                    ? field.onChange([...(field.value || []), stage])
                                                                    : field.onChange(
                                                                        field.value?.filter(
                                                                            (value) => value !== stage
                                                                        )
                                                                    )
                                                            }}
                                                        />
                                                    </FormControl>
                                                    <FormLabel className="font-normal">
                                                        {stage}
                                                    </FormLabel>
                                                </FormItem>
                                            )
                                        }}
                                    />
                                ))}
                            </div>
                            <FormMessage />
                        </FormItem>
                    )}
                />

              <DialogFooter className="pt-6">
                 <Button type="submit" disabled={form.formState.isSubmitting}>
                  {form.formState.isSubmitting ? "Salvando..." : "Salvar Produto"}
                 </Button>
              </DialogFooter>
            </form>
          </Form>
        </DialogContent>
      </Dialog>
      
      <AlertDialog open={isDeleteDialogOpen} onOpenChange={setIsDeleteDialogOpen}>
        <AlertDialogContent>
            <AlertDialogHeader>
            <AlertDialogTitle>Você tem certeza?</AlertDialogTitle>
            <AlertDialogDescription>
                Esta ação não pode ser desfeita. Isso excluirá permanentemente o produto <span className="font-bold">{productToDelete?.description}</span> do catálogo.
            </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={handleConfirmDelete} className="bg-destructive hover:bg-destructive/90">
                Sim, excluir produto
            </AlertDialogAction>
            </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
