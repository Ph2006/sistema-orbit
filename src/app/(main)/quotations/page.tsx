"use client";

import { useState, useEffect, useMemo } from "react";
import { useForm, useFieldArray } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { collection, getDocs, addDoc, doc, updateDoc, deleteDoc, Timestamp, getDoc, setDoc } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { PlusCircle, Search, Pencil, Trash2, CalendarIcon, X, PackagePlus, Percent, DollarSign, FileText, Check, FileDown, Copy, Package, ChevronUp, ChevronDown } from "lucide-react";
import { useAuth } from "../layout";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { useRouter } from "next/navigation";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";


import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Sheet, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { Skeleton } from "@/components/ui/skeleton";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { cn } from "@/lib/utils";
import { Separator } from "@/components/ui/separator";
import { StatCard } from "@/components/dashboard/stat-card";
import { Checkbox } from "@/components/ui/checkbox";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";


const itemSchema = z.object({
  id: z.string().optional(),
  code: z.string().optional(),
  description: z.string().min(3, "A descrição é obrigatória."),
  quantity: z.coerce.number().min(1, "A quantidade deve ser pelo menos 1."),
  unitPrice: z.coerce.number().min(0, "O preço não pode ser negativo."),
  unitWeight: z.coerce.number().min(0).optional(),
  taxRate: z.coerce.number().min(0).optional(),
  leadTimeDays: z.coerce.number().min(0).optional(),
  notes: z.string().optional(),
});

const quotationSchema = z.object({
  customer: z.object({
    id: z.string({ required_error: "Selecione um cliente." }),
    name: z.string(),
  }),
  buyerName: z.string().optional(),
  status: z.enum(["Aguardando Aprovação", "Enviado", "Aprovado", "Reprovado", "Informativo", "Expirado", "Pedido Gerado"], { required_error: "Selecione um status." }),
  validity: z.date({ required_error: "A data de validade é obrigatória." }),
  paymentTerms: z.string().min(3, "As condições de pagamento são obrigatórias."),
  deliveryTime: z.string().min(3, "O prazo de entrega é obrigatório."),
  notes: z.string().optional(),
  items: z.array(itemSchema).min(1, "Adicione pelo menos um item ao orçamento."),
  includedServices: z.array(z.string()).optional(),
});

const generateOrderSchema = z.object({
  poNumber: z.string().min(1, "O número do pedido de compra é obrigatório."),
});

type Quotation = z.infer<typeof quotationSchema> & { id: string, createdAt: Timestamp, number: number };
type Customer = { id: string, nomeFantasia: string };
type Item = z.infer<typeof itemSchema>;
type CompanyData = {
    nomeFantasia?: string;
    logo?: { preview?: string };
    endereco?: string;
    cnpj?: string;
    email?: string;
    celular?: string;
    website?: string;
};

// Tipo para os produtos cadastrados
type Product = {
    id: string;
    code: string;
    description: string;
    unitPrice: number;
    unitWeight?: number;
    productionPlanTemplate?: Array<{
        stageName: string;
        durationDays?: number;
    }>;
};

const serviceOptions = [
    { id: 'materialSupply', label: 'Fornecimento de Material' },
    { id: 'machining', label: 'Usinagem' },
    { id: 'heatTreatment', label: 'Tratamento Térmico' },
    { id: 'certification', label: 'Documentação para Data Book' },
    { id: 'manufacture', label: 'Fabricação' },
    { id: 'nonDestructiveTest', label: 'Ensaio Não Destrutivo' },
    { id: 'surfaceTreatment', label: 'Tratamento de Superfície' },
    { id: 'beneficiamento', label: 'Beneficiamento (Emborrachamento e Galvanização)' },
    { id: 'fasteners', label: 'Itens de fixação' },
];

const calculateItemTotals = (item: Item | any) => {
    const quantity = Number(item.quantity) || 0;
    const unitPrice = Number(item.unitPrice) || 0;
    const taxRate = Number(item.taxRate) || 0;

    const totalPrice = quantity * unitPrice;
    const taxAmount = totalPrice * (taxRate / 100);
    const totalWithTax = totalPrice + taxAmount;
    
    return { totalPrice, taxAmount, totalWithTax };
};

const calculateGrandTotal = (items: Item[] | any[]) => {
    if (!items) return 0;
    return items.reduce((acc, item) => {
        const { totalWithTax } = calculateItemTotals(item);
        return acc + totalWithTax;
    }, 0);
};

// Função para calcular o lead time total de um produto
const calculateLeadTime = (product: Product): number => {
    if (!product.productionPlanTemplate || product.productionPlanTemplate.length === 0) {
        return 0;
    }
    
    const totalDays = product.productionPlanTemplate.reduce((total, stage) => {
        return total + (stage.durationDays || 0);
    }, 0);
    
    return Math.round(totalDays);
};

// Função utilitária para normalizar valores de item
const normalizeItemValues = (item: any): Item => {
    return {
        ...item,
        quantity: Number(item.quantity) || 0,
        unitPrice: Number(item.unitPrice) || 0,
        unitWeight: Number(item.unitWeight) || 0,
        taxRate: Number(item.taxRate) || 0,
        leadTimeDays: item.leadTimeDays ? Number(item.leadTimeDays) || 0 : undefined,
        code: item.code || '',
        description: item.description || '',
        notes: item.notes || '',
    };
};

