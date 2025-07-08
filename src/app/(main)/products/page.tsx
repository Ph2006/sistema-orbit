"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { collection, getDocs, setDoc, doc, deleteDoc, writeBatch, Timestamp, updateDoc, arrayUnion, arrayRemove, getDoc } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { PlusCircle, Search, Pencil, Trash2, RefreshCw, Copy, ArrowUp, ArrowDown, Clock, CalendarIcon, Download, FileText } from "lucide-react";
import { useAuth } from "../layout";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";

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
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Badge } from "@/components/ui/badge";
import { Calendar } from "@/components/ui/calendar";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";

const planStageSchema = z.object({
  stageName: z.string(),
  durationDays: z.coerce.number().min(0).optional(),
});

const productSchema = z.object({
  code: z.string().min(1, { message: "O código do produto é obrigatório." }),
  description: z.string().min(3, { message: "A descrição é obrigatória." }),
  unitPrice: z.coerce.number().min(0, { message: "O preço unitário deve ser um número positivo." }),
  unitWeight: z.coerce.number().min(0).optional(),
  productionPlanTemplate: z.array(planStageSchema).optional(),
});

type Product = z.infer<typeof productSchema> & { id: string, manufacturingStages?: string[] };

// Função para calcular o lead time total de um produto
const calculateLeadTime = (product: Product): number => {
  if (!product.productionPlanTemplate || product.productionPlanTemplate.length === 0) {
    return 0;
  }
  
  const totalDays = product.productionPlanTemplate.reduce((total, stage) => {
    return total + (stage.durationDays || 0);
  }, 0);
  
  return Math.round(totalDays); // Arredonda para número inteiro
};

// Função para obter badge de lead time com cor baseada na duração
const getLeadTimeBadge = (leadTime: number) => {
  if (leadTime === 0) {
    return { variant: "outline" as const, text: "Não definido", color: "text-muted-foreground" };
  } else if (leadTime <= 7) {
    return { variant: "default" as const, text: `${leadTime} dias`, color: "bg-green-600 hover:bg-green-700" };
  } else if (leadTime <= 21) {
    return { variant: "secondary" as const, text: `${leadTime} dias`, color: "bg-yellow-600 hover:bg-yellow-700" };
  } else {
    return { variant: "destructive" as const, text: `${leadTime} dias`, color: "bg-red-600 hover:bg-red-700" };
  }
};

