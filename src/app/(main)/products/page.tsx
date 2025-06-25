
"use client";

import { useState, useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { collection, getDocs, setDoc, doc, deleteDoc } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { PlusCircle, Search, Pencil, Trash2 } from "lucide-react";
import { useAuth } from "../layout";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { Skeleton } from "@/components/ui/skeleton";
import { ScrollArea } from "@/components/ui/scroll-area";

const productSchema = z.object({
  code: z.string().min(1, { message: "O código do produto é obrigatório." }),
  description: z.string().min(3, { message: "A descrição é obrigatória." }),
  unitPrice: z.coerce.number().min(0, { message: "O preço unitário deve ser um número positivo." }),
  unitWeight: z.coerce.number().min(0).optional(),
  taxRate: z.coerce.number().min(0).max(100).optional(),
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
  const { toast } = useToast();
  const { user, loading: authLoading } = useAuth();

  const form = useForm<z.infer<typeof productSchema>>({
    resolver: zodResolver(productSchema),
    defaultValues: {
      code: "",
      description: "",
      unitPrice: 0,
      unitWeight: 0,
      taxRate: 0,
    },
  });

  const fetchProducts = async () => {
    if (!user) return;
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
  };

  useEffect(() => {
    if (!authLoading && user) {
      fetchProducts();
    }
  }, [user, authLoading]);

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
    form.reset({ code: "", description: "", unitPrice: 0, unitWeight: 0, taxRate: 0 });
    setIsFormOpen(true);
  };
  
  const handleEditClick = (product: Product) => {
    setSelectedProduct(product);
    form.reset(product);
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
          <h1 className="text-3xl font-bold tracking-tight font-headline">Catálogo de Produtos</h1>
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
                 <Button onClick={handleAddClick}>
                    <PlusCircle className="mr-2 h-4 w-4" />
                    Adicionar Produto
                 </Button>
            </div>
        </div>
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
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
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
                     <FormField control={form.control} name="taxRate" render={({ field }) => (
                        <FormItem>
                            <FormLabel>Imposto (%)</FormLabel>
                            <FormControl><Input type="number" placeholder="0.00" {...field} value={field.value ?? ''} /></FormControl>
                            <FormMessage />
                        </FormItem>
                    )} />
                </div>
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