export default function QuotationsPage() {
    const [quotations, setQuotations] = useState<Quotation[]>([]);
    const [customers, setCustomers] = useState<Customer[]>([]);
    const [products, setProducts] = useState<Product[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [isFormOpen, setIsFormOpen] = useState(false);
    const [isViewSheetOpen, setIsViewSheetOpen] = useState(false);
    const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
    const [selectedQuotation, setSelectedQuotation] = useState<Quotation | null>(null);
    const [quotationToDelete, setQuotationToDelete] = useState<Quotation | null>(null);
    const [searchQuery, setSearchQuery] = useState("");
    const { toast } = useToast();
    const { user, loading: authLoading } = useAuth();
    const router = useRouter();

    // Estados para controle de senha
    const [isAuthenticated, setIsAuthenticated] = useState(false);
    const [passwordInput, setPasswordInput] = useState("");
    const [isPasswordDialogOpen, setIsPasswordDialogOpen] = useState(true);
    const [passwordAttempts, setPasswordAttempts] = useState(0);
    const CORRECT_PASSWORD = "OP4484210640";
    const MAX_ATTEMPTS = 3;

    // State for the temporary item form
    const emptyItem: Item = { description: "", quantity: 1, unitPrice: 0, code: '', unitWeight: 0, taxRate: 0, notes: '' };
    const [currentItem, setCurrentItem] = useState<Item>(emptyItem);
    const [editIndex, setEditIndex] = useState<number | null>(null);

    // Estados para busca de produtos
    const [isProductSearchOpen, setIsProductSearchOpen] = useState(false);
    const [productSearchQuery, setProductSearchQuery] = useState("");

    // Generate Order Dialog State
    const [isGenerateOrderDialogOpen, setIsGenerateOrderDialogOpen] = useState(false);
    const [quotationToConvert, setQuotationToConvert] = useState<Quotation | null>(null);

    // Função para verificar a senha
    const handlePasswordSubmit = () => {
        if (passwordInput === CORRECT_PASSWORD) {
            setIsAuthenticated(true);
            setIsPasswordDialogOpen(false);
            setPasswordInput("");
            setPasswordAttempts(0);
            toast({
                title: "Acesso autorizado",
                description: "Bem-vindo à seção de orçamentos.",
            });
        } else {
            const newAttempts = passwordAttempts + 1;
            setPasswordAttempts(newAttempts);
            setPasswordInput("");
            
            if (newAttempts >= MAX_ATTEMPTS) {
                toast({
                    variant: "destructive",
                    title: "Acesso negado",
                    description: "Muitas tentativas incorretas. Redirecionando...",
                });
                setTimeout(() => {
                    router.push('/');
                }, 2000);
            } else {
                toast({
                    variant: "destructive",
                    title: "Senha incorreta",
                    description: `Tentativa ${newAttempts} de ${MAX_ATTEMPTS}. Tente novamente.`,
                });
            }
        }
    };

    // Função para lidar com o pressionamento da tecla Enter
    const handlePasswordKeyPress = (e: React.KeyboardEvent) => {
        if (e.key === 'Enter') {
            handlePasswordSubmit();
        }
    };

    const form = useForm<z.infer<typeof quotationSchema>>({
        resolver: zodResolver(quotationSchema),
        defaultValues: {
            status: "Aguardando Aprovação",
            items: [],
            includedServices: [],
        }
    });

    const generateOrderForm = useForm<z.infer<typeof generateOrderSchema>>({
        resolver: zodResolver(generateOrderSchema),
        defaultValues: {
          poNumber: "",
        },
    });

    const { fields, append, remove, update } = useFieldArray({
        control: form.control,
        name: "items"
    });
    
    const watchedItems = form.watch("items");
    const grandTotal = useMemo(() => calculateGrandTotal(watchedItems), [watchedItems]);

    // Busca produtos filtrados para o modal
    const filteredProducts = useMemo(() => {
        const query = productSearchQuery.toLowerCase();
        return products.filter(product => 
            product.code.toLowerCase().includes(query) ||
            product.description.toLowerCase().includes(query)
        );
    }, [products, productSearchQuery]);

    const fetchCustomers = async () => {
        if (!user) return;
        try {
          const querySnapshot = await getDocs(collection(db, "companies", "mecald", "customers"));
          const customersList = querySnapshot.docs.map((doc) => ({
            id: doc.id,
            nomeFantasia: doc.data().nomeFantasia || doc.data().name || "Cliente sem nome",
          })) as Customer[];
          setCustomers(customersList);
        } catch (error) {
          console.error("Error fetching customers:", error);
        }
    };

    // Função para buscar produtos cadastrados
    const fetchProducts = async () => {
        if (!user) return;
        try {
            const querySnapshot = await getDocs(collection(db, "companies", "mecald", "products"));
            const productsList = querySnapshot.docs.map((doc) => {
                const data = doc.data();
                return {
                    id: doc.id,
                    code: data.code || "",
                    description: data.description || "",
                    unitPrice: Number(data.unitPrice) || 0,
                    unitWeight: Number(data.unitWeight) || 0,
                    productionPlanTemplate: data.productionPlanTemplate || [],
                } as Product;
            });
            setProducts(productsList);
        } catch (error) {
            console.error("Error fetching products:", error);
            toast({
                variant: "destructive",
                title: "Erro ao buscar produtos",
                description: "Não foi possível carregar o catálogo de produtos.",
            });
        }
    };
    
    const fetchQuotations = async () => {
        if (!user) return;
        setIsLoading(true);

        const mapStatus = (status?: string): string => {
            const originalStatus = status?.trim();
            if (!originalStatus) {
                return "Aguardando Aprovação";
            }
            const lowerCaseStatus = originalStatus.toLowerCase();

            const translations: { [key: string]: string } = {
                'approved': 'Aprovado', 'aprovado': 'Aprovado',
                'awaiting approval': 'Aguardando Aprovação', 'aguardando aprovação': 'Aguardando Aprovação',
                'pending': 'Aguardando Aprovação', 'pendente': 'Aguardando Aprovação',
                'rejected': 'Reprovado', 'reprovado': 'Reprovado', 'recusado': 'Reprovado', 'cancelado': 'Reprovado',
                'sent': 'Enviado', 'enviado': 'Enviado',
                'informative': 'Informativo', 'informativo': 'Informativo',
                'expired': 'Expirado', 'expirado': 'Expirado',
            };

            return translations[lowerCaseStatus] || originalStatus;
        };

        try {
            const querySnapshot = await getDocs(collection(db, "companies", "mecald", "quotations"));
            const quotationsList = querySnapshot.docs.map(doc => {
                const data = doc.data();

                let finalItems = (data.items || []).map((item: any) => ({
                    id: item.id || undefined,
                    code: item.code || '',
                    description: item.description || '',
                    quantity: item.quantity || 1,
                    unitPrice: item.unitPrice || 0,
                    unitWeight: item.unitWeight || 0,
                    taxRate: item.taxRate || 0,
                    leadTimeDays: item.leadTimeDays || undefined,
                    notes: item.notes || '',
                }));

                if (finalItems.length === 0 && Array.isArray(data.includedServices) && data.includedServices.length > 0) {
                    finalItems = data.includedServices.map((service: string) => ({
                        description: service,
                        quantity: 1,
                        unitPrice: 0,
                        code: '', unitWeight: 0, taxRate: 0, notes: ''
                    }));
                }

                if (finalItems.length === 0) {
                    finalItems.push({ description: "Nenhum item/serviço especificado", quantity: 1, unitPrice: 0 });
                }

                const getCreatedAt = () => {
                    if (!data.createdAt) return Timestamp.now();
                    if (data.createdAt.toDate) return data.createdAt;
                    if (typeof data.createdAt === 'string') return Timestamp.fromDate(new Date(data.createdAt));
                    return Timestamp.now();
                }

                const getValidity = () => {
                    if (data.validity?.toDate) return data.validity.toDate();
                    if (data.expiresAt) return new Date(data.expiresAt);
                    return new Date();
                }

                return {
                    id: doc.id,
                    number: data.number || 0,
                    customer: { 
                        id: data.customerId || (data.customer?.id || ''), 
                        name: data.customerName || (data.customer?.name || 'N/A') 
                    },
                    buyerName: data.buyerName || '',
                    status: mapStatus(data.status),
                    validity: getValidity(),
                    paymentTerms: data.paymentTerms || 'A combinar',
                    deliveryTime: data.deliveryTerms || data.deliveryTime || 'A combinar',
                    notes: data.notes || '',
                    items: finalItems,
                    includedServices: data.includedServices || [],
                    createdAt: getCreatedAt(),
                } as Quotation;
            });
            setQuotations(quotationsList.sort((a, b) => (b.number || 0) - (a.number || 0)));
        } catch (error) {
            console.error("Error fetching quotations:", error);
            toast({
                variant: "destructive",
                title: "Erro ao buscar orçamentos",
                description: "Ocorreu um erro ao carregar os dados. Verifique o console para mais detalhes.",
            });
        } finally {
            setIsLoading(false);
        }
    };

    useEffect(() => {
        if (!authLoading && user && isAuthenticated) {
            fetchCustomers();
            fetchProducts();
            fetchQuotations();
        }
    }, [user, authLoading, isAuthenticated]);
    
    const onSubmit = async (values: z.infer<typeof quotationSchema>) => {
        try {
            const itemsWithTotals = values.items.map(item => {
                const { totalPrice, taxAmount, totalWithTax } = calculateItemTotals(item);
                // Explicitly create the object to save, excluding the react-hook-form 'id'
                return {
                    code: item.code || '',
                    description: item.description,
                    quantity: item.quantity,
                    unitPrice: item.unitPrice,
                    unitWeight: item.unitWeight || 0,
                    taxRate: item.taxRate || 0,
                    leadTimeDays: item.leadTimeDays || 0,
                    notes: item.notes || '',
                    // Calculated fields
                    totalPrice,
                    taxAmount,
                    totalWithTax,
                    totalWeight: (item.quantity || 0) * (item.unitWeight || 0)
                };
            });

            let dataToSave: any = {
                ...values,
                items: itemsWithTotals,
                customerName: values.customer.name,
                customerId: values.customer.id,
                updatedAt: Timestamp.now(),
                validity: Timestamp.fromDate(values.validity),
            };
            // @ts-ignore
            delete dataToSave.customer;

            if (selectedQuotation) {
                dataToSave.createdAt = selectedQuotation.createdAt;
                dataToSave.number = selectedQuotation.number;
                const quotationRef = doc(db, "companies", "mecald", "quotations", selectedQuotation.id);
                await updateDoc(quotationRef, dataToSave);
                toast({ title: "Orçamento atualizado!" });
            } else {
                const highestNumber = quotations.length > 0
                    ? Math.max(...quotations.map(q => q.number || 0))
                    : 0;
                dataToSave.number = highestNumber + 1;
                dataToSave.createdAt = Timestamp.now();
                await addDoc(collection(db, "companies", "mecald", "quotations"), dataToSave);
                toast({ title: "Orçamento criado!" });
            }

            // Update products catalog
            const productsCollectionRef = collection(db, "companies", "mecald", "products");
            for (const item of values.items) {
                if (item.code && item.code.trim() !== "") {
                    const productRef = doc(productsCollectionRef, item.code);
                    const productData = {
                        code: item.code,
                        description: item.description,
                        unitPrice: item.unitPrice,
                        unitWeight: item.unitWeight || 0,
                        taxRate: item.taxRate || 0,
                        updatedAt: Timestamp.now(),
                    };
                    await setDoc(productRef, productData, { merge: true });
                }
            }
            
            form.reset();
            setIsFormOpen(false);
            setSelectedQuotation(null);
            await fetchQuotations();
        } catch (error) {
            console.error("Error saving quotation: ", error);
            toast({ variant: "destructive", title: "Erro ao salvar" });
        }
    };

    const handleCurrentItemChange = (field: keyof Item, value: any) => {
        let processedValue = value;
        
        // Converter campos numéricos para number se necessário
        if (['quantity', 'unitPrice', 'unitWeight', 'taxRate', 'leadTimeDays'].includes(field)) {
            // Se o valor é uma string vazia, manter como vazio para o input
            if (value === '') {
                processedValue = '';
            } else {
                // Converter para número, ou 0 se inválido
                const numValue = Number(value);
                processedValue = isNaN(numValue) ? 0 : numValue;
            }
        }
        
        setCurrentItem(prev => ({...prev, [field]: processedValue}));
    };

    // Função para adicionar produto do catálogo ao item atual
    const handleSelectProduct = (product: Product) => {
        const leadTime = calculateLeadTime(product);
        setCurrentItem({
            code: product.code,
            description: product.description,
            quantity: Number(currentItem.quantity) || 1,
            unitPrice: Number(product.unitPrice) || 0,
            unitWeight: Number(product.unitWeight) || 0,
            taxRate: 0,
            leadTimeDays: leadTime > 0 ? leadTime : undefined,
            notes: ''
        });
        setIsProductSearchOpen(false);
        setProductSearchQuery("");
        toast({
            title: "Produto adicionado!",
            description: `${product.description} foi adicionado ao formulário.`,
        });
    };

    const handleAddItem = () => {
        const normalizedItem = normalizeItemValues(currentItem);
        const result = itemSchema.safeParse(normalizedItem);
        if (!result.success) {
            const firstError = result.error.errors[0];
            toast({
                variant: 'destructive',
                title: `Erro de validação: ${firstError.path[0]}`,
                description: firstError.message
            });
            return;
        }
        append(normalizedItem);
        setCurrentItem(emptyItem);
    };

    const handleUpdateItem = () => {
        if (editIndex === null) return;
        const normalizedItem = normalizeItemValues(currentItem);
        const result = itemSchema.safeParse(normalizedItem);
        if (!result.success) {
            const firstError = result.error.errors[0];
            toast({
                variant: 'destructive',
                title: `Erro de validação: ${firstError.path[0]}`,
                description: firstError.message
            });
            return;
        }
        update(editIndex, normalizedItem);
        setCurrentItem(emptyItem);
        setEditIndex(null);
    };

    const handleEditItem = (index: number) => {
        const item = watchedItems[index];
        // Normalizar valores antes de editar
        setCurrentItem(normalizeItemValues(item));
        setEditIndex(index);
    };

    const handleCancelEdit = () => {
        setCurrentItem(emptyItem);
        setEditIndex(null);
    }

    const handleDuplicateItem = (index: number) => {
        const itemToDuplicate = watchedItems[index];
        // Create a copy of the item with a modified description to indicate it's a duplicate
        const duplicatedItem = {
            ...itemToDuplicate,
            description: `${itemToDuplicate.description} (Cópia)`,
            quantity: 1 // Reset quantity to 1 for the duplicate
        };
        
        // Add the duplicated item to the end of the list
        append(duplicatedItem);
        
        toast({
            title: "Item duplicado!",
            description: "O item foi duplicado e adicionado ao final da lista. Você pode editá-lo conforme necessário.",
        });
    };

    const handleMoveItemUp = (index: number) => {
        if (index === 0) return; // Não pode mover o primeiro item para cima
        
        const currentItem = watchedItems[index];
        const previousItem = watchedItems[index - 1];
        
        // Trocar as posições
        update(index - 1, currentItem);
        update(index, previousItem);
        
        toast({
            title: "Item movido!",
            description: "O item foi movido para cima na lista.",
        });
    };

    const handleMoveItemDown = (index: number) => {
        if (index === watchedItems.length - 1) return; // Não pode mover o último item para baixo
        
        const currentItem = watchedItems[index];
        const nextItem = watchedItems[index + 1];
        
        // Trocar as posições
        update(index, nextItem);
        update(index + 1, currentItem);
        
        toast({
            title: "Item movido!",
            description: "O item foi movido para baixo na lista.",
        });
    };
    
    const handleAddClick = () => {
        setSelectedQuotation(null);
        form.reset({
            customer: undefined,
            buyerName: "",
            status: "Aguardando Aprovação",
            validity: new Date(new Date().setDate(new Date().getDate() + 15)),
            paymentTerms: "A combinar",
            deliveryTime: "A combinar",
            notes: "",
            items: [],
            includedServices: [],
        });
        setCurrentItem(emptyItem);
        setEditIndex(null);
        setIsFormOpen(true);
    };

    const handleEditClick = (quotation: Quotation) => {
        setSelectedQuotation(quotation);
        form.reset({
            ...quotation,
            validity: quotation.validity instanceof Date ? quotation.validity : (quotation.validity as any).toDate(),
        });
        setCurrentItem(emptyItem);
        setEditIndex(null);
        setIsFormOpen(true);
    };

    const handleDuplicateQuotation = async (quotation: Quotation) => {
        try {
            // Create a copy of the quotation with modified details
            const duplicatedQuotation = {
                ...quotation,
                status: "Aguardando Aprovação" as const,
                validity: new Date(new Date().setDate(new Date().getDate() + 15)), // Set validity to 15 days from now
                notes: quotation.notes ? `${quotation.notes}\n\n[Baseado no orçamento Nº ${quotation.number}]` : `Baseado no orçamento Nº ${quotation.number}`,
            };

            // Remove fields that shouldn't be copied
            delete (duplicatedQuotation as any).id;
            delete (duplicatedQuotation as any).createdAt;
            delete (duplicatedQuotation as any).number;

            // Open form with the duplicated data
            setSelectedQuotation(null); // Ensure it's treated as a new quotation
            form.reset(duplicatedQuotation);
            setCurrentItem(emptyItem);
            setEditIndex(null);
            setIsFormOpen(true);

            toast({
                title: "Orçamento duplicado!",
                description: `Os dados do orçamento Nº ${quotation.number} foram copiados. Ajuste conforme necessário antes de salvar.`,
            });
        } catch (error) {
            console.error("Error duplicating quotation:", error);
            toast({
                variant: "destructive",
                title: "Erro ao duplicar orçamento",
                description: "Ocorreu um erro ao duplicar o orçamento. Tente novamente.",
            });
        }
    };
    
    const handleDeleteClick = (quotation: Quotation) => {
        setQuotationToDelete(quotation);
        setIsDeleteDialogOpen(true);
    };

    const handleConfirmDelete = async () => {
        if (!quotationToDelete) return;
        try {
            await deleteDoc(doc(db, "companies", "mecald", "quotations", quotationToDelete.id));
            toast({ title: "Orçamento excluído!" });
            setQuotationToDelete(null);
            setIsDeleteDialogOpen(false);
            await fetchQuotations();
        } catch (error) {
            toast({ variant: "destructive", title: "Erro ao excluir" });
        }
    };
    
    const handleViewQuotation = (quotation: Quotation) => {
        setSelectedQuotation(quotation);
        setIsViewSheetOpen(true);
    };

    const handleGenerateOrder = (quotation: Quotation) => {
        if (!quotation) return;
        setQuotationToConvert(quotation);
        generateOrderForm.reset({ poNumber: '' });
        setIsGenerateOrderDialogOpen(true);
    };

    const onConfirmGenerateOrder = async (values: z.infer<typeof generateOrderSchema>) => {
        if (!quotationToConvert) return;
    
        try {
            const productsRef = collection(db, "companies", "mecald", "products");
            const itemsForOrder = await Promise.all(
                quotationToConvert.items.map(async (item, index) => {
                    let productionPlan: any[] = [];
                    if (item.code) {
                        try {
                            const productDoc = await getDoc(doc(productsRef, item.code));
                            if (productDoc.exists()) {
                                const productData = productDoc.data();
                                const planTemplate = productData.productionPlanTemplate || [];
                                if (planTemplate.length > 0) {
                                    productionPlan = planTemplate.map((stage: any) => ({
                                        ...stage,
                                        status: "Pendente",
                                        startDate: null,
                                        completedDate: null,
                                    }));
                                }
                            }
                        } catch (e) {
                             console.error(`Could not fetch product with code ${item.code}`, e);
                        }
                    }
                    
                    const itemDeliveryDate = item.leadTimeDays
                        ? new Date(new Date().setDate(new Date().getDate() + item.leadTimeDays))
                        : quotationToConvert.validity;
    
                    return {
                        id: `${quotationToConvert.id}-${index}`,
                        code: item.code || '',
                        description: item.description,
                        quantity: Number(item.quantity) || 0,
                        unitWeight: Number(item.unitWeight) || 0,
                        productionPlan: productionPlan,
                        itemDeliveryDate: itemDeliveryDate, // Keep as JS Date for now
                        shippingList: '',
                        invoiceNumber: '',
                        shippingDate: null,
                    };
                })
            );
    
            const orderData = {
                quotationId: quotationToConvert.id,
                quotationNumber: values.poNumber,
                internalOS: quotationToConvert.number.toString(),
                customer: quotationToConvert.customer,
                projectName: `Ref. Orçamento ${quotationToConvert.number}`,
                items: itemsForOrder.map(item => ({
                    ...item,
                    itemDeliveryDate: item.itemDeliveryDate ? Timestamp.fromDate(new Date(item.itemDeliveryDate)) : null,
                })),
                totalValue: calculateGrandTotal(quotationToConvert.items),
                status: "Aguardando Produção",
                createdAt: Timestamp.now(),
                deliveryDate: Timestamp.fromDate(quotationToConvert.validity),
            };
    
            await addDoc(collection(db, "companies", "mecald", "orders"), orderData);
            
            const quotationRef = doc(db, "companies", "mecald", "quotations", quotationToConvert.id);
            await updateDoc(quotationRef, { status: "Pedido Gerado" });
    
            toast({
                title: "Pedido gerado com sucesso!",
                description: `O pedido para o orçamento Nº ${quotationToConvert.number} foi criado.`,
            });
            
            setIsGenerateOrderDialogOpen(false);
            setIsViewSheetOpen(false);
            await fetchQuotations();
            router.push('/orders');
        } catch (error) {
            console.error("Error generating order:", error);
            toast({
                variant: "destructive",
                title: "Erro ao gerar pedido",
                description: "Ocorreu um erro ao criar o pedido. Tente novamente.",
            });
        }
    };

    const handleExport = async (formatType: 'pdf' | 'excel') => {
        if (!selectedQuotation) return;
    
        toast({ title: "Exportando...", description: `Gerando ${formatType.toUpperCase()} do orçamento Nº ${selectedQuotation.number}.` });
    
        try {
            const companyRef = doc(db, "companies", "mecald", "settings", "company");
            const docSnap = await getDoc(companyRef);
            const companyData: CompanyData = docSnap.exists() ? docSnap.data() as CompanyData : {};
            const { items, customer, number, validity, paymentTerms, deliveryTime, notes, includedServices } = selectedQuotation;
            const grandTotal = calculateGrandTotal(items);
    
            if (formatType === 'pdf') {
                const docPdf = new jsPDF({ orientation: "landscape" });
                const pageHeight = docPdf.internal.pageSize.height;
                const pageWidth = docPdf.internal.pageSize.width;
                let y = 15;
    
                if (companyData.logo?.preview) {
                    try { 
                        docPdf.addImage(companyData.logo.preview, 'PNG', 15, y, 40, 20, undefined, 'FAST'); 
                    }
                    catch (e) { console.error("Error adding logo to PDF:", e); }
                }

                const rightColX = pageWidth - 15;
                let companyInfoY = y + 5;
                docPdf.setFontSize(16).setFont(undefined, 'bold');
                docPdf.text(companyData.nomeFantasia || 'Sua Empresa', rightColX, companyInfoY, { align: 'right' });
                
                docPdf.setFontSize(9).setFont(undefined, 'normal');
                companyInfoY += 6;
                if (companyData.endereco) {
                    const addressLines = docPdf.splitTextToSize(companyData.endereco, 80);
                    docPdf.text(addressLines, rightColX, companyInfoY, { align: 'right' });
                    companyInfoY += (addressLines.length * 4);
                }
                if (companyData.cnpj) {
                    docPdf.text(`CNPJ: ${companyData.cnpj}`, rightColX, companyInfoY, { align: 'right' });
                    companyInfoY += 4;
                }
                if (companyData.email) {
                    docPdf.text(`Email: ${companyData.email}`, rightColX, companyInfoY, { align: 'right' });
                }

                y = 60;

                docPdf.setFontSize(14).setFont(undefined, 'bold').text(`Orçamento Nº ${number}`, pageWidth / 2, y, { align: 'center' });
                y += 15;

                docPdf.setFontSize(11).setFont(undefined, 'normal');
                docPdf.text(`Cliente: ${customer.name}`, 15, y);
                docPdf.text(`Data: ${format(new Date(), "dd/MM/yyyy")}`, rightColX, y, { align: 'right' });
                y += 5;
                if (selectedQuotation.buyerName) {
                    docPdf.text(`Comprador: ${selectedQuotation.buyerName}`, 15, y);
                }
                docPdf.text(`Validade: ${format(validity, "dd/MM/yyyy")}`, rightColX, y, { align: 'right' });
                y += 10;
    
                // Calcular peso total
                const totalWeight = items.reduce((acc, item) => {
                    const itemWeight = (item.quantity || 0) * (item.unitWeight || 0);
                    return acc + itemWeight;
                }, 0);

                const head = [['Cód.', 'Item', 'Qtd', 'Peso Unit.', 'Peso Total', 'Lead Time', 'Preço Unit. s/ Imp.', 'Imposto (%)', 'Total c/ Imp.']];
                const body = items.map(item => {
                    const itemTotalWeight = (item.quantity || 0) * (item.unitWeight || 0);
                    return [
                        item.code || '-',
                        item.description,
                        item.quantity,
                        item.unitWeight && Number(item.unitWeight) > 0 ? `${Number(item.unitWeight).toLocaleString('pt-BR')} kg` : '-',
                        itemTotalWeight > 0 ? `${itemTotalWeight.toLocaleString('pt-BR')} kg` : '-',
                        item.leadTimeDays ? `${item.leadTimeDays} dias` : '-',
                        item.unitPrice.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }),
                        (item.taxRate || 0).toLocaleString('pt-BR'),
                        calculateItemTotals(item).totalWithTax.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }),
                    ];
                });

                // Adicionar linha de totais
                body.push([
                    '', 
                    'TOTAL:', 
                    '', 
                    '', 
                    totalWeight > 0 ? `${totalWeight.toLocaleString('pt-BR')} kg` : '-', 
                    '', 
                    '', 
                    '', 
                    grandTotal.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
                ]);
                autoTable(docPdf, {
                    startY: y,
                    head,
                    body,
                    styles: { fontSize: 8 },
                    headStyles: { fillColor: [37, 99, 235], fontSize: 9, textColor: 255 },
                    columnStyles: {
                        0: { cellWidth: 30 },
                        1: { cellWidth: 'auto' },
                        2: { cellWidth: 15, halign: 'right' },
                        3: { cellWidth: 25, halign: 'right' },
                        4: { cellWidth: 25, halign: 'right' },
                        5: { cellWidth: 20, halign: 'center' },
                        6: { cellWidth: 30, halign: 'right' },
                        7: { cellWidth: 20, halign: 'right' },
                        8: { cellWidth: 35, halign: 'right' },
                    },
                    didParseCell: function (data: any) {
                        // Destacar a linha de total (última linha)
                        if (data.row.index === body.length - 1) {
                            data.cell.styles.fontStyle = 'bold';
                            data.cell.styles.fillColor = [240, 240, 240];
                        }
                    }
                });
                y = (docPdf as any).lastAutoTable.finalY + 10;
    
                if (includedServices && includedServices.length > 0) {
                    if (y > pageHeight - 40) { y = 20; docPdf.addPage(); }
                    docPdf.setFontSize(11).setFont(undefined, 'bold').text('Serviços Inclusos:', 15, y);
                    y += 6;
                    docPdf.setFontSize(10).setFont(undefined, 'normal');
                    includedServices.forEach(serviceId => {
                        const service = serviceOptions.find(s => s.id === serviceId);
                        docPdf.text(`- ${service ? service.label : serviceId}`, 18, y);
                        y += 5;
                        if (y > pageHeight - 20) { y = 20; docPdf.addPage(); }
                    });
                }
                
                y += 5;
                if (y > pageHeight - 40) { y = 20; docPdf.addPage(); }
                docPdf.setFontSize(11).setFont(undefined, 'bold').text('Condições Comerciais:', 15, y);
                y += 6;
                docPdf.setFontSize(10).setFont(undefined, 'normal');
                docPdf.text(`Pagamento: ${paymentTerms}`, 18, y);
                y+= 5;
                docPdf.text(`Prazo de Entrega: ${deliveryTime}`, 18, y);
                y += 10;
    
                if (notes) {
                    if (y > pageHeight - 40) { y = 20; docPdf.addPage(); }
                    docPdf.setFontSize(11).setFont(undefined, 'bold').text('Observações:', 15, y);
                    y += 6;
                    const splitNotes = docPdf.splitTextToSize(notes, pageWidth - 30);
                    docPdf.setFontSize(10).setFont(undefined, 'normal').text(splitNotes, 15, y);
                }
    
                if (companyData.website) {
                    docPdf.setTextColor(0, 0, 255);
                    docPdf.textWithLink(companyData.website, 15, pageHeight - 10, { url: companyData.website || '#' });
                }
    
                docPdf.save(`Orcamento_${number}.pdf`);
    
            } else if (formatType === 'excel') {
                const XLSX = await import('xlsx');

                // Calcular peso total para Excel
                const totalWeightExcel = items.reduce((acc, item) => {
                    const itemWeight = (item.quantity || 0) * (item.unitWeight || 0);
                    return acc + itemWeight;
                }, 0);

                const ws_data = [
                    [companyData.nomeFantasia || ''],
                    [companyData.endereco || ''],
                    [`CNPJ: ${companyData.cnpj || ''}`],
                    [],
                    [`Orçamento Nº ${number}`],
                    [`Cliente: ${customer.name}`, `Data: ${format(new Date(), "dd/MM/yyyy")}`],
                    ['', `Validade: ${format(validity, "dd/MM/yyyy")}`],
                    [],
                    ['Item', 'Código', 'Qtd', 'Peso Unit.', 'Peso Total', 'Lead Time (dias)', 'Preço Unit. s/ Imp.', 'Imposto (%)', 'Total c/ Imp.'],
                    ...items.map(item => {
                        const itemTotalWeight = (item.quantity || 0) * (item.unitWeight || 0);
                        return [
                            item.description,
                            item.code,
                            item.quantity,
                            item.unitWeight || 0,
                            itemTotalWeight,
                            item.leadTimeDays || 0,
                            item.unitPrice,
                            item.taxRate || 0,
                            calculateItemTotals(item).totalWithTax
                        ];
                    }),
                    [],
                    ['TOTAL:', '', '', '', totalWeightExcel > 0 ? totalWeightExcel : '', '', '', 'Valor Total:', grandTotal],
                    [],
                    ['Serviços Inclusos:'],
                    ...(includedServices || []).map(s => [serviceOptions.find(opt => opt.id === s)?.label || s]),
                    [],
                    ['Condições Comerciais:'],
                    [`Pagamento: ${paymentTerms}`],
                    [`Prazo de Entrega: ${deliveryTime}`],
                    [],
                    ['Observações:'],
                    [notes || ''],
                    [],
                    [{v: companyData.website || 'Website não informado', l: { Target: companyData.website || '#' }}]
                ];
                const ws = XLSX.utils.aoa_to_sheet(ws_data);
                const wb = XLSX.utils.book_new();
                XLSX.utils.book_append_sheet(wb, ws, `Orçamento ${number}`);
                XLSX.writeFile(wb, `Orcamento_${number}.xlsx`);
            }
            toast({ title: "Exportação concluída!", description: "Seu arquivo foi baixado." });
    
        } catch (error) {
            console.error("Export error:", error);
            toast({ variant: "destructive", title: "Erro na exportação", description: "Não foi possível gerar o arquivo." });
        }
    };
    
    const filteredQuotations = quotations.filter((q) => {
        const query = searchQuery.toLowerCase();
        return (
            (q.number?.toString() || '').toLowerCase().includes(query) ||
            q.customer.name.toLowerCase().includes(query) ||
            q.status.toLowerCase().includes(query)
        );
    });

    const getStatusVariant = (status: string): "default" | "secondary" | "destructive" | "outline" => {
        switch (status) {
            case "Aprovado": return "default";
            case "Pedido Gerado": return "default";
            case "Aguardando Aprovação": return "secondary";
            case "Enviado": return "secondary";
            case "Reprovado": return "destructive";
            case "Expirado": return "destructive";
            case "Informativo": return "outline";
            default: return "outline";
        }
    };

    const dashboardStats = useMemo(() => {
        if (!quotations || quotations.length === 0) {
            return { approvalRate: 0, issuedValue: 0, approvedValue: 0, totalCount: 0 };
        }

        const relevantQuotations = quotations.filter(q => q.status !== "Informativo");
        const approvedQuotations = relevantQuotations.filter(q => q.status === "Aprovado" || q.status === "Pedido Gerado");

        const totalCount = relevantQuotations.length;
        const approvedCount = approvedQuotations.length;
        const approvalRate = totalCount > 0 ? (approvedCount / totalCount) * 100 : 0;

        const issuedValue = relevantQuotations.reduce((acc, q) => acc + calculateGrandTotal(q.items), 0);
        const approvedValue = approvedQuotations.reduce((acc, q) => acc + calculateGrandTotal(q.items), 0);

        return { approvalRate, issuedValue, approvedValue, totalCount };
    }, [quotations]);

    // Se não estiver autenticado, mostra modal de senha
    if (!isAuthenticated) {
        return (
            <Dialog open={isPasswordDialogOpen} onOpenChange={() => {}}>
                <DialogContent className="sm:max-w-md" onPointerDownOutside={(e) => e.preventDefault()}>
                    <DialogHeader>
                        <DialogTitle className="text-center">Acesso Restrito</DialogTitle>
                        <DialogDescription className="text-center">
                            Esta seção requer uma senha de acesso.
                        </DialogDescription>
                    </DialogHeader>
                    <div className="space-y-4">
                        <div className="space-y-2">
                            <label htmlFor="password" className="text-sm font-medium">
                                Senha de Acesso
                            </label>
                            <Input
                                id="password"
                                type="password"
                                placeholder="Digite a senha..."
                                value={passwordInput}
                                onChange={(e) => setPasswordInput(e.target.value)}
                                onKeyPress={handlePasswordKeyPress}
                                className="w-full"
                            />
                        </div>
                        {passwordAttempts > 0 && (
                            <div className="text-sm text-destructive">
                                Tentativa {passwordAttempts} de {MAX_ATTEMPTS} - Senha incorreta
                            </div>
                        )}
                    </div>
                    <DialogFooter>
                        <Button 
                            variant="outline" 
                            onClick={() => router.push('/')}
                            className="w-full"
                        >
                            Cancelar
                        </Button>
                        <Button 
                            onClick={handlePasswordSubmit}
                            disabled={!passwordInput || passwordAttempts >= MAX_ATTEMPTS}
                            className="w-full"
                        >
                            Acessar
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        );
    }

    return (
        <>
            <div className="flex-1 space-y-4 p-4 md:p-8 pt-6">
                <div className="flex items-center justify-between space-y-2">
                    <h1 className="text-3xl font-bold tracking-tight font-headline">Orçamentos</h1>
                    <div className="flex items-center gap-2">
                        <div className="relative">
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                            <Input placeholder="Buscar orçamento..." value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} className="pl-9" />
                        </div>
                        <Button onClick={handleAddClick}>
                            <PlusCircle className="mr-2 h-4 w-4" />
                            Novo Orçamento
                        </Button>
                    </div>
                </div>

                <div className="mb-4 grid gap-4 md:grid-cols-3">
                    <StatCard
                        title="Taxa de Aprovação"
                        value={`${dashboardStats.approvalRate.toFixed(1)}%`}
                        icon={Percent}
                        description={`Baseado em ${dashboardStats.totalCount} orçamentos válidos`}
                    />
                    <StatCard
                        title="Valor Emitido (Total)"
                        value={dashboardStats.issuedValue.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                        icon={FileText}
                        description="Soma de todos os orçamentos válidos"
                    />
                    <StatCard
                        title="Valor Aprovado"
                        value={dashboardStats.approvedValue.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                        icon={DollarSign}
                        description="Soma de todos os orçamentos aprovados"
                    />
                </div>

                <Card>
                    <CardHeader>
                        <CardTitle>Lista de Orçamentos</CardTitle>
                        <CardDescription>Crie e gerencie os orçamentos para seus clientes.</CardDescription>
                    </CardHeader>
                    <CardContent>
                        {isLoading ? (
                            <div className="space-y-4">
                                <Skeleton className="h-10 w-full" />
                                <Skeleton className="h-10 w-full" />
                                <Skeleton className="h-10 w-full" />
                            </div>
                        ) : (
                            <Table>
                                <TableHeader>
                                    <TableRow>
                                        <TableHead className="w-[120px]">Nº Orçamento</TableHead>
                                        <TableHead>Cliente</TableHead>
                                        <TableHead className="w-[120px]">Criação</TableHead>
                                        <TableHead className="w-[150px]">Valor Total</TableHead>
                                        <TableHead className="w-[180px]">Status</TableHead>
                                        <TableHead className="w-[140px] text-right">Ações</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {filteredQuotations.length > 0 ? (
                                        filteredQuotations.map((q) => (
                                            <TableRow key={q.id} onClick={() => handleViewQuotation(q)} className="cursor-pointer">
                                                <TableCell className="font-medium">{q.number}</TableCell>
                                                <TableCell>{q.customer.name}</TableCell>
                                                <TableCell>{format(q.createdAt.toDate(), "dd/MM/yyyy")}</TableCell>
                                                <TableCell>
                                                    {calculateGrandTotal(q.items).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                                                </TableCell>
                                                <TableCell>
                                                    <Badge variant={getStatusVariant(q.status)} className={cn((q.status === 'Aprovado' || q.status === 'Pedido Gerado') && 'bg-green-600 hover:bg-green-700 text-primary-foreground')}>{q.status}</Badge>
                                                </TableCell>
                                                <TableCell className="text-right">
                                                    <div className="flex items-center justify-end gap-1">
                                                        <Button 
                                                            variant="ghost" 
                                                            size="icon" 
                                                            onClick={(e) => { 
                                                                e.stopPropagation(); 
                                                                handleDuplicateQuotation(q); 
                                                            }}
                                                            title="Duplicar orçamento"
                                                        >
                                                            <Copy className="h-4 w-4" />
                                                        </Button>
                                                        <Button variant="ghost" size="icon" onClick={(e) => { e.stopPropagation(); handleEditClick(q); }}>
                                                            <Pencil className="h-4 w-4" />
                                                        </Button>
                                                        <Button variant="ghost" size="icon" className="text-destructive hover:text-destructive" onClick={(e) => { e.stopPropagation(); handleDeleteClick(q); }}>
                                                            <Trash2 className="h-4 w-4" />
                                                        </Button>
                                                    </div>
                                                </TableCell>
                                            </TableRow>
                                        ))
                                    ) : (
                                        <TableRow>
                                            <TableCell colSpan={6} className="text-center h-24">Nenhum orçamento encontrado.</TableCell>
                                        </TableRow>
                                    )}
                                </TableBody>
                            </Table>
                        )}
                    </CardContent>
                </Card>
            </div>

            <Dialog open={isFormOpen} onOpenChange={setIsFormOpen}>
                <DialogContent className="max-w-7xl">
                    <DialogHeader>
                        <DialogTitle>{selectedQuotation ? "Editar Orçamento" : "Novo Orçamento"}</DialogTitle>
                        <DialogDescription>Preencha os detalhes do orçamento.</DialogDescription>
                    </DialogHeader>
                    <Form {...form}>
                        <form onSubmit={form.handleSubmit(onSubmit)}>
                            <ScrollArea className="h-[75vh] pr-6">
                                <div className="space-y-6 p-1">
                                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                                        <FormField control={form.control} name="customer" render={({ field }) => (
                                            <FormItem><FormLabel>Cliente</FormLabel>
                                                <Select onValueChange={(value) => {
                                                    const selectedCustomer = customers.find(c => c.id === value);
                                                    field.onChange({ id: value, name: selectedCustomer?.nomeFantasia || '' });
                                                }} defaultValue={field.value?.id}>
                                                    <FormControl><SelectTrigger><SelectValue placeholder="Selecione um cliente" /></SelectTrigger></FormControl>
                                                    <SelectContent>{customers.map(c => <SelectItem key={c.id} value={c.id}>{c.nomeFantasia}</SelectItem>)}</SelectContent>
                                                </Select><FormMessage />
                                            </FormItem>
                                        )} />
                                        <FormField control={form.control} name="buyerName" render={({ field }) => (
                                            <FormItem><FormLabel>Nome do Comprador</FormLabel><FormControl><Input placeholder="Contato que solicitou" {...field} value={field.value ?? ''}/></FormControl><FormMessage /></FormItem>
                                        )}/>
                                        <FormField control={form.control} name="status" render={({ field }) => (
                                            <FormItem><FormLabel>Status</FormLabel>
                                                <Select onValueChange={field.onChange} defaultValue={field.value}>
                                                    <FormControl><SelectTrigger><SelectValue placeholder="Selecione um status" /></SelectTrigger></FormControl>
                                                    <SelectContent>
                                                        <SelectItem value="Aguardando Aprovação">Aguardando Aprovação</SelectItem>
                                                        <SelectItem value="Enviado">Enviado</SelectItem>
                                                        <SelectItem value="Aprovado">Aprovado</SelectItem>
                                                        <SelectItem value="Reprovado">Reprovado</SelectItem>
                                                        <SelectItem value="Expirado">Expirado</SelectItem>
                                                        <SelectItem value="Informativo">Informativo</SelectItem>
                                                        <SelectItem value="Pedido Gerado">Pedido Gerado</SelectItem>
                                                    </SelectContent>
                                                </Select><FormMessage />
                                            </FormItem>
                                        )} />
                                    </div>
                                    
                                    <Card>
                                        <CardHeader>
                                            <CardTitle>Adicionar Novo Item</CardTitle>
                                            <CardDescription>
                                                Preencha os dados e adicione um novo item ao orçamento. Para editar itens existentes, clique no ícone de edição na lista abaixo.
                                            </CardDescription>
                                        </CardHeader>
                                        <CardContent className="space-y-4">
                                            <div className="flex items-center gap-2">
                                                <Button
                                                    type="button"
                                                    variant="outline"
                                                    onClick={() => setIsProductSearchOpen(true)}
                                                    className="mb-4"
                                                    disabled={editIndex !== null}
                                                >
                                                    <Package className="mr-2 h-4 w-4" />
                                                    Buscar no Catálogo
                                                </Button>
                                                {currentItem.code && editIndex === null && (
                                                    <Badge variant="secondary" className="mb-4">
                                                        Produto: {currentItem.code}
                                                    </Badge>
                                                )}
                                                {editIndex !== null && (
                                                    <Badge variant="outline" className="mb-4">
                                                        Editando item na linha {editIndex + 1}
                                                    </Badge>
                                                )}
                                            </div>
                                            <div>
                                                <FormLabel>Descrição do Item</FormLabel>
                                                <Textarea 
                                                    placeholder="Descrição detalhada do produto ou serviço" 
                                                    value={editIndex !== null ? '' : currentItem.description}
                                                    onChange={e => editIndex === null && handleCurrentItemChange('description', e.target.value)}
                                                    disabled={editIndex !== null}
                                                />
                                            </div>
                                            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-4">
                                                <div>
                                                    <FormLabel>Código</FormLabel>
                                                    <Input 
                                                        placeholder="Opcional" 
                                                        value={editIndex !== null ? '' : (currentItem.code || '')} 
                                                        onChange={e => editIndex === null && handleCurrentItemChange('code', e.target.value)}
                                                        disabled={editIndex !== null}
                                                    />
                                                </div>
                                                <div>
                                                    <FormLabel>Quantidade</FormLabel>
                                                    <Input 
                                                        type="number" 
                                                        placeholder="1" 
                                                        value={editIndex !== null ? '' : currentItem.quantity} 
                                                        onChange={e => editIndex === null && handleCurrentItemChange('quantity', e.target.value)}
                                                        disabled={editIndex !== null}
                                                    />
                                                </div>
                                                <div>
                                                    <FormLabel>Preço Unitário s/ Imposto (R$)</FormLabel>
                                                    <Input 
                                                        type="number" 
                                                        step="0.01" 
                                                        placeholder="0.00" 
                                                        value={editIndex !== null ? '' : currentItem.unitPrice} 
                                                        onChange={e => editIndex === null && handleCurrentItemChange('unitPrice', e.target.value)}
                                                        disabled={editIndex !== null}
                                                    />
                                                </div>
                                                <div>
                                                    <FormLabel>Imposto (%)</FormLabel>
                                                    <Input 
                                                        type="number" 
                                                        step="0.01" 
                                                        placeholder="0" 
                                                        value={editIndex !== null ? '' : (currentItem.taxRate || '')} 
                                                        onChange={e => editIndex === null && handleCurrentItemChange('taxRate', e.target.value)}
                                                        disabled={editIndex !== null}
                                                    />
                                                </div>
                                                <div>
                                                    <FormLabel>Peso Unit. (kg)</FormLabel>
                                                    <Input 
                                                        type="number" 
                                                        step="0.01" 
                                                        placeholder="0.00" 
                                                        value={editIndex !== null ? '' : (currentItem.unitWeight || '')} 
                                                        onChange={e => editIndex === null && handleCurrentItemChange('unitWeight', e.target.value)}
                                                        disabled={editIndex !== null}
                                                    />
                                                </div>
                                                <div>
                                                    <FormLabel>Lead Time (dias)</FormLabel>
                                                    <Input 
                                                        type="number" 
                                                        placeholder="0" 
                                                        value={editIndex !== null ? '' : (currentItem.leadTimeDays || '')} 
                                                        onChange={e => editIndex === null && handleCurrentItemChange('leadTimeDays', e.target.value)}
                                                        disabled={editIndex !== null}
                                                    />
                                                </div>
                                            </div>
                                            <div className="flex justify-end gap-2">
                                                <Button 
                                                    type="button" 
                                                    onClick={handleAddItem}
                                                    disabled={editIndex !== null}
                                                >
                                                    <PlusCircle className="mr-2 h-4 w-4" />
                                                    Adicionar Item
                                                </Button>
                                            </div>
                                        </CardContent>
                                    </Card>

                                    {watchedItems.length > 0 && (
                                        <Card>
                                                                                                                    <CardHeader>
                                                                <CardTitle className="flex items-center gap-3">
                                                                    Itens Adicionados
                                                                    {editIndex !== null && (
                                                                        <Badge variant="secondary" className="bg-blue-100 text-blue-800 px-3 py-1">
                                                                            🔧 Editando linha {editIndex + 1}
                                                                        </Badge>
                                                                    )}
                                                                </CardTitle>
                                                                <CardDescription>
                                                                    Use as setas para reordenar os itens, o botão de duplicar para criar cópias de itens similares e agilizar a cotação.
                                                                    {editIndex !== null && " Clique no ✓ para salvar ou ✗ para cancelar a edição."}
                                                                </CardDescription>
                                                            </CardHeader>
                                            <CardContent>
                                                <Table>
                                                    <TableHeader>
                                                        <TableRow>
                                                            <TableHead className="w-[140px]">Código</TableHead>
                                                            <TableHead className="min-w-[400px]">Descrição</TableHead>
                                                            <TableHead className="w-[100px]">Qtd.</TableHead>
                                                            <TableHead className="w-[120px]">Peso Unit.</TableHead>
                                                            <TableHead className="w-[160px]">Preço Unit. s/ Imp.</TableHead>
                                                            <TableHead className="w-[120px]">Imposto (%)</TableHead>
                                                            <TableHead className="w-[140px]">Lead Time</TableHead>
                                                            <TableHead className="w-[180px]">Total c/ Imp.</TableHead>
                                                            <TableHead className="w-[220px] text-right">Ações</TableHead>
                                                        </TableRow>
                                                    </TableHeader>
                                                    <TableBody>
                                                        {watchedItems.map((item, index) => {
                                                            const { totalWithTax } = calculateItemTotals(item);
                                                            const isEditing = editIndex === index;
                                                            
                                                            if (isEditing) {
                                                                return (
                                                                    <TableRow key={index} className="bg-blue-50 border-2 border-blue-300 shadow-sm">
                                                                        <TableCell className="p-3">
                                                                            <Input 
                                                                                placeholder="Código" 
                                                                                value={currentItem.code || ''} 
                                                                                onChange={e => handleCurrentItemChange('code', e.target.value)}
                                                                                className="h-12 text-base w-full font-medium"
                                                                            />
                                                                        </TableCell>
                                                                        <TableCell className="p-3">
                                                                            <Textarea 
                                                                                placeholder="Descrição detalhada do produto..." 
                                                                                value={currentItem.description}
                                                                                onChange={e => handleCurrentItemChange('description', e.target.value)}
                                                                                className="min-h-[80px] text-base resize-none w-full font-medium"
                                                                                rows={3}
                                                                            />
                                                                        </TableCell>
                                                                        <TableCell className="p-3">
                                                                            <Input 
                                                                                type="number" 
                                                                                placeholder="1" 
                                                                                value={currentItem.quantity} 
                                                                                onChange={e => handleCurrentItemChange('quantity', e.target.value)}
                                                                                className="h-12 text-base w-full font-medium text-center"
                                                                            />
                                                                        </TableCell>
                                                                        <TableCell className="p-3">
                                                                            <Input 
                                                                                type="number" 
                                                                                step="0.01" 
                                                                                placeholder="0.00" 
                                                                                value={currentItem.unitWeight || ''} 
                                                                                onChange={e => handleCurrentItemChange('unitWeight', e.target.value)}
                                                                                className="h-12 text-base w-full font-medium text-center"
                                                                            />
                                                                        </TableCell>
                                                                        <TableCell className="p-3">
                                                                            <Input 
                                                                                type="number" 
                                                                                step="0.01" 
                                                                                placeholder="0.00" 
                                                                                value={currentItem.unitPrice} 
                                                                                onChange={e => handleCurrentItemChange('unitPrice', e.target.value)}
                                                                                className="h-12 text-base w-full font-medium text-right"
                                                                            />
                                                                        </TableCell>
                                                                        <TableCell className="p-3">
                                                                            <Input 
                                                                                type="number" 
                                                                                step="0.01" 
                                                                                placeholder="0" 
                                                                                value={currentItem.taxRate || ''} 
                                                                                onChange={e => handleCurrentItemChange('taxRate', e.target.value)}
                                                                                className="h-12 text-base w-full font-medium text-center"
                                                                            />
                                                                        </TableCell>
                                                                        <TableCell className="p-3">
                                                                            <Input 
                                                                                type="number" 
                                                                                placeholder="0" 
                                                                                value={currentItem.leadTimeDays || ''} 
                                                                                onChange={e => handleCurrentItemChange('leadTimeDays', e.target.value)}
                                                                                className="h-12 text-base w-full font-medium text-center"
                                                                            />
                                                                        </TableCell>
                                                                        <TableCell className="p-3">
                                                                            <div className="text-base font-bold text-center bg-green-50 p-2 rounded border">
                                                                                {calculateItemTotals(currentItem).totalWithTax.toLocaleString('pt-BR', {style: 'currency', currency: 'BRL'})}
                                                                            </div>
                                                                        </TableCell>
                                                                        <TableCell className="text-right p-3">
                                                                            <div className="flex items-center justify-center gap-2">
                                                                                <Button 
                                                                                    type="button" 
                                                                                    variant="ghost" 
                                                                                    size="icon"
                                                                                    onClick={handleUpdateItem}
                                                                                    title="Salvar alterações"
                                                                                    className="h-11 w-11 text-green-600 hover:text-green-700 hover:bg-green-50 border border-green-200"
                                                                                >
                                                                                    <Check className="h-5 w-5" />
                                                                                </Button>
                                                                                <Button 
                                                                                    type="button" 
                                                                                    variant="ghost" 
                                                                                    size="icon"
                                                                                    onClick={handleCancelEdit}
                                                                                    title="Cancelar edição"
                                                                                    className="h-11 w-11 text-red-600 hover:text-red-700 hover:bg-red-50 border border-red-200"
                                                                                >
                                                                                    <X className="h-5 w-5" />
                                                                                </Button>
                                                                            </div>
                                                                        </TableCell>
                                                                    </TableRow>
                                                                );
                                                            }
                                                            
                                                            return (
                                                                <TableRow key={index}>
                                                                    <TableCell className="font-mono text-base p-3 font-medium">{item.code || '-'}</TableCell>
                                                                    <TableCell className="font-medium p-3 text-base">
                                                                        <div className="whitespace-normal break-words leading-relaxed">
                                                                            {item.description}
                                                                        </div>
                                                                    </TableCell>
                                                                    <TableCell className="text-center p-3 text-base font-medium">{item.quantity}</TableCell>
                                                                    <TableCell className="text-center p-3">
                                                                        {item.unitWeight && Number(item.unitWeight) > 0 ? (
                                                                            <span className="text-base font-medium">{Number(item.unitWeight).toFixed(2)} kg</span>
                                                                        ) : (
                                                                            <span className="text-muted-foreground text-sm">-</span>
                                                                        )}
                                                                    </TableCell>
                                                                    <TableCell className="text-right p-3 text-base font-medium">{item.unitPrice.toLocaleString('pt-BR', {style: 'currency', currency: 'BRL'})}</TableCell>
                                                                    <TableCell className="text-center p-3 text-base font-medium">{item.taxRate || 0}%</TableCell>
                                                                    <TableCell className="text-center p-3">
                                                                        {item.leadTimeDays ? (
                                                                            <Badge variant="outline" className="text-sm">{item.leadTimeDays} dias</Badge>
                                                                        ) : (
                                                                            <span className="text-muted-foreground text-sm">N/A</span>
                                                                        )}
                                                                    </TableCell>
                                                                    <TableCell className="text-right font-bold p-3 text-base">{totalWithTax.toLocaleString('pt-BR', {style: 'currency', currency: 'BRL'})}</TableCell>
                                                                    <TableCell className="text-right p-3">
                                                                        <div className="flex items-center justify-center gap-1">
                                                                            <Button 
                                                                                type="button" 
                                                                                variant="ghost" 
                                                                                size="icon"
                                                                                onClick={() => handleMoveItemUp(index)}
                                                                                title="Mover item para cima"
                                                                                disabled={index === 0}
                                                                                className="h-9 w-9 hover:bg-green-50"
                                                                            >
                                                                                <ChevronUp className="h-4 w-4" />
                                                                            </Button>
                                                                            <Button 
                                                                                type="button" 
                                                                                variant="ghost" 
                                                                                size="icon"
                                                                                onClick={() => handleMoveItemDown(index)}
                                                                                title="Mover item para baixo"
                                                                                disabled={index === watchedItems.length - 1}
                                                                                className="h-9 w-9 hover:bg-green-50"
                                                                            >
                                                                                <ChevronDown className="h-4 w-4" />
                                                                            </Button>
                                                                            <Button 
                                                                                type="button" 
                                                                                variant="ghost" 
                                                                                size="icon"
                                                                                onClick={() => handleDuplicateItem(index)}
                                                                                title="Duplicar item"
                                                                                className="h-9 w-9 hover:bg-blue-50"
                                                                            >
                                                                                <Copy className="h-4 w-4" />
                                                                            </Button>
                                                                            <Button 
                                                                                type="button" 
                                                                                variant="ghost" 
                                                                                size="icon" 
                                                                                onClick={() => handleEditItem(index)}
                                                                                title="Editar item"
                                                                                className="h-9 w-9 hover:bg-orange-50"
                                                                            >
                                                                                <Pencil className="h-4 w-4" />
                                                                            </Button>
                                                                            <Button 
                                                                                type="button" 
                                                                                variant="ghost" 
                                                                                size="icon" 
                                                                                className="text-destructive hover:text-destructive hover:bg-red-50 h-9 w-9" 
                                                                                onClick={() => remove(index)}
                                                                                title="Remover item"
                                                                            >
                                                                                <Trash2 className="h-4 w-4" />
                                                                            </Button>
                                                                        </div>
                                                                    </TableCell>
                                                                </TableRow>
                                                            );
                                                        })}
                                                    </TableBody>
                                                </Table>
                                                <Separator className="my-4" />
                                                <div className="flex justify-end items-center gap-4 text-lg font-bold pr-4">
                                                    <span>Total Geral:</span>
                                                    <span className="text-primary">
                                                        {grandTotal.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                                                    </span>
                                                </div>
                                            </CardContent>
                                        </Card>
                                    )}

                                    <Card>
                                        <CardHeader><CardTitle>Serviços Inclusos</CardTitle></CardHeader>
                                        <CardContent>
                                            <FormField
                                                control={form.control}
                                                name="includedServices"
                                                render={() => (
                                                    <FormItem>
                                                        <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                                                            {serviceOptions.map((item) => (
                                                                <FormField
                                                                    key={item.id}
                                                                    control={form.control}
                                                                    name="includedServices"
                                                                    render={({ field }) => {
                                                                        return (
                                                                            <FormItem
                                                                                key={item.id}
                                                                                className="flex flex-row items-start space-x-3 space-y-0"
                                                                            >
                                                                                <FormControl>
                                                                                    <Checkbox
                                                                                        checked={field.value?.includes(item.id)}
                                                                                        onCheckedChange={(checked) => {
                                                                                            return checked
                                                                                                ? field.onChange([...(field.value || []), item.id])
                                                                                                : field.onChange(
                                                                                                    field.value?.filter(
                                                                                                        (value) => value !== item.id
                                                                                                    )
                                                                                                )
                                                                                        }}
                                                                                    />
                                                                                </FormControl>
                                                                                <FormLabel className="font-normal">
                                                                                    {item.label}
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
                                        </CardContent>
                                    </Card>

                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                        <FormField control={form.control} name="paymentTerms" render={({ field }) => (
                                            <FormItem><FormLabel>Condições de Pagamento</FormLabel><FormControl><Input {...field} value={field.value ?? ''} /></FormControl><FormMessage /></FormItem>
                                        )}/>
                                        <FormField control={form.control} name="deliveryTime" render={({ field }) => (
                                            <FormItem><FormLabel>Prazo de Entrega</FormLabel><FormControl><Input {...field} value={field.value ?? ''} /></FormControl><FormMessage /></FormItem>
                                        )}/>
                                    </div>
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                        <FormField control={form.control} name="validity" render={({ field }) => (
                                            <FormItem className="flex flex-col"><FormLabel>Validade da Proposta</FormLabel>
                                                <Popover>
                                                    <PopoverTrigger asChild>
                                                        <FormControl>
                                                            <Button variant={"outline"} className={cn("pl-3 text-left font-normal", !field.value && "text-muted-foreground")}>
                                                                {field.value ? format(field.value, "PPP", { locale: ptBR }) : <span>Escolha uma data</span>}
                                                                <CalendarIcon className="ml-auto h-4 w-4 opacity-50" />
                                                            </Button>
                                                        </FormControl>
                                                    </PopoverTrigger>
                                                    <PopoverContent className="w-auto p-0" align="start">
                                                        <Calendar mode="single" selected={field.value} onSelect={field.onChange} initialFocus />
                                                    </PopoverContent>
                                                </Popover><FormMessage />
                                            </FormItem>
                                        )} />
                                    </div>
                                     <FormField control={form.control} name="notes" render={({ field }) => (
                                        <FormItem><FormLabel>Observações Gerais</FormLabel><FormControl><Textarea placeholder="Observações adicionais, detalhes técnicos, etc." {...field} value={field.value ?? ''} /></FormControl><FormMessage /></FormItem>
                                    )}/>
                                </div>
                            </ScrollArea>
                            <DialogFooter className="pt-6 border-t">
                                <Button type="submit" disabled={form.formState.isSubmitting}>
                                    {form.formState.isSubmitting ? "Salvando..." : "Salvar Orçamento"}
                                </Button>
                            </DialogFooter>
                        </form>
                    </Form>
                </DialogContent>
            </Dialog>

            {/* Modal de Busca de Produtos */}
            <Dialog open={isProductSearchOpen} onOpenChange={setIsProductSearchOpen}>
                <DialogContent className="max-w-4xl">
                    <DialogHeader>
                        <DialogTitle>Buscar Produto no Catálogo</DialogTitle>
                        <DialogDescription>
                            Selecione um produto cadastrado para preencher automaticamente os dados do item.
                        </DialogDescription>
                    </DialogHeader>
                    <div className="space-y-4">
                        <div className="relative">
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                            <Input
                                placeholder="Buscar por código ou descrição..."
                                value={productSearchQuery}
                                onChange={(e) => setProductSearchQuery(e.target.value)}
                                className="pl-9"
                            />
                        </div>
                        <ScrollArea className="h-96">
                            {filteredProducts.length > 0 ? (
                                <div className="space-y-2">
                                    {filteredProducts.map((product) => {
                                        const leadTime = calculateLeadTime(product);
                                        return (
                                            <Card 
                                                key={product.id} 
                                                className="cursor-pointer hover:bg-muted/50 transition-colors"
                                                onClick={() => handleSelectProduct(product)}
                                            >
                                                <CardContent className="p-4">
                                                    <div className="flex items-start justify-between">
                                                        <div className="space-y-1">
                                                            <div className="flex items-center gap-3">
                                                                <Badge variant="outline">{product.code}</Badge>
                                                                {leadTime > 0 && (
                                                                    <Badge variant="secondary">{leadTime} dias</Badge>
                                                                )}
                                                            </div>
                                                            <h4 className="font-medium">{product.description}</h4>
                                                            <div className="flex items-center gap-4 text-sm text-muted-foreground">
                                                                <span>Preço: {product.unitPrice.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</span>
                                                                {product.unitWeight && product.unitWeight > 0 && (
                                                                    <span>Peso: {product.unitWeight} kg</span>
                                                                )}
                                                            </div>
                                                        </div>
                                                        <Button size="sm" variant="outline">
                                                            Selecionar
                                                        </Button>
                                                    </div>
                                                </CardContent>
                                            </Card>
                                        );
                                    })}
                                </div>
                            ) : (
                                <div className="text-center py-8 text-muted-foreground">
                                    <Package className="mx-auto h-12 w-12 mb-4 opacity-50" />
                                    <p>Nenhum produto encontrado.</p>
                                    {productSearchQuery && (
                                        <p className="text-sm">Tente buscar com outros termos.</p>
                                    )}
                                </div>
                            )}
                        </ScrollArea>
                    </div>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setIsProductSearchOpen(false)}>
                            Cancelar
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            <Sheet open={isViewSheetOpen} onOpenChange={setIsViewSheetOpen}>
                <SheetContent className="w-full sm:max-w-3xl">
                    {selectedQuotation && (
                        <>
                        <SheetHeader>
                            <SheetTitle className="font-headline text-2xl">Orçamento Nº {selectedQuotation.number}</SheetTitle>
                            <SheetDescription>
                                Cliente: <span className="font-medium text-foreground">{selectedQuotation.customer.name}</span>
                                {selectedQuotation.buyerName && ` | Comprador: `}
                                {selectedQuotation.buyerName && <span className="font-medium text-foreground">{selectedQuotation.buyerName}</span>}
                            </SheetDescription>
                        </SheetHeader>
                        <ScrollArea className="h-[calc(100vh-12rem)]">
                            <div className="space-y-6 py-6 pr-6">
                                <Card>
                                    <CardHeader><CardTitle>Detalhes do Orçamento</CardTitle></CardHeader>
                                    <CardContent className="space-y-3 text-sm">
                                        <div className="flex justify-between items-center">
                                            <span className="font-medium text-muted-foreground">Status</span>
                                            <Badge variant={getStatusVariant(selectedQuotation.status)} className={cn((selectedQuotation.status === 'Aprovado' || selectedQuotation.status === 'Pedido Gerado') && 'bg-green-600 text-primary-foreground')}>{selectedQuotation.status}</Badge>
                                        </div>
                                        <div className="flex justify-between items-center">
                                            <span className="font-medium text-muted-foreground">Data de Criação</span>
                                            <span>{format(selectedQuotation.createdAt.toDate(), "dd/MM/yyyy")}</span>
                                        </div>
                                        <div className="flex justify-between items-center">
                                            <span className="font-medium text-muted-foreground">Validade</span>
                                            <span>{format(selectedQuotation.validity, "dd/MM/yyyy")}</span>
                                        </div>
                                        <div className="flex justify-between items-center">
                                            <span className="font-medium text-muted-foreground">Cond. Pagamento</span>
                                            <span>{selectedQuotation.paymentTerms}</span>
                                        </div>
                                        <div className="flex justify-between items-center">
                                            <span className="font-medium text-muted-foreground">Prazo de Entrega</span>
                                            <span>{selectedQuotation.deliveryTime}</span>
                                        </div>
                                    </CardContent>
                                </Card>
                                
                                <Card>
                                    <CardHeader><CardTitle>Itens e Valores</CardTitle></CardHeader>
                                    <CardContent>
                                        <Table>
                                            <TableHeader>
                                                <TableRow>
                                                    <TableHead>Código</TableHead>
                                                    <TableHead>Descrição</TableHead>
                                                    <TableHead className="text-center w-[60px]">Qtd.</TableHead>
                                                    <TableHead className="text-right w-[120px]">Valor Unit. s/ Imp.</TableHead>
                                                    <TableHead className="text-center w-[80px]">Imposto (%)</TableHead>
                                                    <TableHead className="text-center w-[100px]">Lead Time</TableHead>
                                                    <TableHead className="text-right w-[150px]">Subtotal c/ Imp.</TableHead>
                                                </TableRow>
                                            </TableHeader>
                                            <TableBody>
                                                {selectedQuotation.items.map((item, index) => {
                                                    const { totalWithTax } = calculateItemTotals(item);
                                                    return (
                                                        <TableRow key={index}>
                                                            <TableCell className="font-mono text-sm">{item.code || '-'}</TableCell>
                                                            <TableCell className="font-medium">{item.description}</TableCell>
                                                            <TableCell className="text-center">{item.quantity}</TableCell>
                                                            <TableCell className="text-right">{item.unitPrice.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</TableCell>
                                                            <TableCell className="text-center">{item.taxRate || 0}%</TableCell>
                                                            <TableCell className="text-center">
                                                                {item.leadTimeDays ? (
                                                                    <Badge variant="outline">{item.leadTimeDays} dias</Badge>
                                                                ) : (
                                                                    <span className="text-muted-foreground text-xs">N/A</span>
                                                                )}
                                                            </TableCell>
                                                            <TableCell className="text-right font-semibold">{totalWithTax.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</TableCell>
                                                        </TableRow>
                                                    );
                                                })}
                                            </TableBody>
                                        </Table>
                                        <Separator className="my-4" />
                                        <div className="flex justify-end items-center gap-4 text-xl font-bold pr-4">
                                            <span>Total Geral:</span>
                                            <span className="text-primary">
                                                {calculateGrandTotal(selectedQuotation.items).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                                            </span>
                                        </div>
                                    </CardContent>
                                </Card>

                                {selectedQuotation.includedServices && selectedQuotation.includedServices.length > 0 && (
                                    <Card>
                                        <CardHeader><CardTitle>Serviços Inclusos</CardTitle></CardHeader>
                                        <CardContent>
                                            <ul className="grid grid-cols-2 gap-2 text-sm text-muted-foreground">
                                                {selectedQuotation.includedServices.map(serviceId => {
                                                    const service = serviceOptions.find(s => s.id === serviceId);
                                                    return <li key={serviceId} className="flex items-center gap-2"><Check className="h-4 w-4 text-primary" /> {service ? service.label : serviceId}</li>
                                                })}
                                            </ul>
                                        </CardContent>
                                    </Card>
                                )}

                                {selectedQuotation.notes && (
                                    <Card>
                                        <CardHeader><CardTitle>Observações Gerais</CardTitle></CardHeader>
                                        <CardContent>
                                            <p className="text-sm text-muted-foreground whitespace-pre-wrap">{selectedQuotation.notes}</p>
                                        </CardContent>
                                    </Card>
                                )}
                            </div>
                        </ScrollArea>
                        <SheetFooter className="pt-4 pr-6 border-t flex sm:justify-end gap-2">
                            {selectedQuotation.status === 'Aprovado' && (
                                <Button onClick={() => handleGenerateOrder(selectedQuotation)} className="w-full sm:w-auto">
                                    <PackagePlus className="mr-2 h-4 w-4" />
                                    Gerar Pedido
                                </Button>
                            )}
                            <Button 
                                variant="outline" 
                                onClick={() => handleDuplicateQuotation(selectedQuotation)} 
                                className="w-full sm:w-auto"
                            >
                                <Copy className="mr-2 h-4 w-4" />
                                Duplicar
                            </Button>
                             <DropdownMenu>
                                <DropdownMenuTrigger asChild>
                                    <Button variant="outline" className="w-full sm:w-auto">
                                        <FileDown className="mr-2 h-4 w-4" />
                                        Exportar
                                    </Button>
                                </DropdownMenuTrigger>
                                <DropdownMenuContent>
                                    <DropdownMenuItem onClick={() => handleExport('pdf')}>Exportar para PDF</DropdownMenuItem>
                                    <DropdownMenuItem onClick={() => handleExport('excel')}>Exportar para Excel</DropdownMenuItem>
                                </DropdownMenuContent>
                            </DropdownMenu>
                        </SheetFooter>
                        </>
                    )}
                </SheetContent>
            </Sheet>

            <AlertDialog open={isDeleteDialogOpen} onOpenChange={setIsDeleteDialogOpen}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                    <AlertDialogTitle>Você tem certeza?</AlertDialogTitle>
                    <AlertDialogDescription>
                        Esta ação não pode ser desfeita. Isso excluirá permanentemente o orçamento.
                    </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                    <AlertDialogCancel>Cancelar</AlertDialogCancel>
                    <AlertDialogAction onClick={handleConfirmDelete} className="bg-destructive hover:bg-destructive/90">
                        Sim, excluir
                    </AlertDialogAction>
                    </AlertDialogFooter>
                    </AlertDialogContent>
            </AlertDialog>

            <Dialog open={isGenerateOrderDialogOpen} onOpenChange={setIsGenerateOrderDialogOpen}>
                <DialogContent>
                    <Form {...generateOrderForm}>
                        <form onSubmit={generateOrderForm.handleSubmit(onConfirmGenerateOrder)}>
                            <DialogHeader>
                                <DialogTitle>Gerar Pedido de Produção</DialogTitle>
                                <DialogDescription>
                                    O orçamento Nº <span className="font-bold">{quotationToConvert?.number}</span> será convertido em um pedido. O número do orçamento se tornará a OS Interna. Por favor, insira o número do Pedido de Compra (PC) do cliente.
                                </DialogDescription>
                            </DialogHeader>
                            <div className="py-4">
                                <FormField
                                    control={generateOrderForm.control}
                                    name="poNumber"
                                    render={({ field }) => (
                                        <FormItem>
                                            <FormLabel>Nº do Pedido de Compra do Cliente</FormLabel>
                                            <FormControl>
                                                <Input placeholder="Ex: PC-12345" {...field} value={field.value ?? ''} />
                                            </FormControl>
                                            <FormMessage />
                                        </FormItem>
                                    )}
                                />
                            </div>
                            <DialogFooter>
                                <Button type="button" variant="outline" onClick={() => setIsGenerateOrderDialogOpen(false)}>Cancelar</Button>
                                <Button type="submit" disabled={generateOrderForm.formState.isSubmitting}>
                                    {generateOrderForm.formState.isSubmitting ? 'Gerando...' : 'Confirmar e Gerar Pedido'}
                                </Button>
                            </DialogFooter>
                        </form>
                    </Form>
                </DialogContent>
            </Dialog>
        </>
    );
}