// Função para exportar relatório em PDF usando canvas e jsPDF
const exportCalculatorReportPDF = (
  calculatorItems: Array<{
    id: string;
    productId: string;
    productCode: string;
    productDescription: string;
    quantity: number;
    leadTime: number;
    stages: Array<{ stageName: string; durationDays: number }>;
  }>,
  calculatorResults: {
    isViable: boolean;
    suggestedDate: Date;
    analysis: Array<{
      stageName: string;
      originalDuration: number;
      adjustedDuration: number;
      workload: number;
      bottleneck: boolean;
    }>;
    totalAdjustedLeadTime: number;
    confidence: number;
  } | null,
  requestedDeliveryDate: Date
) => {
  if (calculatorItems.length === 0) {
    return;
  }

  // Criar um elemento canvas para gerar o PDF
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  // Configurações do PDF
  const pageWidth = 595; // A4 width em pontos
  const pageHeight = 842; // A4 height em pontos
  const margin = 40;
  const lineHeight = 20;
  
  canvas.width = pageWidth;
  canvas.height = pageHeight;
  
  // Configurar fonte
  ctx.fillStyle = '#000000';
  ctx.font = '12px Arial';
  
  let currentY = margin;
  
  // Função auxiliar para adicionar texto
  const addText = (text: string, x: number = margin, fontSize: number = 12, isBold: boolean = false) => {
    ctx.font = `${isBold ? 'bold ' : ''}${fontSize}px Arial`;
    ctx.fillText(text, x, currentY);
    currentY += lineHeight * (fontSize / 12);
  };
  
  // Função auxiliar para quebrar linha
  const addLine = () => {
    currentY += lineHeight / 2;
  };

  // Cabeçalho
  addText('MECALD - RELATÓRIO DE ANÁLISE DE PRAZOS', margin, 16, true);
  addText(`Gerado em: ${format(new Date(), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}`, margin, 10);
  addLine();
  
  // Linha horizontal
  ctx.beginPath();
  ctx.moveTo(margin, currentY);
  ctx.lineTo(pageWidth - margin, currentY);
  ctx.stroke();
  currentY += lineHeight;
  
  // Dados da solicitação
  addText('DADOS DA SOLICITAÇÃO', margin, 14, true);
  addText(`Data de entrega solicitada: ${format(requestedDeliveryDate, "dd/MM/yyyy", { locale: ptBR })}`);
  addText(`Quantidade de itens: ${calculatorItems.length}`);
  addLine();
  
  // Lista de produtos
  addText('PRODUTOS ANALISADOS', margin, 14, true);
  calculatorItems.forEach((item, index) => {
    addText(`${index + 1}. ${item.productCode} - ${item.productDescription}`);
    addText(`   Quantidade: ${item.quantity} | Lead time base: ${item.leadTime} dias`, margin + 20, 10);
    if (item.stages.length > 0) {
      addText('   Etapas:', margin + 20, 10);
      item.stages.forEach(stage => {
        addText(`     • ${stage.stageName}: ${stage.durationDays || 0} dias`, margin + 40, 9);
      });
    }
  });
  addLine();
  
  // Resultados da análise
  if (calculatorResults) {
    addText('RESULTADO DA ANÁLISE', margin, 14, true);
    addText(`Status: ${calculatorResults.isViable ? 'VIÁVEL' : 'INVIÁVEL'}`, margin, 12, true);
    addText(`Confiança: ${calculatorResults.confidence}%`);
    addText(`Data sugerida: ${format(calculatorResults.suggestedDate, "dd/MM/yyyy", { locale: ptBR })}`);
    addText(`Lead time ajustado: ${calculatorResults.totalAdjustedLeadTime} dias`);
    addLine();
    
    addText('ANÁLISE POR SETOR', margin, 14, true);
    calculatorResults.analysis.forEach(analysis => {
      addText(`• ${analysis.stageName}${analysis.bottleneck ? ' (GARGALO)' : ''}`, margin, 11, true);
      addText(`  Tempo original: ${analysis.originalDuration} dias`, margin + 20, 10);
      addText(`  Tempo ajustado: ${analysis.adjustedDuration} dias`, margin + 20, 10);
      addText(`  Carga atual: ${Math.round(analysis.workload * 100)}%`, margin + 20, 10);
    });
    addLine();
    
    // Recomendações
    addText('RECOMENDAÇÕES', margin, 14, true);
    if (!calculatorResults.isViable) {
      addText('• Prazo inviável para a data solicitada', margin, 11);
      addText(`• Considere reagendar para ${format(calculatorResults.suggestedDate, "dd/MM/yyyy", { locale: ptBR })}`, margin, 11);
    }
    if (calculatorResults.confidence < 70) {
      addText('• Baixa confiança devido à alta carga dos setores', margin, 11);
      addText('• Monitore de perto a execução', margin, 11);
    }
    if (calculatorResults.analysis.some(a => a.bottleneck)) {
      addText('• Gargalos identificados - considere realocação de recursos', margin, 11);
    }
  }
  
  // Converter canvas para blob e fazer download
  canvas.toBlob((blob) => {
    if (blob) {
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `relatorio-prazos-mecald-${format(new Date(), "yyyyMMdd-HHmm")}.pdf`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    }
  }, 'application/pdf');
};

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

  // Estados da calculadora de prazos
  const [calculatorItems, setCalculatorItems] = useState<Array<{
    id: string;
    productId: string;
    productCode: string;
    productDescription: string;
    quantity: number;
    leadTime: number;
    stages: Array<{ stageName: string; durationDays: number }>;
  }>>([]);
  const [selectedProductForCalculator, setSelectedProductForCalculator] = useState<string>("");
  const [calculatorQuantity, setCalculatorQuantity] = useState<number>(1);
  const [requestedDeliveryDate, setRequestedDeliveryDate] = useState<Date>(
    new Date(new Date().setDate(new Date().getDate() + 30))
  );
  const [calculatorResults, setCalculatorResults] = useState<{
    isViable: boolean;
    suggestedDate: Date;
    analysis: Array<{
      stageName: string;
      originalDuration: number;
      adjustedDuration: number;
      workload: number;
      bottleneck: boolean;
    }>;
    totalAdjustedLeadTime: number;
    confidence: number;
  } | null>(null);
  
  // Simulação de carga de trabalho por setor (em uma implementação real, isso viria do banco de dados)
  const [sectorWorkload, setSectorWorkload] = useState<Record<string, number>>({});

  // Função para simular carga de trabalho dos setores
  const simulateSectorWorkload = useCallback(() => {
    const workload: Record<string, number> = {};
    manufacturingStages.forEach(stage => {
      // Simula uma carga entre 0% e 95% para cada setor
      workload[stage] = Math.random() * 0.95;
    });
    setSectorWorkload(workload);
  }, [manufacturingStages]);

  // Gera carga de trabalho inicial
  useEffect(() => {
    if (manufacturingStages.length > 0) {
      simulateSectorWorkload();
    }
  }, [manufacturingStages, simulateSectorWorkload]);

  const [isCopyPopoverOpen, setIsCopyPopoverOpen] = useState(false);
  const [copyFromSearch, setCopyFromSearch] = useState("");

  const [isEditStageDialogOpen, setIsEditStageDialogOpen] = useState(false);
  const [stageToEdit, setStageToEdit] = useState<{ oldName: string; index: number } | null>(null);
  const [newStageNameForEdit, setNewStageNameForEdit] = useState("");
  
  const [isDeleteStageDialogOpen, setIsDeleteStageDialogOpen] = useState(false);
  const [stageToDeleteConfirmation, setStageToDeleteConfirmation] = useState<string | null>(null);

  const { toast } = useToast();
  const { user, loading: authLoading } = useAuth();

  const form = useForm<z.infer<typeof productSchema>>({
    resolver: zodResolver(productSchema),
    defaultValues: {
      code: "",
      description: "",
      unitPrice: 0,
      unitWeight: 0,
      productionPlanTemplate: [],
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

  const fetchProducts = useCallback(async () => {
    setIsLoading(true);
    try {
      const querySnapshot = await getDocs(collection(db, "companies", "mecald", "products"));
      const productsList = querySnapshot.docs.map((doc) => {
        const data = doc.data();
        const planTemplate = data.productionPlanTemplate || (data.manufacturingStages && Array.isArray(data.manufacturingStages)
            ? data.manufacturingStages.map((stage: string) => ({ stageName: stage, durationDays: 0 }))
            : []);

        return {
          id: doc.id,
          ...(data as Omit<Product, 'id'>),
          productionPlanTemplate: planTemplate,
        };
      });
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
  
  const syncCatalog = useCallback(async () => {
    setIsSyncing(true);
    toast({ title: "Sincronizando...", description: "Buscando produtos em orçamentos e pedidos existentes." });
    
    try {
        const [quotationsSnapshot, ordersSnapshot] = await Promise.all([
            getDocs(collection(db, "companies", "mecald", "quotations")),
            getDocs(collection(db, "companies", "mecald", "orders"))
        ]);
        
        const productsToSync = new Map<string, any>();
        const skippedCodes: string[] = [];

        const processDocumentItems = (doc: any) => {
            const data = doc.data();
            if (Array.isArray(data.items)) {
                data.items.forEach((item: any) => {
                    const productCodeRaw = item.code || item.product_code;
                    if (productCodeRaw && typeof productCodeRaw === 'string' && productCodeRaw.trim() !== "") {
                        const productCode = productCodeRaw.trim();

                        if (productCode.includes('/') || productCode === '.' || productCode === '..') {
                            if (!skippedCodes.includes(productCode)) {
                                skippedCodes.push(productCode);
                            }
                            return; 
                        }
                        
                        const existingData = productsToSync.get(productCode) || {};

                        const productData = {
                            code: productCode,
                            description: item.description || existingData.description || "Sem descrição",
                            unitPrice: Number(item.unitPrice) || existingData.unitPrice || 0,
                            unitWeight: Number(item.unitWeight) || existingData.unitWeight || 0,
                        };
                        productsToSync.set(productCode, productData);
                    }
                });
            }
        };

        quotationsSnapshot.forEach(processDocumentItems);
        ordersSnapshot.forEach(processDocumentItems);
        
        if (productsToSync.size === 0 && skippedCodes.length === 0) {
            toast({ title: "Nenhum produto novo encontrado", description: "Seu catálogo já parece estar atualizado." });
            setIsSyncing(false);
            return;
        }

        if (productsToSync.size > 0) {
            const batch = writeBatch(db);
            const productsCollectionRef = collection(db, "companies", "mecald", "products");
    
            productsToSync.forEach((productData, productCode) => {
                const productRef = doc(productsCollectionRef, productCode);
                batch.set(productRef, { ...productData, updatedAt: Timestamp.now() }, { merge: true });
            });
    
            await batch.commit();
        }

        let description = `${productsToSync.size} produtos foram adicionados ou atualizados.`;
        if (skippedCodes.length > 0) {
            description += ` ${skippedCodes.length} código(s) foram ignorados por conterem caracteres inválidos (ex: /).`
        }

        toast({ 
            title: "Sincronização Concluída!", 
            description: description,
            duration: skippedCodes.length > 0 ? 8000 : 5000,
        });
        await fetchProducts();

    } catch (error: any) {
        console.error("Error syncing catalog: ", error);
        let description = "Não foi possível sincronizar os produtos. Tente novamente.";
        if (error.code === 'permission-denied') {
            description = "Erro de permissão. Verifique as regras de segurança do seu Firestore.";
        } else if (error.message && (error.message.includes('Document path') || error.message.includes('invalid'))) {
            description = "Um ou mais produtos nos orçamentos ou pedidos possuem um código inválido. Corrija-os e tente novamente.";
        }
        toast({
            variant: "destructive",
            title: "Erro na Sincronização",
            description: description,
        });
    } finally {
        setIsSyncing(false);
    }
  }, [toast, fetchProducts]);

  const onSubmit = async (values: z.infer<typeof productSchema>) => {
    try {
        if (values.code.includes('/')) {
            toast({
                variant: "destructive",
                title: "Código Inválido",
                description: "O código do produto não pode conter o caractere '/'."
            });
            return;
        }

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
    form.reset({ code: "", description: "", unitPrice: 0, unitWeight: 0, productionPlanTemplate: [] });
    setIsFormOpen(true);
  };
  
  const handleEditClick = (product: Product) => {
    setSelectedProduct(product);
    const planTemplate = product.productionPlanTemplate || (product.manufacturingStages 
        ? product.manufacturingStages.map((stage: string) => ({ stageName: stage, durationDays: 0 }))
        : []);
    form.reset({
      ...product,
      productionPlanTemplate: planTemplate
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

  const filteredProductsForCopy = useMemo(() => {
    const query = copyFromSearch.toLowerCase();
    return products.filter(p => 
        (p.description.toLowerCase().includes(query) || p.code.toLowerCase().includes(query)) &&
        p.id !== selectedProduct?.id
    );
  }, [products, copyFromSearch, selectedProduct]);

  const handleCopySteps = (productToCopyFrom: Product) => {
    const stepsToCopy = productToCopyFrom.productionPlanTemplate || [];
    form.setValue('productionPlanTemplate', stepsToCopy, {
        shouldValidate: true,
        shouldDirty: true,
    });
    toast({
        title: "Etapas copiadas!",
        description: `As etapas de "${productToCopyFrom.description}" foram aplicadas.`,
    });
    setIsCopyPopoverOpen(false);
  };

  const handleMoveStage = async (index: number, direction: 'up' | 'down') => {
    if (direction === 'up' && index === 0) return;
    if (direction === 'down' && index === manufacturingStages.length - 1) return;

    const newStages = [...manufacturingStages];
    const newIndex = direction === 'up' ? index - 1 : index + 1;
    const [movedItem] = newStages.splice(index, 1);
    newStages.splice(newIndex, 0, movedItem);

    try {
        await updateDoc(stagesDocRef, { stages: newStages });
        toast({ title: "Ordem das etapas atualizada!" });
        await fetchStages(); 
    } catch (error) {
        console.error("Error moving stage:", error);
        toast({ variant: "destructive", title: "Erro ao mover etapa" });
    }
  };

  const handleEditStageClick = (stageName: string, index: number) => {
    setStageToEdit({ oldName: stageName, index });
    setNewStageNameForEdit(stageName);
    setIsEditStageDialogOpen(true);
  };

  const handleConfirmEditStage = async () => {
    if (!stageToEdit || !newStageNameForEdit.trim()) return;

    const oldName = stageToEdit.oldName;
    const newName = newStageNameForEdit.trim();

    if (oldName === newName) {
        setIsEditStageDialogOpen(false);
        return;
    }
    if (manufacturingStages.some((stage, index) => stage.toLowerCase() === newName.toLowerCase() && index !== stageToEdit.index)) {
        toast({ variant: "destructive", title: "Nome duplicado", description: "Esta etapa já existe." });
        return;
    }

    try {
        const batch = writeBatch(db);
        const updatedStages = [...manufacturingStages];
        updatedStages[stageToEdit.index] = newName;
        batch.update(stagesDocRef, { stages: updatedStages });

        const productsToUpdate = products.filter(p =>
            p.productionPlanTemplate?.some(stage => stage.stageName === oldName)
        );

        for (const product of productsToUpdate) {
            const productRef = doc(db, "companies", "mecald", "products", product.id);
            const updatedPlan = product.productionPlanTemplate!.map(stage =>
                stage.stageName === oldName ? { ...stage, stageName: newName } : stage
            );
            batch.update(productRef, { productionPlanTemplate: updatedPlan });
        }

        await batch.commit();

        toast({ title: "Etapa atualizada com sucesso!" });
        setIsEditStageDialogOpen(false);
        setStageToEdit(null);
        setNewStageNameForEdit("");
        await fetchStages();
        await fetchProducts();

    } catch (error) {
        console.error("Error editing stage:", error);
        toast({ variant: "destructive", title: "Erro ao editar etapa" });
    }
  };
  
  const handleDeleteStageClick = (stageName: string) => {
      setStageToDeleteConfirmation(stageName);
      setIsDeleteStageDialogOpen(true);
  };

  const handleConfirmDeleteStage = async () => {
    if (!stageToDeleteConfirmation) return;
    
    try {
        const batch = writeBatch(db);
        batch.update(stagesDocRef, { stages: arrayRemove(stageToDeleteConfirmation) });

        const productsToUpdate = products.filter(p =>
            p.productionPlanTemplate?.some(stage => stage.stageName === stageToDeleteConfirmation)
        );

        for (const product of productsToUpdate) {
            const productRef = doc(db, "companies", "mecald", "products", product.id);
            const updatedPlan = product.productionPlanTemplate!.filter(
                stage => stage.stageName !== stageToDeleteConfirmation
            );
            batch.update(productRef, { productionPlanTemplate: updatedPlan });
        }

        await batch.commit();
        toast({ title: "Etapa removida com sucesso!" });
        setIsDeleteStageDialogOpen(false);
        setStageToDeleteConfirmation(null);
        await fetchStages();
        await fetchProducts();
    } catch (error) {
        console.error("Error deleting stage:", error);
        toast({ variant: "destructive", title: "Erro ao remover etapa" });
    }
  };

  // Estatísticas do lead time para o dashboard
  const leadTimeStats = useMemo(() => {
    if (products.length === 0) return { avgLeadTime: 0, maxLeadTime: 0, productsWithLeadTime: 0 };
    
    const productsWithValidLeadTime = products.filter(p => calculateLeadTime(p) > 0);
    const leadTimes = productsWithValidLeadTime.map(p => calculateLeadTime(p));
    
    const avgLeadTime = leadTimes.length > 0 ? leadTimes.reduce((sum, lt) => sum + lt, 0) / leadTimes.length : 0;
    const maxLeadTime = leadTimes.length > 0 ? Math.max(...leadTimes) : 0;
    
    return {
      avgLeadTime: Math.round(avgLeadTime * 10) / 10,
      maxLeadTime: Math.round(maxLeadTime),
      productsWithLeadTime: productsWithValidLeadTime.length
    };
  }, [products]);

  // Função para adicionar item à calculadora
  const addItemToCalculator = () => {
    if (!selectedProductForCalculator || calculatorQuantity <= 0) {
      toast({
        variant: "destructive",
        title: "Dados inválidos",
        description: "Selecione um produto e informe uma quantidade válida."
      });
      return;
    }

    const product = products.find(p => p.id === selectedProductForCalculator);
    if (!product) return;

    const newItem = {
      id: Date.now().toString(),
      productId: product.id,
      productCode: product.code,
      productDescription: product.description,
      quantity: calculatorQuantity,
      leadTime: calculateLeadTime(product),
      stages: product.productionPlanTemplate || []
    };

    setCalculatorItems(prev => [...prev, newItem]);
    setSelectedProductForCalculator("");
    setCalculatorQuantity(1);
  };

  // Função para remover item da calculadora
  const removeItemFromCalculator = (id: string) => {
    setCalculatorItems(prev => prev.filter(item => item.id !== id));
  };

  // Algoritmo MELHORADO de cálculo de viabilidade - mais realista
  const calculateFeasibility = () => {
    if (calculatorItems.length === 0) {
      toast({
        variant: "destructive",
        title: "Lista vazia",
        description: "Adicione pelo menos um item para calcular."
      });
      return;
    }

    // Consolida todas as etapas de todos os itens (corrigido para considerar paralelismo)
    const stageMaxDuration: Record<string, number> = {};
    
    calculatorItems.forEach(item => {
      item.stages.forEach(stage => {
        const stageDuration = (stage.durationDays || 0) * item.quantity;
        stageMaxDuration[stage.stageName] = Math.max(
          stageMaxDuration[stage.stageName] || 0,
          stageDuration
        );
      });
    });

    // Analisa cada etapa considerando a carga atual - ALGORITMO MELHORADO
    const analysis = Object.entries(stageMaxDuration).map(([stageName, totalDays]) => {
      const currentWorkload = sectorWorkload[stageName] || 0;
      
      // Cálculo mais realista do fator de ajuste
      let adjustmentFactor = 1;
      let isBottleneck = false;
      
      if (currentWorkload >= 0.9) {
        // Setor crítico (90%+) - muito problemático
        adjustmentFactor = 2.5 + (currentWorkload - 0.9) * 10; // 2.5x a 3.5x
        isBottleneck = true;
      } else if (currentWorkload >= 0.8) {
        // Setor sobrecarregado (80-90%) - problemático
        adjustmentFactor = 1.8 + (currentWorkload - 0.8) * 7; // 1.8x a 2.5x
        isBottleneck = true;
      } else if (currentWorkload >= 0.7) {
        // Setor com alta carga (70-80%) - atenção
        adjustmentFactor = 1.3 + (currentWorkload - 0.7) * 5; // 1.3x a 1.8x
        isBottleneck = currentWorkload >= 0.75;
      } else if (currentWorkload >= 0.5) {
        // Setor com carga normal (50-70%) - pequeno impacto
        adjustmentFactor = 1.0 + (currentWorkload - 0.5) * 1.5; // 1.0x a 1.3x
      } else {
        // Setor com baixa carga (0-50%) - pode até ser mais rápido
        adjustmentFactor = 0.8 + currentWorkload * 0.4; // 0.8x a 1.0x
      }

      const adjustedDuration = Math.ceil(totalDays * adjustmentFactor);

      return {
        stageName,
        originalDuration: totalDays,
        adjustedDuration,
        workload: currentWorkload,
        bottleneck: isBottleneck
      };
    });

    // Calcula o lead time total ajustado
    // Considera que algumas etapas podem ser paralelas, mas gargalos afetam todo o processo
    const bottlenecks = analysis.filter(a => a.bottleneck);
    const regularStages = analysis.filter(a => !a.bottleneck);
    
    // Se há gargalos, eles dominam o tempo total
    let totalAdjustedLeadTime;
    if (bottlenecks.length > 0) {
      // Gargalos são sequenciais e afetam severamente o prazo
      const bottleneckTime = bottlenecks.reduce((sum, stage) => sum + stage.adjustedDuration, 0);
      const regularTime = Math.max(...regularStages.map(s => s.adjustedDuration), 0);
      totalAdjustedLeadTime = Math.max(bottleneckTime, regularTime * 1.2); // Gargalos causam ainda mais atrasos
    } else {
      // Sem gargalos, considera paralelismo parcial
      totalAdjustedLeadTime = Math.max(...analysis.map(a => a.adjustedDuration));
    }
    
    // Data sugerida baseada no lead time ajustado
    const suggestedDate = new Date();
    suggestedDate.setDate(suggestedDate.getDate() + totalAdjustedLeadTime);

    // Verifica se é viável para a data solicitada
    const daysUntilRequested = Math.ceil((requestedDeliveryDate.getTime() - new Date().getTime()) / (1000 * 60 * 60 * 24));
    const isViable = daysUntilRequested >= totalAdjustedLeadTime;

    // Calcula confiança de forma mais criteriosa
    let confidence = 90; // Começa com alta confiança
    
    // Reduz confiança baseado na carga dos setores
    const avgWorkload = analysis.reduce((sum, a) => sum + a.workload, 0) / analysis.length;
    confidence -= avgWorkload * 60; // Até -60 pontos por carga alta
    
    // Reduz drasticamente se há gargalos
    const bottleneckCount = bottlenecks.length;
    confidence -= bottleneckCount * 25; // -25 pontos por gargalo
    
    // Considera margem de tempo
    const timeMargin = (daysUntilRequested - totalAdjustedLeadTime) / totalAdjustedLeadTime;
    if (timeMargin < 0) {
      confidence -= 30; // Prazo já é inviável
    } else if (timeMargin < 0.2) {
      confidence -= 20; // Margem muito apertada
    } else if (timeMargin > 0.5) {
      confidence += 10; // Boa margem de segurança
    }
    
    // Limita entre 5% e 95%
    confidence = Math.min(95, Math.max(5, Math.round(confidence)));

    setCalculatorResults({
      isViable,
      suggestedDate,
      analysis,
      totalAdjustedLeadTime,
      confidence
    });
  };

  // Função para limpar a calculadora
  const clearCalculator = () => {
    setCalculatorItems([]);
    setCalculatorResults(null);
    setSelectedProductForCalculator("");
    setCalculatorQuantity(1);
  };

  // Função para exportar relatório em PDF melhorado
  const handleExportReport = () => {
    if (calculatorItems.length === 0) {
      toast({
        variant: "destructive",
        title: "Lista vazia",
        description: "Adicione produtos à análise antes de exportar o relatório."
      });
      return;
    }

    // Usar biblioteca HTML para PDF ao invés de canvas
    const printWindow = window.open('', '_blank');
    if (!printWindow) return;

    const htmlContent = `
      <!DOCTYPE html>
      <html>
        <head>
          <meta charset="utf-8">
          <title>Relatório de Análise de Prazos - MECALD</title>
          <style>
            body { font-family: Arial, sans-serif; margin: 20px; line-height: 1.6; }
            .header { text-align: center; margin-bottom: 30px; border-bottom: 2px solid #333; padding-bottom: 20px; }
            .company-logo { font-size: 24px; font-weight: bold; color: #2563eb; }
            .report-title { font-size: 18px; margin: 10px 0; }
            .report-date { font-size: 12px; color: #666; }
            .section { margin: 20px 0; }
            .section-title { font-size: 16px; font-weight: bold; margin-bottom: 10px; border-bottom: 1px solid #ccc; }
            .item { margin: 10px 0; padding: 10px; border: 1px solid #ddd; border-radius: 5px; }
            .result-box { padding: 20px; border: 2px solid #ddd; border-radius: 10px; text-align: center; margin: 20px 0; }
            .viable { border-color: #16a34a; background-color: #f0fdf4; }
            .not-viable { border-color: #dc2626; background-color: #fef2f2; }
            .stage-analysis { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; margin: 10px 0; }
            .bottleneck { color: #dc2626; font-weight: bold; }
            .recommendation { padding: 15px; margin: 10px 0; border-radius: 5px; }
            .rec-danger { background-color: #fef2f2; border-left: 4px solid #dc2626; }
            .rec-warning { background-color: #fffbeb; border-left: 4px solid #f59e0b; }
            .rec-info { background-color: #eff6ff; border-left: 4px solid #3b82f6; }
            table { width: 100%; border-collapse: collapse; margin: 10px 0; }
            th, td { border: 1px solid #ddd; padding: 8px; text-align: left; }
            th { background-color: #f5f5f5; }
            @media print { 
              .no-print { display: none; } 
              body { margin: 0; }
            }
          </style>
        </head>
        <body>
          <div class="header">
            <div class="company-logo">MECALD</div>
            <div class="report-title">RELATÓRIO DE ANÁLISE DE VIABILIDADE DE PRAZOS</div>
            <div class="report-date">Gerado em: ${format(new Date(), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}</div>
          </div>

          <div class="section">
            <div class="section-title">DADOS DA SOLICITAÇÃO</div>
            <p><strong>Data de entrega solicitada:</strong> ${format(requestedDeliveryDate, "dd/MM/yyyy", { locale: ptBR })}</p>
            <p><strong>Quantidade de itens analisados:</strong> ${calculatorItems.length}</p>
            <p><strong>Lead time total estimado:</strong> ${calculatorResults?.totalAdjustedLeadTime || 0} dias</p>
          </div>

          <div class="section">
            <div class="section-title">PRODUTOS ANALISADOS</div>
            ${calculatorItems.map((item, index) => `
              <div class="item">
                <h4>${index + 1}. ${item.productCode} - ${item.productDescription}</h4>
                <p><strong>Quantidade:</strong> ${item.quantity} | <strong>Lead time base:</strong> ${item.leadTime} dias</p>
                ${item.stages.length > 0 ? `
                  <p><strong>Etapas de produção:</strong></p>
                  <ul>
                    ${item.stages.map(stage => `<li>${stage.stageName}: ${stage.durationDays || 0} dias</li>`).join('')}
                  </ul>
                ` : '<p>Nenhuma etapa definida</p>'}
              </div>
            `).join('')}
          </div>

          ${calculatorResults ? `
            <div class="section">
              <div class="section-title">RESULTADO DA ANÁLISE</div>
              <div class="result-box ${calculatorResults.isViable ? 'viable' : 'not-viable'}">
                <h2>${calculatorResults.isViable ? '✓ PRAZO VIÁVEL' : '✗ PRAZO INVIÁVEL'}</h2>
                <p><strong>Nível de confiança:</strong> ${calculatorResults.confidence}%</p>
                <p><strong>Data sugerida para entrega:</strong> ${format(calculatorResults.suggestedDate, "dd/MM/yyyy", { locale: ptBR })}</p>
                <p><strong>Lead time ajustado:</strong> ${calculatorResults.totalAdjustedLeadTime} dias</p>
              </div>
            </div>

            <div class="section">
              <div class="section-title">ANÁLISE DETALHADA POR SETOR</div>
              <table>
                <thead>
                  <tr>
                    <th>Setor/Etapa</th>
                    <th>Tempo Original</th>
                    <th>Tempo Ajustado</th>
                    <th>Carga Atual</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  ${calculatorResults.analysis.map(analysis => `
                    <tr>
                      <td><strong>${analysis.stageName}</strong></td>
                      <td>${analysis.originalDuration} dias</td>
                      <td>${analysis.adjustedDuration} dias</td>
                      <td>${Math.round(analysis.workload * 100)}%</td>
                      <td class="${analysis.bottleneck ? 'bottleneck' : ''}">${analysis.bottleneck ? 'GARGALO' : 'Normal'}</td>
                    </tr>
                  `).join('')}
                </tbody>
              </table>
            </div>

            <div class="section">
              <div class="section-title">RECOMENDAÇÕES</div>
              ${!calculatorResults.isViable ? `
                <div class="recommendation rec-danger">
                  <strong>⚠️ Prazo Inviável</strong><br>
                  O prazo solicitado não pode ser cumprido com a capacidade atual. 
                  Recomenda-se reagendar para ${format(calculatorResults.suggestedDate, "dd/MM/yyyy", { locale: ptBR })} ou posterior.
                </div>
              ` : ''}
              
              ${calculatorResults.confidence < 70 ? `
                <div class="recommendation rec-warning">
                  <strong>⚠️ Baixa Confiança (${calculatorResults.confidence}%)</strong><br>
                  A alta carga dos setores produtivos pode causar atrasos. 
                  Recomenda-se monitoramento constante e planos de contingência.
                </div>
              ` : ''}
              
              ${calculatorResults.analysis.some(a => a.bottleneck) ? `
                <div class="recommendation rec-warning">
                  <strong>🚨 Gargalos Identificados</strong><br>
                  Os seguintes setores estão operando próximo ao limite: 
                  ${calculatorResults.analysis.filter(a => a.bottleneck).map(a => a.stageName).join(', ')}.<br>
                  Considere: realocação de recursos, horas extras, terceirização ou renegociação de prazos.
                </div>
              ` : ''}
              
              ${calculatorResults.isViable && calculatorResults.confidence >= 70 ? `
                <div class="recommendation rec-info">
                  <strong>✅ Análise Positiva</strong><br>
                  O prazo é viável com boa margem de segurança. 
                  Mantenha o monitoramento regular do progresso.
                </div>
              ` : ''}
            </div>
          ` : ''}

          <div class="section" style="margin-top: 40px; font-size: 10px; color: #666; text-align: center;">
            <p>Este relatório foi gerado automaticamente pelo sistema MECALD em ${format(new Date(), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}</p>
            <p>Para mais informações, entre em contato com o setor de planejamento.</p>
          </div>

          <script>
            window.onload = function() {
              window.print();
              setTimeout(function() { window.close(); }, 1000);
            }
          </script>
        </body>
      </html>
    `;

    printWindow.document.write(htmlContent);
    printWindow.document.close();

    toast({
      title: "Relatório gerado!",
      description: "O relatório será aberto em uma nova janela para impressão/salvamento em PDF."
    });
  };

  return (
    <>
      <div className="flex-1 space-y-4 p-4 md:p-8 pt-6">
        <div className="flex items-center justify-between space-y-2">
          <h1 className="text-3xl font-bold tracking-tight font-headline">Produtos e Etapas</h1>
            <div className="flex items-center gap-2">
                 <Button onClick={syncCatalog} variant="outline" disabled={isSyncing}>
                    <RefreshCw className={`mr-2 h-4 w-4 ${isSyncing ? 'animate-spin' : ''}`} />
                    {isSyncing ? "Sincronizando..." : "Sincronizar Catálogo"}
                 </Button>
                 <Button onClick={handleAddClick}>
                    <PlusCircle className="mr-2 h-4 w-4" />
                    Adicionar Produto
                 </Button>
            </div>
        </div>

        {/* Dashboard de Lead Time */}
        {products.length > 0 && (
          <div className="grid gap-4 md:grid-cols-3 mb-6">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Lead Time Médio</CardTitle>
                <Clock className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{leadTimeStats.avgLeadTime} dias</div>
                <p className="text-xs text-muted-foreground">
                  Baseado em {leadTimeStats.productsWithLeadTime} produtos
                </p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Maior Lead Time</CardTitle>
                <Clock className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{leadTimeStats.maxLeadTime} dias</div>
                <p className="text-xs text-muted-foreground">
                  Produto com maior tempo de produção
                </p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Produtos com Lead Time</CardTitle>
                <Clock className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{leadTimeStats.productsWithLeadTime}</div>
                <p className="text-xs text-muted-foreground">
                  De {products.length} produtos cadastrados
                </p>
              </CardContent>
            </Card>
          </div>
        )}

        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
            <TabsList>
                <TabsTrigger value="catalog">Catálogo de Produtos</TabsTrigger>
                <TabsTrigger value="stages">Etapas de Produção</TabsTrigger>
                <TabsTrigger value="calculator">Calculadora de Prazos</TabsTrigger>
            </TabsList>
            <TabsContent value="catalog" className="mt-4">
                <Card>
                    <CardHeader>
                        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                            <div>
                                <CardTitle>Produtos Cadastrados</CardTitle>
                                <CardDescription>
                                Gerencie os produtos e serviços que sua empresa oferece. O lead time é calculado automaticamente com base nas etapas de fabricação configuradas.
                                </CardDescription>
                            </div>
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
                            </div>
                        </div>
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
                                <TableHead className="w-[150px]">Código</TableHead>
                                <TableHead>Descrição</TableHead>
                                <TableHead className="w-[140px] text-right">Preço Unitário (R$)</TableHead>
                                <TableHead className="w-[120px] text-center">Lead Time</TableHead>
                                <TableHead className="w-[100px] text-center">Ações</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {filteredProducts.length > 0 ? (
                                filteredProducts.map((product) => {
                                    const leadTime = calculateLeadTime(product);
                                    const leadTimeBadge = getLeadTimeBadge(leadTime);
                                    
                                    return (
                                        <TableRow key={product.id}>
                                        <TableCell className="font-mono">{product.code}</TableCell>
                                        <TableCell className="font-medium">{product.description}</TableCell>
                                        <TableCell className="text-right">{product.unitPrice.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</TableCell>
                                        <TableCell className="text-center">
                                            <Badge 
                                                variant={leadTimeBadge.variant}
                                                className={leadTime > 0 && leadTime <= 7 ? leadTimeBadge.color : ''}
                                            >
                                                {leadTimeBadge.text}
                                            </Badge>
                                        </TableCell>
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
                                    )
                                })
                                ) : (
                                <TableRow>
                                    <TableCell colSpan={5} className="text-center h-24">
                                    {searchQuery ? `Nenhum produto encontrado para "${searchQuery}".` : "Nenhum produto encontrado."}
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
                            Cadastre e gerencie as etapas do seu processo produtivo. Elas serão usadas para calcular o lead time dos produtos.
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
                                    {manufacturingStages.map((stage, index) => (
                                        <div key={stage} className="flex items-center justify-between rounded-md border p-3">
                                            <p className="font-medium">{stage}</p>
                                            <div className="flex items-center gap-1">
                                                <Button variant="ghost" size="icon" onClick={() => handleMoveStage(index, 'up')} disabled={index === 0}>
                                                    <ArrowUp className="h-4 w-4" />
                                                </Button>
                                                <Button variant="ghost" size="icon" onClick={() => handleMoveStage(index, 'down')} disabled={index === manufacturingStages.length - 1}>
                                                    <ArrowDown className="h-4 w-4" />
                                                </Button>
                                                <Button variant="ghost" size="icon" onClick={() => handleEditStageClick(stage, index)}>
                                                    <Pencil className="h-4 w-4" />
                                                </Button>
                                                <Button variant="ghost" size="icon" className="text-destructive hover:text-destructive" onClick={() => handleDeleteStageClick(stage)}>
                                                    <Trash2 className="h-4 w-4" />
                                                </Button>
                                            </div>
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
            <TabsContent value="calculator" className="mt-4">
                <div className="grid gap-6 lg:grid-cols-2">
                    {/* Painel de Entrada */}
                    <Card>
                        <CardHeader>
                            <CardTitle>Calculadora de Viabilidade de Prazos</CardTitle>
                            <CardDescription>
                                Analise se é possível cumprir prazos considerando a carga atual dos setores de produção.
                            </CardDescription>
                        </CardHeader>
                        <CardContent className="space-y-6">
                            {/* Carga Atual dos Setores */}
                            <div>
                                <h4 className="text-sm font-medium mb-3">Carga Atual dos Setores</h4>
                                <div className="grid gap-2">
                                    {manufacturingStages.map(stage => {
                                        const workload = sectorWorkload[stage] || 0;
                                        const percentage = Math.round(workload * 100);
                                        let colorClass = "bg-green-500";
                                        if (percentage > 80) colorClass = "bg-red-500";
                                        else if (percentage > 60) colorClass = "bg-yellow-500";
                                        
                                        return (
                                            <div key={stage} className="flex items-center gap-3">
                                                <span className="text-sm font-medium w-24 truncate">{stage}</span>
                                                <div className="flex-1 bg-muted rounded-full h-2">
                                                    <div 
                                                        className={`h-2 rounded-full transition-all ${colorClass}`}
                                                        style={{ width: `${percentage}%` }}
                                                    />
                                                </div>
                                                <span className="text-xs text-muted-foreground w-12 text-right">
                                                    {percentage}%
                                                </span>
                                            </div>
                                        );
                                    })}
                                </div>
                                <Button 
                                    variant="outline" 
                                    size="sm" 
                                    onClick={simulateSectorWorkload}
                                    className="mt-3"
                                >
                                    <RefreshCw className="mr-2 h-3 w-3" />
                                    Atualizar Carga
                                </Button>
                            </div>

                            <Separator />

                            {/* Adicionar Produtos */}
                            <div>
                                <h4 className="text-sm font-medium mb-3">Adicionar Produtos à Análise</h4>
                                <div className="space-y-3">
                                    <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                                        <Select value={selectedProductForCalculator} onValueChange={setSelectedProductForCalculator}>
                                            <SelectTrigger>
                                                <SelectValue placeholder="Selecione um produto" />
                                            </SelectTrigger>
                                            <SelectContent>
                                                {products.filter(p => calculateLeadTime(p) > 0).map(product => (
                                                    <SelectItem key={product.id} value={product.id}>
                                                        {product.code} - {product.description}
                                                    </SelectItem>
                                                ))}
                                            </SelectContent>
                                        </Select>
                                        <Input
                                            type="number"
                                            placeholder="Quantidade"
                                            value={calculatorQuantity}
                                            onChange={(e) => setCalculatorQuantity(Number(e.target.value))}
                                            min="1"
                                        />
                                        <Button onClick={addItemToCalculator} className="w-full">
                                            <PlusCircle className="mr-2 h-4 w-4" />
                                            Adicionar
                                        </Button>
                                    </div>
                                </div>
                            </div>

                            {/* Lista de Itens */}
                            {calculatorItems.length > 0 && (
                                <div>
                                    <div className="flex items-center justify-between mb-3">
                                        <h4 className="text-sm font-medium">Itens para Análise</h4>
                                        <Button variant="outline" size="sm" onClick={clearCalculator}>
                                            Limpar Lista
                                        </Button>
                                    </div>
                                    <div className="space-y-2 max-h-64 overflow-y-auto">
                                        {calculatorItems.map(item => (
                                            <div key={item.id} className="flex items-center justify-between p-3 border rounded-md">
                                                <div className="flex-1">
                                                    <div className="font-medium text-sm">{item.productCode}</div>
                                                    <div className="text-xs text-muted-foreground">{item.productDescription}</div>
                                                    <div className="text-xs text-muted-foreground">
                                                        Qtd: {item.quantity} | Lead time: {item.leadTime} dias
                                                    </div>
                                                </div>
                                                <Button 
                                                    variant="ghost" 
                                                    size="icon"
                                                    onClick={() => removeItemFromCalculator(item.id)}
                                                    className="text-destructive hover:text-destructive"
                                                >
                                                    <Trash2 className="h-4 w-4" />
                                                </Button>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}

                            {/* Data Solicitada */}
                            <div>
                                <Label className="text-sm font-medium">Data de Entrega Solicitada</Label>
                                <Popover>
                                    <PopoverTrigger asChild>
                                        <Button variant="outline" className="w-full justify-start text-left mt-2">
                                            {format(requestedDeliveryDate, "PPP", { locale: ptBR })}
                                            <CalendarIcon className="ml-auto h-4 w-4 opacity-50" />
                                        </Button>
                                    </PopoverTrigger>
                                    <PopoverContent className="w-auto p-0" align="start">
                                        <Calendar 
                                            mode="single" 
                                            selected={requestedDeliveryDate} 
                                            onSelect={(date) => date && setRequestedDeliveryDate(date)}
                                            initialFocus 
                                        />
                                    </PopoverContent>
                                </Popover>
                            </div>

                            {/* Botão de Calcular */}
                            <Button 
                                onClick={calculateFeasibility} 
                                className="w-full"
                                disabled={calculatorItems.length === 0}
                            >
                                <Clock className="mr-2 h-4 w-4" />
                                Analisar Viabilidade
                            </Button>
                        </CardContent>
                    </Card>

                    {/* Painel de Resultados */}
                    <Card>
                        <CardHeader>
                            <div className="flex items-center justify-between">
                                <div>
                                    <CardTitle>Análise de Viabilidade</CardTitle>
                                    <CardDescription>
                                        Resultado da análise considerando capacidade de produção atual.
                                    </CardDescription>
                                </div>
                                {calculatorItems.length > 0 && (
                                    <Button onClick={handleExportReport} variant="outline" size="sm">
                                        <FileText className="mr-2 h-4 w-4" />
                                        Exportar PDF
                                    </Button>
                                )}
                            </div>
                        </CardHeader>
                        <CardContent>
                            {calculatorResults ? (
                                <div className="space-y-6">
                                    {/* Resultado Principal */}
                                    <div className="text-center p-6 border rounded-lg">
                                        <div className={`text-3xl font-bold mb-2 ${calculatorResults.isViable ? 'text-green-600' : 'text-red-600'}`}>
                                            {calculatorResults.isViable ? '✓ VIÁVEL' : '✗ INVIÁVEL'}
                                        </div>
                                        <div className="text-sm text-muted-foreground mb-4">
                                            Confiança: {calculatorResults.confidence}%
                                        </div>
                                        <div className="space-y-2">
                                            <div className="text-sm">
                                                <span className="font-medium">Data solicitada:</span> {format(requestedDeliveryDate, "dd/MM/yyyy")}
                                            </div>
                                            <div className="text-sm">
                                                <span className="font-medium">Data sugerida:</span> {format(calculatorResults.suggestedDate, "dd/MM/yyyy")}
                                            </div>
                                            <div className="text-sm">
                                                <span className="font-medium">Lead time ajustado:</span> {calculatorResults.totalAdjustedLeadTime} dias
                                            </div>
                                        </div>
                                    </div>

                                    {/* Análise por Setor */}
                                    <div>
                                        <h4 className="text-sm font-medium mb-3">Análise por Setor</h4>
                                        <div className="space-y-3">
                                            {calculatorResults.analysis.map(analysis => (
                                                <div key={analysis.stageName} className="p-3 border rounded-md">
                                                    <div className="flex items-center justify-between mb-2">
                                                        <span className="font-medium text-sm">{analysis.stageName}</span>
                                                        {analysis.bottleneck && (
                                                            <Badge variant="destructive">Gargalo</Badge>
                                                        )}
                                                    </div>
                                                    <div className="grid grid-cols-2 gap-4 text-xs text-muted-foreground">
                                                        <div>
                                                            <div>Tempo original: {analysis.originalDuration} dias</div>
                                                            <div>Tempo ajustado: {analysis.adjustedDuration} dias</div>
                                                        </div>
                                                        <div>
                                                            <div>Carga atual: {Math.round(analysis.workload * 100)}%</div>
                                                            <div>
                                                                Impacto: {analysis.adjustedDuration > analysis.originalDuration ? '+' : ''}
                                                                {analysis.adjustedDuration - analysis.originalDuration} dias
                                                            </div>
                                                        </div>
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    </div>

                                    {/* Recomendações */}
                                    <div>
                                        <h4 className="text-sm font-medium mb-3">Recomendações</h4>
                                        <div className="space-y-2 text-sm text-muted-foreground">
                                            {!calculatorResults.isViable && (
                                                <div className="p-3 bg-red-50 border border-red-200 rounded-md">
                                                    <div className="font-medium text-red-800 mb-1">Prazo Inviável</div>
                                                    <div className="text-red-700">
                                                        Considere reagendar para {format(calculatorResults.suggestedDate, "dd/MM/yyyy")} 
                                                        ou redistribuir a carga de trabalho.
                                                    </div>
                                                </div>
                                            )}
                                            {calculatorResults.confidence < 70 && (
                                                <div className="p-3 bg-yellow-50 border border-yellow-200 rounded-md">
                                                    <div className="font-medium text-yellow-800 mb-1">Baixa Confiança</div>
                                                    <div className="text-yellow-700">
                                                        Setores com alta carga podem causar atrasos. Monitore de perto.
                                                    </div>
                                                </div>
                                            )}
                                            {calculatorResults.analysis.some(a => a.bottleneck) && (
                                                <div className="p-3 bg-orange-50 border border-orange-200 rounded-md">
                                                    <div className="font-medium text-orange-800 mb-1">Gargalos Identificados</div>
                                                    <div className="text-orange-700">
                                                        Considere realocar recursos ou terceirizar algumas etapas.
                                                    </div>
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                </div>
                            ) : (
                                <div className="text-center py-12 text-muted-foreground">
                                    <Clock className="mx-auto h-12 w-12 mb-4 opacity-50" />
                                    <p>Adicione produtos e clique em "Analisar Viabilidade" para ver os resultados.</p>
                                </div>
                            )}
                        </CardContent>
                    </Card>
                </div>
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
            <form onSubmit={form.handleSubmit(onSubmit)}>
              <ScrollArea className="h-[70vh] pr-6">
                <div className="space-y-4 pt-4">
                  <FormField control={form.control} name="code" render={({ field }) => (
                      <FormItem>
                          <FormLabel>Código do Produto</FormLabel>
                          <FormControl><Input placeholder="Ex: PROD-001" {...field} value={field.value ?? ''} /></FormControl>
                          <FormDescription>Alterar o código criará um novo registro para o produto.</FormDescription>
                          <FormMessage />
                      </FormItem>
                  )} />
                  <FormField control={form.control} name="description" render={({ field }) => (
                      <FormItem>
                          <FormLabel>Descrição</FormLabel>
                          <FormControl><Textarea placeholder="Descrição detalhada do produto ou serviço" {...field} value={field.value ?? ''} /></FormControl>
                          <FormMessage />
                      </FormItem>
                  )} />
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <FormField control={form.control} name="unitPrice" render={({ field }) => (
                          <FormItem>
                              <FormLabel>Preço Unitário (R$)</FormLabel>
                              <FormControl><Input type="number" placeholder="0.00" {...field} value={field.value ?? ''} /></FormControl>
                              <FormMessage />
                          </FormItem>
                      )} />
                      <FormField control={form.control} name="unitWeight" render={({ field }) => (
                          <FormItem>
                              <FormLabel>Peso Unit. (kg)</FormLabel>
                              <FormControl><Input type="number" placeholder="0.00" {...field} value={field.value ?? 0} /></FormControl>
                              <FormMessage />
                          </FormItem>
                      )} />
                  </div>
                  
                  <Separator />

                  <FormField
                    control={form.control}
                    name="productionPlanTemplate"
                    render={({ field }) => (
                        <FormItem>
                            <div className="mb-4">
                                <div className="flex justify-between items-start">
                                    <div>
                                        <FormLabel className="text-base">Etapas de Fabricação e Prazos</FormLabel>
                                        <FormDescription>
                                            Selecione as etapas e defina a duração em dias para cada uma. O lead time total será calculado automaticamente.
                                        </FormDescription>
                                    </div>
                                    <Popover open={isCopyPopoverOpen} onOpenChange={setIsCopyPopoverOpen}>
                                        <PopoverTrigger asChild>
                                            <Button type="button" variant="outline" size="sm">
                                                <Copy className="mr-2 h-3.5 w-3.5" />
                                                Copiar de outro produto
                                            </Button>
                                        </PopoverTrigger>
                                        <PopoverContent className="w-[350px] p-0" align="end">
                                            <div className="p-2">
                                                <Input
                                                    placeholder="Buscar por nome ou código..."
                                                    value={copyFromSearch}
                                                    onChange={(e) => setCopyFromSearch(e.target.value)}
                                                    className="h-9"
                                                />
                                            </div>
                                            <Separator />
                                            <ScrollArea className="h-64">
                                                <div className="p-1">
                                                    {filteredProductsForCopy.length > 0 ? (
                                                        filteredProductsForCopy.map((product) => (
                                                            <Button
                                                                key={product.id}
                                                                type="button"
                                                                variant="ghost"
                                                                className="w-full justify-start h-auto py-2 px-2 text-left"
                                                                onClick={() => handleCopySteps(product)}
                                                            >
                                                                <div className="flex flex-col items-start">
                                                                    <span className="font-medium">{product.description}</span>
                                                                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                                                                        <span>({product.code})</span>
                                                                        <span>•</span>
                                                                        <span>{calculateLeadTime(product)} dias</span>
                                                                    </div>
                                                                </div>
                                                            </Button>
                                                        ))
                                                    ) : (
                                                        <p className="p-4 text-center text-sm text-muted-foreground">Nenhum outro produto encontrado.</p>
                                                    )}
                                                </div>
                                            </ScrollArea>
                                        </PopoverContent>
                                    </Popover>
                                </div>
                            </div>
                            
                            {/* Preview do lead time atual */}
                            {field.value && field.value.length > 0 && (
                                <div className="mb-4 p-3 bg-muted rounded-md">
                                    <div className="flex items-center gap-2 text-sm">
                                        <Clock className="h-4 w-4" />
                                        <span className="font-medium">Lead Time Total:</span>
                                        <Badge variant="secondary">
                                            {field.value.reduce((total, stage) => total + (stage.durationDays || 0), 0)} dias
                                        </Badge>
                                    </div>
                                </div>
                            )}
                            
                            <div className="space-y-3">
                                {manufacturingStages.map((stageName) => {
                                    const currentStage = field.value?.find(p => p.stageName === stageName);
                                    const isChecked = !!currentStage;

                                    return (
                                        <div key={stageName} className="flex items-center gap-4 rounded-md border p-3">
                                            <Checkbox
                                                id={`stage-checkbox-${stageName}`}
                                                checked={isChecked}
                                                onCheckedChange={(checked) => {
                                                    const newValue = checked
                                                        ? [...(field.value || []), { stageName: stageName, durationDays: 0 }]
                                                        : (field.value || []).filter(p => p.stageName !== stageName);
                                                    field.onChange(newValue.sort((a,b) => manufacturingStages.indexOf(a.stageName) - manufacturingStages.indexOf(b.stageName)));
                                                }}
                                            />
                                            <Label htmlFor={`stage-checkbox-${stageName}`} className="flex-1 font-normal cursor-pointer">
                                                {stageName}
                                            </Label>
                                            {isChecked && (
                                             <div className="flex items-center gap-2">
                                                    <Input
                                                        type="number"
                                                        step="any"
                                                        className="h-8 w-20"
                                                        placeholder="Dias"
                                                        value={currentStage?.durationDays ?? 0}
                                                        onChange={(e) => {
                                                            const value = e.target.value;
                                                            const sanitizedValue = value.replace(',', '.');
                                                            const newPlan = (field.value || []).map(p => 
                                                                p.stageName === stageName 
                                                                ? { ...p, durationDays: value === '' ? undefined : Number(sanitizedValue) } 
                                                                : p
                                                            );
                                                            field.onChange(newPlan);
                                                        }}
                                                    />
                                                    <span className="text-sm text-muted-foreground">dias</span>
                                                </div>
                                            )}
                                        </div>
                                    );
                                })}
                            </div>
                            <FormMessage />
                        </FormItem>
                    )}
                />
                </div>
              </ScrollArea>
              <DialogFooter className="pt-6 border-t mt-4">
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

      <Dialog open={isEditStageDialogOpen} onOpenChange={setIsEditStageDialogOpen}>
        <DialogContent>
            <DialogHeader>
                <DialogTitle>Editar Etapa de Fabricação</DialogTitle>
                <DialogDescription>
                    Alterar o nome aqui atualizará a etapa em todos os produtos que a utilizam.
                </DialogDescription>
            </DialogHeader>
            <div className="py-4">
                <Label htmlFor="edit-stage-name">Novo Nome da Etapa</Label>
                <Input 
                    id="edit-stage-name"
                    value={newStageNameForEdit}
                    onChange={(e) => setNewStageNameForEdit(e.target.value)}
                    className="mt-2"
                />
            </div>
            <DialogFooter>
                <Button variant="outline" onClick={() => setIsEditStageDialogOpen(false)}>Cancelar</Button>
                <Button onClick={handleConfirmEditStage}>Salvar Alterações</Button>
            </DialogFooter>
        </DialogContent>
      </Dialog>
      
      <AlertDialog open={isDeleteStageDialogOpen} onOpenChange={setIsDeleteStageDialogOpen}>
        <AlertDialogContent>
            <AlertDialogHeader>
                <AlertDialogTitle>Você tem certeza?</AlertDialogTitle>
                <AlertDialogDescription>
                    Isso excluirá permanentemente a etapa <span className="font-bold">{stageToDeleteConfirmation}</span> da lista e de todos os produtos que a utilizam. Esta ação não pode ser desfeita.
                </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
                <AlertDialogCancel>Cancelar</AlertDialogCancel>
                <AlertDialogAction onClick={handleConfirmDeleteStage} className="bg-destructive hover:bg-destructive/90">
                    Sim, excluir etapa
                </AlertDialogAction>
            </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
