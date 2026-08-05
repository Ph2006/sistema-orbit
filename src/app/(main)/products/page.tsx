// IMPORTANTE: este arquivo deve permanecer salvo em UTF-8.
"use client";

import React from "react";
import { useState, useEffect, useCallback, useMemo } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { collection, getDocs, setDoc, doc, deleteDoc, writeBatch, Timestamp, updateDoc, arrayUnion, arrayRemove, getDoc } from "firebase/firestore";
import { db } from "@/lib/firebase";
    import { PlusCircle, Search, Pencil, Trash2, RefreshCw, Copy, Clock, CalendarIcon, Download, FileText, GripVertical, Calculator, Package, BookOpen, ShieldAlert, Upload, User, Hash, Save, ImagePlus, X } from "lucide-react";
import { useAuth } from "../layout";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import * as XLSX from "xlsx";
    import jsPDF from 'jspdf';

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

const materialSchema = z.object({
  id: z.string().optional(),
  category: z.string().min(1, "Categoria obrigatória"),
  description: z.string().min(3, "Descrição obrigatória"),
  pricePerKg: z.coerce.number().min(0, "Preço deve ser positivo"),
  unit: z.string().default("kg"),
  specification: z.string().optional(),
});

const planTaskSchema = z.object({
  stageName: z.string(),
  instructions: z.string().optional(),
  deadlineDays: z.coerce.number().min(0).optional(),
  images: z.array(z.object({
    dataUrl: z.string(),
    caption: z.string().optional(),
  })).optional(),
});

interface PlanImage {
  dataUrl: string;
  caption?: string;
}

interface PlanTask {
  stageName: string;
  instructions?: string;
  deadlineDays?: number;
  images?: PlanImage[];
}

interface ManufacturingPlan {
  controlNumber: string;
  drawingNumber: string;
  productCode?: string;
  productDescription?: string;
  revision?: string;
  createdBy?: string;
  generalNotes?: string;
  tasks: PlanTask[];
}

type Product = z.infer<typeof productSchema> & { id: string, manufacturingStages?: string[] };

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

    // Interfaces para calculadora de preços
    interface Material {
    id: string;
    category: string;
    description: string;
    pricePerKg: number;
    unit: string;
    specification?: string;
    }

    interface MaterialCompositionItem {
    id: string;
    materialId: string;
    materialDescription: string;
    weightKg: number;
    pricePerKg: number;
    totalCost: number;
    }

    interface StageCostItem {
    stageName: string;
    durationDays: number;
    costPerDay: number;
    totalCost: number;
    }

    interface PricingCalculation {
    productId: string;
    productCode: string;
    productDescription: string;
    productWeight: number;
    materialCosts: MaterialCompositionItem[];
    stageCosts: StageCostItem[];
    machiningCost: number;
    consumablesCost: number;
    totalCost: number;
    profitMargin: number;
    profitValue: number;
    priceBeforeIncomeTaxes: number;
    irpjRate: number;
    irpjAmount: number;
    csllRate: number;
    csllAmount: number;
    finalPrice: number;
    pricePerKg: number;
    createdAt: Date;
    }

    // Categorias e biblioteca de materiais
    const MATERIAL_CATEGORIES = [
    "Chapas Grossas",
    "Chapas Finas",
    "Chapas Especiais", 
    "Tubos com Costura",
    "Tubos sem Costura",
    "Tubos Especiais",
    "Perfil U",
    "Perfil I",
    "Perfil L (Cantoneiras)",
    "Perfil T",
    "Perfil H",
    "Perfil W",
    "Barras Redondas",
    "Barras Chatas",
    "Barras Quadradas",
    "Barras Sextavadas",
    "Aço Inox 304",
    "Aço Inox 316",
    "Alumínio",
    "Cobre",
    "Bronze",
    "Latão",
    "Aço Carbono",
    "Aço Liga",
    "Consumíveis Soldagem",
    "Parafusos e Fixadores",
    "Eletrodos",
    "Gases",
    "Outros"
    ];

    const DEFAULT_MATERIALS: Material[] = [
    // Chapas ASTM A36
    { id: "chapa-1-8-a36", category: "Chapas Grossas", description: 'Chapa 1/8" - ASTM A36', pricePerKg: 5.42, unit: "kg", specification: "ASTM A36" },
    { id: "chapa-3-16-a36", category: "Chapas Grossas", description: 'Chapa 3/16" - ASTM A36', pricePerKg: 5.57, unit: "kg" },
    { id: "chapa-1-4-a36", category: "Chapas Grossas", description: 'Chapa 1/4" - ASTM A36', pricePerKg: 7.35, unit: "kg" },
    { id: "chapa-5-16-a36", category: "Chapas Grossas", description: 'Chapa 5/16" - ASTM A36', pricePerKg: 7.14, unit: "kg" },
    { id: "chapa-3-8-a36", category: "Chapas Grossas", description: 'Chapa 3/8" - ASTM A36', pricePerKg: 6.76, unit: "kg" },
    { id: "chapa-1-2-a36", category: "Chapas Grossas", description: 'Chapa 1/2" - ASTM A36', pricePerKg: 6.86, unit: "kg" },
    { id: "chapa-3-4-a36", category: "Chapas Grossas", description: 'Chapa 3/4" - ASTM A36', pricePerKg: 6.96, unit: "kg" },
    { id: "chapa-1-a36", category: "Chapas Grossas", description: 'Chapa 1" - ASTM A36', pricePerKg: 7.54, unit: "kg" },
    { id: "chapa-2-a36", category: "Chapas Grossas", description: 'Chapa 2" - ASTM A36', pricePerKg: 11.29, unit: "kg" },
    { id: "chapa-3-a36", category: "Chapas Grossas", description: 'Chapa 3" - ASTM A36', pricePerKg: 13.93, unit: "kg" },
    
    // Chapas A572
    { id: "chapa-1-4-a572", category: "Chapas Grossas", description: 'Chapa 1/4" - ASTM A572', pricePerKg: 11.15, unit: "kg" },
    { id: "chapa-5-16-a572", category: "Chapas Grossas", description: 'Chapa 5/16" - ASTM A572', pricePerKg: 7.98, unit: "kg" },
    
    // Chapas SAE 1020
    { id: "chapa-2-sae1020", category: "Chapas Finas", description: 'Chapa 2" - SAE 1020', pricePerKg: 11.87, unit: "kg" },
    
    // Chapas SAE 1045
    { id: "ch-3-16-sae1045", category: "Chapas Especiais", description: 'CH 3/16" - SAE 1045', pricePerKg: 19.10, unit: "kg" },
    { id: "ch-1-4-sae1045", category: "Chapas Especiais", description: 'CH 1/4" - SAE 1045', pricePerKg: 11.77, unit: "kg" },
    { id: "ch-1-2-sae1045", category: "Chapas Especiais", description: 'CH 1/2" - SAE 1045', pricePerKg: 12.90, unit: "kg" },
    { id: "ch-1-sae1045", category: "Chapas Especiais", description: 'CH 1" - SAE 1045', pricePerKg: 10.84, unit: "kg" },
    { id: "ch-2-sae1045", category: "Chapas Especiais", description: 'CH 2" - SAE 1045', pricePerKg: 11.92, unit: "kg" },
    { id: "ch-3-sae1045", category: "Chapas Especiais", description: 'CH 3" - SAE 1045', pricePerKg: 13.93, unit: "kg" },
    
    // Perfis W
    { id: "perfil-w-200x22", category: "Perfil W", description: "PERFIL W 200 X 22,5 KGM", pricePerKg: 7.91, unit: "kg" },
    { id: "perfil-w-150x29", category: "Perfil W", description: "PERFIL W 150X29,3 KG-M", pricePerKg: 9.30, unit: "kg" },
    { id: "perfil-w-250x89", category: "Perfil W", description: "Perfil W 250x89", pricePerKg: 8.29, unit: "kg" },
    { id: "perfil-w-250x32", category: "Perfil W", description: "PERFIL W 250 X 32,7 KGM", pricePerKg: 8.70, unit: "kg" },
    { id: "perfil-w-250x44", category: "Perfil W", description: "PERFIL W 250 X 44,8 KGM", pricePerKg: 8.98, unit: "kg" },
    
    // Vigas U
    { id: "viga-u4x2", category: "Perfil U", description: 'Viga U 4" x 2"', pricePerKg: 7.87, unit: "kg" },
    { id: "viga-u6x2", category: "Perfil U", description: 'Viga U 6" x 2"', pricePerKg: 7.87, unit: "kg" },
    { id: "viga-u10x2", category: "Perfil U", description: 'Viga U 10" x 2"', pricePerKg: 9.88, unit: "kg" },
    { id: "viga-u4x1", category: "Perfil U", description: 'Viga U 4" x 1"', pricePerKg: 7.95, unit: "kg" },
    { id: "viga-u8x2", category: "Perfil U", description: 'Viga U 8" x 2"', pricePerKg: 9.55, unit: "kg" },
    
    // Barras Redondas
    { id: "barra-red-5-8-1020", category: "Barras Redondas", description: 'Barra red 5/8" sae 1020', pricePerKg: 7.59, unit: "kg" },
    { id: "barra-red-1-2-1020", category: "Barras Redondas", description: 'Barra red 1/2" sae 1020', pricePerKg: 7.25, unit: "kg" },
    { id: "barra-red-1-1-2-1020", category: "Barras Redondas", description: 'Barra red 1 1/2" sae 1020', pricePerKg: 8.25, unit: "kg" },
    { id: "barra-red-2-1020", category: "Barras Redondas", description: 'Barra red 2" tref sae 1020', pricePerKg: 12.90, unit: "kg" },
    { id: "barra-red-1-1020", category: "Barras Redondas", description: 'Barra red 1" tref sae1020', pricePerKg: 12.90, unit: "kg" },
    
    // Chapas RAVUR 450
    { id: "chapa-1-2-ravur450", category: "Chapas Especiais", description: 'Chapa 1/2" - RAVUR 450', pricePerKg: 22.00, unit: "kg" },
    { id: "chapa-5-8-ravur450", category: "Chapas Especiais", description: 'Chapa 5/8" - RAVUR 450', pricePerKg: 22.50, unit: "kg" },
    { id: "chapa-3-8-ravur450", category: "Chapas Especiais", description: 'Chapa 3/8" - RAVUR 450', pricePerKg: 22.00, unit: "kg" },
    
    // Barras Redondas 1045
    { id: "barra-red-1-3-4-1045", category: "Barras Redondas", description: 'Barra Redonda 1.3/4" - SAE 1045', pricePerKg: 12.50, unit: "kg" },
    { id: "barra-red-10-lam-norm-4140", category: "Barras Redondas", description: 'Barra redonda 10" laminado e normalizado - SAE 4140', pricePerKg: 25.64, unit: "kg" },
    
    // Barras Quad
    { id: "barra-quad-3-8-1020", category: "Barras Quadradas", description: 'Barra Quad 3/8" - SAE 1020', pricePerKg: 7.70, unit: "kg" },
    { id: "barra-quad-2-1-2-tref-1020", category: "Barras Quadradas", description: 'barra quad 2 1/2" tref - SAE 1020', pricePerKg: 11.20, unit: "kg" },
    { id: "barra-quad-2-1045", category: "Barras Quadradas", description: 'BARRA QUADRADA 2" - SAE 1045', pricePerKg: 11.20, unit: "kg" },
    
    // Barras Chatas
    { id: "barra-chata-2x1-4-1020", category: "Barras Chatas", description: 'Barra Chata 2" x 1/4" - SAE 1020', pricePerKg: 7.55, unit: "kg" },
    { id: "barra-chata-5-8x1-8-1020", category: "Barras Chatas", description: 'Barra chata 5/8" x 1/8" - SAE 1020', pricePerKg: 8.75, unit: "kg" },
    { id: "barra-chata-1x3-16-1020", category: "Barras Chatas", description: 'Barra chata 1" x 3/16" - SAE 1020', pricePerKg: 6.98, unit: "kg" },
    { id: "barra-chata-2x1-8-4020", category: "Barras Chatas", description: 'Barra chata 2" x 1/8" - SAE 4020', pricePerKg: 7.65, unit: "kg" },
    
    // Cantoneiras
    { id: "cant-3x5-16-1020", category: "Perfil L (Cantoneiras)", description: 'Cant 3" x 5/16" - SAE 1020', pricePerKg: 7.87, unit: "kg" },
    { id: "cant-3x1-4-1020", category: "Perfil L (Cantoneiras)", description: 'Cant 3" x 1/4" - SAE 1020', pricePerKg: 7.34, unit: "kg" },
    { id: "cant-4x1-2-1020", category: "Perfil L (Cantoneiras)", description: 'Cant 4" x 1/2" - SAE 1020', pricePerKg: 8.10, unit: "kg" },
    { id: "cant-6x3-8-1020", category: "Perfil L (Cantoneiras)", description: 'cant 6" X 3/8" - SAE 1020', pricePerKg: 12.30, unit: "kg" },
    { id: "cant-5x3-8-a572", category: "Perfil L (Cantoneiras)", description: 'Cant 5" X 3/8" - ASTM A572', pricePerKg: 8.80, unit: "kg" },
    
    // Tubos Schedule
    { id: "tubo-3-sch40-a53", category: "Tubos sem Costura", description: 'TUBO 3" SCH 40 ASTM A53', pricePerKg: 15.39, unit: "kg" },
    { id: "tubo-4-sch40-a53", category: "Tubos sem Costura", description: 'TUBO 4" SCH 40 ASTM A53', pricePerKg: 16.10, unit: "kg" },
    { id: "tubo-6-sch40-a53", category: "Tubos sem Costura", description: 'TUBO 6" SCH 40 ASTM A53', pricePerKg: 14.47, unit: "kg" },
    { id: "tubo-8-sch40-a53", category: "Tubos sem Costura", description: 'TUBO 8" SCH 40 ASTM A53', pricePerKg: 16.05, unit: "kg" },
    { id: "tubo-3-sch160-a53", category: "Tubos sem Costura", description: 'TUBO 3 SCH 160 S/COST ASTM A53', pricePerKg: 33.61, unit: "kg" },
    
    // Tubos DIN
    { id: "tubo-1-1-4-din2440", category: "Tubos com Costura", description: 'Tubo 1 1/4" DIN 2440', pricePerKg: 9.80, unit: "kg" },
    { id: "tubo-3-din2440", category: "Tubos com Costura", description: 'Tubo 3" DIN 2440', pricePerKg: 9.24, unit: "kg" },
    { id: "tubo-1-din2440", category: "Tubos com Costura", description: 'Tubo 1" DIN 2440', pricePerKg: 9.27, unit: "kg" },
    { id: "tubo-2-din2440", category: "Tubos com Costura", description: 'Tubo 2" DIN 2440 ASTM A53', pricePerKg: 9.55, unit: "kg" },
    
    // Aço Inox 304
    { id: "chapa-inox304-1mm", category: "Aço Inox 304", description: "Chapa Inox 304 - 1mm", pricePerKg: 35.00, unit: "kg" },
    { id: "chapa-inox304-2mm", category: "Aço Inox 304", description: "Chapa Inox 304 - 2mm", pricePerKg: 34.50, unit: "kg" },
    { id: "chapa-inox304-3mm", category: "Aço Inox 304", description: "Chapa Inox 304 - 3mm", pricePerKg: 34.00, unit: "kg" },
    { id: "tubo-inox304-1", category: "Aço Inox 304", description: 'Tubo Inox 304 - 1"', pricePerKg: 42.00, unit: "kg" },
    { id: "tubo-inox304-2", category: "Aço Inox 304", description: 'Tubo Inox 304 - 2"', pricePerKg: 41.50, unit: "kg" },
    
    // Aço Inox 316
    { id: "chapa-inox316-1mm", category: "Aço Inox 316", description: "Chapa Inox 316 - 1mm", pricePerKg: 48.00, unit: "kg" },
    { id: "chapa-inox316-2mm", category: "Aço Inox 316", description: "Chapa Inox 316 - 2mm", pricePerKg: 47.50, unit: "kg" },
    { id: "tubo-inox316-1", category: "Aço Inox 316", description: 'Tubo Inox 316 - 1"', pricePerKg: 55.00, unit: "kg" },
    
    // Alumínio
    { id: "chapa-aluminio-1mm", category: "Alumínio", description: "Chapa Alumínio 1100 - 1mm", pricePerKg: 28.00, unit: "kg" },
    { id: "chapa-aluminio-2mm", category: "Alumínio", description: "Chapa Alumínio 1100 - 2mm", pricePerKg: 27.50, unit: "kg" },
    { id: "perfil-aluminio-u", category: "Alumínio", description: "Perfil Alumínio U 50x25mm", pricePerKg: 29.00, unit: "kg" },
    { id: "tubo-aluminio-1", category: "Alumínio", description: 'Tubo Alumínio 1"', pricePerKg: 30.00, unit: "kg" },
    
    // Cobre e Ligas
    { id: "barra-cobre-1", category: "Cobre", description: 'Barra Cobre 1"', pricePerKg: 65.00, unit: "kg" },
    { id: "chapa-cobre-1mm", category: "Cobre", description: "Chapa Cobre 1mm", pricePerKg: 68.00, unit: "kg" },
    { id: "barra-bronze-1", category: "Bronze", description: 'Barra Bronze 1"', pricePerKg: 55.00, unit: "kg" },
    { id: "barra-latao-1", category: "Latão", description: 'Barra Latão 1"', pricePerKg: 48.00, unit: "kg" },
    
    // Consumíveis
    { id: "eletrodo-e6013", category: "Eletrodos", description: "Eletrodo E6013 - 3,25mm", pricePerKg: 18.50, unit: "kg" },
    { id: "eletrodo-e7018", category: "Eletrodos", description: "Eletrodo E7018 - 3,25mm", pricePerKg: 22.00, unit: "kg" },
    { id: "arame-mig-er70s", category: "Consumíveis Soldagem", description: "Arame MIG ER70S-6", pricePerKg: 16.50, unit: "kg" },
    { id: "arame-inox-308", category: "Consumíveis Soldagem", description: "Arame Inox 308L", pricePerKg: 85.00, unit: "kg" },
    { id: "gas-argonio", category: "Gases", description: "Argônio Industrial", pricePerKg: 45.00, unit: "m³" },
    { id: "gas-co2", category: "Gases", description: "CO2 Industrial", pricePerKg: 35.00, unit: "m³" },
    
    // Parafusos e Fixadores
    { id: "parafuso-m10", category: "Parafusos e Fixadores", description: "Parafuso M10 - Zincado", pricePerKg: 25.00, unit: "kg" },
    { id: "parafuso-m12", category: "Parafusos e Fixadores", description: "Parafuso M12 - Zincado", pricePerKg: 24.00, unit: "kg" },
    { id: "porca-m10", category: "Parafusos e Fixadores", description: "Porca M10 - Zincada", pricePerKg: 22.00, unit: "kg" },
    { id: "arruela-m10", category: "Parafusos e Fixadores", description: "Arruela M10 - Zincada", pricePerKg: 20.00, unit: "kg" },
    ];

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

  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  const pageWidth = 595;
  const pageHeight = 842;
  const margin = 40;
  const lineHeight = 20;
  
  canvas.width = pageWidth;
  canvas.height = pageHeight;
  
  ctx.fillStyle = '#000000';
  ctx.font = '12px Arial';
  
  let currentY = margin;
  
  const addText = (text: string, x: number = margin, fontSize: number = 12, isBold: boolean = false) => {
    ctx.font = `${isBold ? 'bold ' : ''}${fontSize}px Arial`;
    ctx.fillText(text, x, currentY);
    currentY += lineHeight * (fontSize / 12);
  };
  
  const addLine = () => {
    currentY += lineHeight / 2;
  };

  addText('MECALD - RELATÓRIO DE ANÁLISE DE PRAZOS', margin, 16, true);
  addText(`Gerado em: ${format(new Date(), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}`, margin, 10);
  addLine();
  
  ctx.beginPath();
  ctx.moveTo(margin, currentY);
  ctx.lineTo(pageWidth - margin, currentY);
  ctx.stroke();
  currentY += lineHeight;
  
  addText('DADOS DA SOLICITAÇÃO', margin, 14, true);
  addText(`Data de entrega solicitada: ${format(requestedDeliveryDate, "dd/MM/yyyy", { locale: ptBR })}`);
  addText(`Quantidade de itens: ${calculatorItems.length}`);
  addLine();
  
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

  // ─── NOVO: conjunto de códigos com precificação salva ───────────────────────
  const [savedPricingCodes, setSavedPricingCodes] = useState<Set<string>>(new Set());

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
  
  const [sectorWorkload, setSectorWorkload] = useState<Record<string, number>>({});

    // Estados da calculadora de preços
    const [stageCosts, setStageCosts] = useState<Record<string, number>>({});
    const [machineHourRate, setMachineHourRate] = useState<number>(150);
    const [consumablesCostPerKg, setConsumablesCostPerKg] = useState<number>(0);
    const [selectedProductForPricing, setSelectedProductForPricing] = useState<Product | null>(null);
    const [pricingCalculation, setPricingCalculation] = useState<PricingCalculation | null>(null);
    const [materialComposition, setMaterialComposition] = useState<MaterialCompositionItem[]>([]);
    const [profitMargin, setProfitMargin] = useState<number>(30);
    const [irpjRate, setIrpjRate] = useState<number>(4.8);
    const [csllRate, setCsllRate] = useState<number>(2.88);
    const [machiningHours, setMachiningHours] = useState<number>(0);
    const [pricingProductSearch, setPricingProductSearch] = useState<string>("");
    const [isCopyPricingDialogOpen, setIsCopyPricingDialogOpen] = useState(false);
    const [copyPricingSearch, setCopyPricingSearch] = useState("");
    const [copyPricingSourceId, setCopyPricingSourceId] = useState("");
    const [isCopyingPricing, setIsCopyingPricing] = useState(false);
    
    // Estados para materiais personalizados
    const [customMaterials, setCustomMaterials] = useState<Material[]>([]);
    const [isEditingMaterial, setIsEditingMaterial] = useState(false);
    const [materialToEdit, setMaterialToEdit] = useState<Material | null>(null);
    const [isMaterialDialogOpen, setIsMaterialDialogOpen] = useState(false);
    const [materialSearchQuery, setMaterialSearchQuery] = useState("");

  // ─── Plano de Fabricação ───
  const [selectedProductForPlan, setSelectedProductForPlan] = useState<Product | null>(null);
  const [planProductSearch, setPlanProductSearch] = useState<string>("");
  const [planDrawingNumber, setPlanDrawingNumber] = useState<string>("");
  const [planControlNumber, setPlanControlNumber] = useState<string>("");
  const [planRevision, setPlanRevision] = useState<string>("0");
  const [planCreator, setPlanCreator] = useState<string>("");
  const [planGeneralNotes, setPlanGeneralNotes] = useState<string>("");
  const [planTasks, setPlanTasks] = useState<PlanTask[]>([]);
  const [savedPlanDrawings, setSavedPlanDrawings] = useState<Set<string>>(new Set());
  const [isSavingPlan, setIsSavingPlan] = useState(false);

  // Lista de criadores (gerenciada em settings, como as etapas)
  const [planCreators, setPlanCreators] = useState<string[]>([]);
  const [newPlanCreator, setNewPlanCreator] = useState<string>("");

  // Combinar materiais padrão com personalizados
  const allMaterials = useMemo(() => {
    const deletedIds = customMaterials
      .filter((m: any) => m.deleted === true)
      .map(m => m.id);
    
    const customizedDefaultIds = customMaterials
      .filter((m: any) => m.deleted !== true && DEFAULT_MATERIALS.some(dm => dm.id === m.id))
      .map(m => m.id);
    
    const filteredDefaults = DEFAULT_MATERIALS.filter(
      m => !deletedIds.includes(m.id) && !customizedDefaultIds.includes(m.id)
    );
    
    const activeCustom = customMaterials.filter((m: any) => m.deleted !== true);
    
    return [...filteredDefaults, ...activeCustom];
  }, [customMaterials]);

  // Função para simular carga de trabalho dos setores
  const simulateSectorWorkload = useCallback(() => {
    const workload: Record<string, number> = {};
    manufacturingStages.forEach(stage => {
      workload[stage] = Math.random() * 0.95;
    });
    setSectorWorkload(workload);
  }, [manufacturingStages]);

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

  const [draggedIndex, setDraggedIndex] = useState<number | null>(null);
  const [draggedOverIndex, setDraggedOverIndex] = useState<number | null>(null);

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

  const materialForm = useForm<z.infer<typeof materialSchema>>({
    resolver: zodResolver(materialSchema),
    defaultValues: {
      category: "",
      description: "",
      pricePerKg: 0,
      unit: "kg",
      specification: "",
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

  const fetchCustomMaterials = useCallback(async () => {
    try {
      const docRef = doc(db, "companies", "mecald", "settings", "customMaterials");
      const docSnap = await getDoc(docRef);
      if (docSnap.exists() && docSnap.data().materials) {
        setCustomMaterials(docSnap.data().materials);
      }
    } catch (error) {
      console.error("Error fetching custom materials:", error);
    }
  }, []);

  // ─── NOVO: busca todos os códigos que já têm precificação salva ─────────────
  const fetchSavedPricingCodes = useCallback(async () => {
    try {
      const snap = await getDocs(collection(db, "companies", "mecald", "pricingCalculations"));
      setSavedPricingCodes(new Set(snap.docs.map(d => d.id)));
    } catch (error) {
      console.error("Error fetching saved pricing codes:", error);
    }
  }, []);

  // ─── NOVO: salva o resultado da precificação no Firestore ───────────────────
  const savePricingCalculation = useCallback(async (
    calculation: PricingCalculation,
    composition: MaterialCompositionItem[],
    hours: number
  ) => {
    try {
      const docRef = doc(db, "companies", "mecald", "pricingCalculations", calculation.productCode);
      await setDoc(docRef, {
        ...calculation,
        materialComposition: composition,
        machiningHours: hours,
        createdAt: Timestamp.now(),
        updatedAt: Timestamp.now(),
      }, { merge: true });

      // O preço final salvo no cadastro do produto já inclui IRPJ e CSLL.
      const productRef = doc(db, "companies", "mecald", "products", calculation.productId);
      await setDoc(productRef, {
        unitPrice: calculation.finalPrice,
        updatedAt: Timestamp.now(),
      }, { merge: true });

      setProducts(prev => prev.map(product =>
        product.id === calculation.productId
          ? { ...product, unitPrice: calculation.finalPrice }
          : product
      ));
      setSavedPricingCodes(prev => new Set([...prev, calculation.productCode]));
      toast({ title: "Precificação salva!", description: "Os dados foram armazenados e serão carregados automaticamente." });
    } catch (error) {
      console.error("Error saving pricing calculation:", error);
      toast({ variant: "destructive", title: "Erro ao salvar precificação" });
    }
  }, [toast]);

  // ─── NOVO: carrega precificação salva ao selecionar produto ────────────────
  const loadSavedPricing = useCallback(async (productCode: string) => {
    try {
      const docRef = doc(db, "companies", "mecald", "pricingCalculations", productCode);
      const snap = await getDoc(docRef);
      if (snap.exists()) {
        const data = snap.data();
        const composition: MaterialCompositionItem[] = data.materialComposition || [];
        setMaterialComposition(composition);
        setPricingCalculation(data as PricingCalculation);
        setProfitMargin(data.profitMargin ?? 30);
        setIrpjRate(data.irpjRate ?? 4.8);
        setCsllRate(data.csllRate ?? 2.88);
        setMachiningHours(data.machiningHours ?? 0);
        toast({
          title: "Precificação carregada!",
          description: `Dados anteriores de ${productCode} recuperados.`,
        });
      } else {
        setMaterialComposition([]);
        setPricingCalculation(null);
        setMachiningHours(0);
        setIrpjRate(4.8);
        setCsllRate(2.88);
      }
    } catch (error) {
      console.error("Error loading saved pricing:", error);
    }
  }, [toast]);

  const copySavedPricingToSelectedProduct = useCallback(async () => {
    if (!selectedProductForPricing || !copyPricingSourceId) {
      toast({
        variant: "destructive",
        title: "Seleção incompleta",
        description: "Selecione o produto de origem da precificação.",
      });
      return;
    }

    const sourceProduct = products.find(product => product.id === copyPricingSourceId);
    if (!sourceProduct) return;

    setIsCopyingPricing(true);
    try {
      const sourceRef = doc(db, "companies", "mecald", "pricingCalculations", sourceProduct.code);
      const sourceSnapshot = await getDoc(sourceRef);

      if (!sourceSnapshot.exists()) {
        throw new Error(`O produto ${sourceProduct.code} não possui precificação salva.`);
      }

      const sourceData = sourceSnapshot.data() as PricingCalculation & {
        materialComposition?: MaterialCompositionItem[];
        machiningHours?: number;
      };
      const copiedMaterials = sourceData.materialComposition || sourceData.materialCosts || [];
      const copiedCalculation: PricingCalculation = {
        ...sourceData,
        productId: selectedProductForPricing.id,
        productCode: selectedProductForPricing.code,
        productDescription: selectedProductForPricing.description,
        productWeight: selectedProductForPricing.unitWeight || sourceData.productWeight || 0,
        createdAt: new Date(),
      };

      const targetRef = doc(db, "companies", "mecald", "pricingCalculations", selectedProductForPricing.code);
      await setDoc(targetRef, {
        ...copiedCalculation,
        materialComposition: copiedMaterials,
        machiningHours: sourceData.machiningHours || 0,
        copiedFromProductId: sourceProduct.id,
        copiedFromProductCode: sourceProduct.code,
        createdAt: Timestamp.now(),
        updatedAt: Timestamp.now(),
      });

      // Mantém o preço unitário do catálogo sincronizado com a cópia.
      const targetProductRef = doc(db, "companies", "mecald", "products", selectedProductForPricing.id);
      await setDoc(targetProductRef, {
        unitPrice: Number(sourceData.finalPrice) || 0,
        pricingUpdatedAt: Timestamp.now(),
        updatedAt: Timestamp.now(),
      }, { merge: true });

      setMaterialComposition(copiedMaterials);
      setPricingCalculation(copiedCalculation);
      setProfitMargin(sourceData.profitMargin ?? 30);
      setIrpjRate(sourceData.irpjRate ?? 4.8);
      setCsllRate(sourceData.csllRate ?? 2.88);
      setMachiningHours(sourceData.machiningHours ?? 0);

      const copiedWeight = copiedCalculation.productWeight || 0;
      setConsumablesCostPerKg(copiedWeight > 0
        ? (Number(sourceData.consumablesCost) || 0) / copiedWeight
        : 0
      );
      setStageCosts((sourceData.stageCosts || []).reduce((result, stage) => ({
        ...result,
        [stage.stageName]: copiedWeight > 0
          ? (Number(stage.totalCost) || 0) / copiedWeight
          : Number(stage.costPerDay) || 0,
      }), {} as Record<string, number>));

      if ((sourceData.machiningHours || 0) > 0) {
        setMachineHourRate((Number(sourceData.machiningCost) || 0) / Number(sourceData.machiningHours));
      }

      setProducts(current => current.map(product =>
        product.id === selectedProductForPricing.id
          ? { ...product, unitPrice: Number(sourceData.finalPrice) || 0 }
          : product
      ));
      setSavedPricingCodes(current => new Set([...current, selectedProductForPricing.code]));
      setIsCopyPricingDialogOpen(false);
      setCopyPricingSourceId("");
      setCopyPricingSearch("");

      toast({
        title: "Precificação copiada!",
        description: `${sourceProduct.code} foi copiado para ${selectedProductForPricing.code}. A análise de custos dos pedidos já usará os novos valores.`,
      });
    } catch (error) {
      console.error("Erro ao copiar precificação:", error);
      toast({
        variant: "destructive",
        title: "Erro ao copiar precificação",
        description: error instanceof Error ? error.message : "Não foi possível concluir a cópia.",
      });
    } finally {
      setIsCopyingPricing(false);
    }
  }, [selectedProductForPricing, copyPricingSourceId, products, toast]);

  const saveMaterial = async (values: z.infer<typeof materialSchema>) => {
    try {
      const materialId = values.id || `custom-${Date.now()}`;
      const newMaterial: Material = {
        ...values,
        id: materialId,
      };

      let updatedCustomMaterials = [...customMaterials];
      let isDefaultMaterial = false;

      if (materialToEdit) {
        const isDefault = DEFAULT_MATERIALS.some(m => m.id === materialToEdit.id);
        
        if (isDefault) {
          isDefaultMaterial = true;
          updatedCustomMaterials = updatedCustomMaterials.filter(m => m.id !== materialToEdit.id);
          updatedCustomMaterials.push(newMaterial);
        } else {
          updatedCustomMaterials = updatedCustomMaterials.map(m => 
            m.id === materialToEdit.id ? newMaterial : m
          );
        }
      } else {
        updatedCustomMaterials.push(newMaterial);
      }

      const docRef = doc(db, "companies", "mecald", "settings", "customMaterials");
      await setDoc(docRef, { materials: updatedCustomMaterials });
      
      setCustomMaterials(updatedCustomMaterials);
      toast({
        title: materialToEdit ? "Material atualizado!" : "Material adicionado!",
        description: isDefaultMaterial 
          ? "Material padrão customizado com sucesso" 
          : undefined
      });
      
      setIsMaterialDialogOpen(false);
      materialForm.reset();
      setMaterialToEdit(null);
    } catch (error) {
      console.error("Error saving material:", error);
      toast({
        variant: "destructive",
        title: "Erro ao salvar material",
      });
    }
  };

  const deleteMaterial = async (materialId: string) => {
    try {
      const isDefault = DEFAULT_MATERIALS.some(m => m.id === materialId);
      let updatedCustomMaterials = [...customMaterials];
      
      if (isDefault) {
        const hiddenMaterial = { 
          ...DEFAULT_MATERIALS.find(m => m.id === materialId)!,
          deleted: true 
        };
        updatedCustomMaterials = updatedCustomMaterials.filter(m => m.id !== materialId);
        updatedCustomMaterials.push(hiddenMaterial as any);
      } else {
        updatedCustomMaterials = updatedCustomMaterials.filter(m => m.id !== materialId);
      }
      
      const docRef = doc(db, "companies", "mecald", "settings", "customMaterials");
      await setDoc(docRef, { materials: updatedCustomMaterials });
      
      setCustomMaterials(updatedCustomMaterials);
      toast({ 
        title: "Material removido!",
        description: isDefault ? "Material padrão ocultado da sua biblioteca" : undefined
      });
    } catch (error) {
      console.error("Error deleting material:", error);
      toast({
        variant: "destructive",
        title: "Erro ao remover material",
      });
    }
  };

  const handleEditMaterial = (material: Material) => {
    setMaterialToEdit(material);
    materialForm.reset(material);
    setIsMaterialDialogOpen(true);
  };

  const handleAddMaterial = () => {
    setMaterialToEdit(null);
    materialForm.reset({
      category: "",
      description: "",
      pricePerKg: 0,
      unit: "kg",
      specification: "",
    });
    setIsMaterialDialogOpen(true);
  };


  // Busca criadores cadastrados
  const fetchPlanCreators = useCallback(async () => {
    try {
      const ref = doc(db, "companies", "mecald", "settings", "planCreators");
      const snap = await getDoc(ref);
      if (snap.exists() && Array.isArray(snap.data().creators)) {
        setPlanCreators(snap.data().creators);
      }
    } catch (error) {
      console.error("Error fetching plan creators:", error);
    }
  }, []);

  // Adiciona um criador à lista
  const addPlanCreator = useCallback(async () => {
    const name = newPlanCreator.trim();
    if (!name) return;
    try {
      const ref = doc(db, "companies", "mecald", "settings", "planCreators");
      await setDoc(ref, { creators: arrayUnion(name) }, { merge: true });
      setPlanCreators(prev => Array.from(new Set([...prev, name])));
      setPlanCreator(name);
      setNewPlanCreator("");
      toast({ title: "Responsável adicionado!" });
    } catch (error) {
      console.error("Error adding creator:", error);
      toast({ variant: "destructive", title: "Erro ao adicionar responsável" });
    }
  }, [newPlanCreator, toast]);

  // Busca quais desenhos já têm plano salvo (para indicador visual)
  const fetchSavedPlanDrawings = useCallback(async () => {
    try {
      const snap = await getDocs(collection(db, "companies", "mecald", "manufacturingPlans"));
      setSavedPlanDrawings(new Set(snap.docs.map(d => d.id)));
    } catch (error) {
      console.error("Error fetching saved plans:", error);
    }
  }, []);

  // Gera numeração de controle automática (PF-ANO-0001)
  const generatePlanControlNumber = useCallback(async () => {
    const year = new Date().getFullYear();
    try {
      const snap = await getDocs(collection(db, "companies", "mecald", "manufacturingPlans"));
      const seq = snap.size + 1;
      return `PF-${year}-${String(seq).padStart(4, '0')}`;
    } catch {
      return `PF-${year}-0001`;
    }
  }, []);

  // Inicializa as tarefas a partir das etapas do produto selecionado
  const initPlanTasksFromProduct = useCallback((product: Product) => {
    const stages = product.productionPlanTemplate || [];
    setPlanTasks(stages.map(s => ({
      stageName: s.stageName,
      instructions: "",
      deadlineDays: s.durationDays || 0,
      images: [],
    })));
  }, []);

  // Carrega plano salvo a partir do número do desenho
  const loadManufacturingPlan = useCallback(async (drawingNumber: string) => {
    const id = drawingNumber.trim();
    if (!id) return;
    try {
      const ref = doc(db, "companies", "mecald", "manufacturingPlans", id);
      const snap = await getDoc(ref);
      if (snap.exists()) {
        const data = snap.data() as ManufacturingPlan;
        setPlanControlNumber(data.controlNumber || "");
        setPlanRevision(data.revision || "0");
        setPlanCreator(data.createdBy || "");
        setPlanGeneralNotes(data.generalNotes || "");
        setPlanTasks(data.tasks || []);
        if (data.productCode) {
          const prod = products.find(p => p.code === data.productCode);
          if (prod) setSelectedProductForPlan(prod);
        }
        toast({ title: "Plano carregado!", description: `Desenho ${id} recuperado.` });
      } else {
        toast({ title: "Novo plano", description: "Nenhum plano salvo para este desenho ainda." });
      }
    } catch (error) {
      console.error("Error loading plan:", error);
    }
  }, [products, toast]);

  // Comprime e converte imagem para base64
  const compressImageToDataUrl = (file: File, maxWidth = 1000, quality = 0.7): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onerror = () => reject(new Error("Falha ao ler o arquivo"));
      reader.onload = (e) => {
        const img = new window.Image();
        img.onerror = () => reject(new Error("Falha ao decodificar a imagem"));
        img.onload = () => {
          try {
            const canvas = document.createElement('canvas');
            let { width, height } = img;
            if (width > maxWidth) {
              height = Math.round((height * maxWidth) / width);
              width = maxWidth;
            }
            canvas.width = width;
            canvas.height = height;
            const ctx = canvas.getContext('2d');
            if (!ctx) return reject(new Error("Canvas não suportado"));
            ctx.fillStyle = '#ffffff';
            ctx.fillRect(0, 0, width, height);
            ctx.drawImage(img, 0, 0, width, height);
            resolve(canvas.toDataURL('image/jpeg', quality));
          } catch (err) {
            reject(err);
          }
        };
        img.src = e.target?.result as string;
      };
      reader.readAsDataURL(file);
    });
  };

  const getImageDimensions = (dataUrl: string): Promise<{ w: number; h: number }> =>
    new Promise((resolve) => {
      const img = new window.Image();
      img.onload = () => resolve({ w: img.width, h: img.height });
      img.onerror = () => resolve({ w: 4, h: 3 });
      img.src = dataUrl;
    });

  // Upload de imagens em uma tarefa
  const handlePlanImageUpload = useCallback(async (taskIndex: number, files: File[]) => {
    if (!files.length) return;
    const newImages: PlanImage[] = [];
    for (const file of files) {
      if (!file.type.startsWith('image/')) continue;
      try {
        const dataUrl = await compressImageToDataUrl(file);
        newImages.push({ dataUrl, caption: "" });
      } catch (error) {
        console.error("Erro ao processar imagem:", file.name, error);
        toast({
          variant: "destructive",
          title: "Erro ao carregar imagem",
          description: `${file.name}: ${error instanceof Error ? error.message : String(error)}`,
        });
      }
    }
    if (newImages.length) {
      setPlanTasks(prev => prev.map((t, i) =>
        i === taskIndex ? { ...t, images: [...(t.images || []), ...newImages] } : t
      ));
    }
  }, [toast]);

  // Salva o plano (chave = número do desenho)
  const saveManufacturingPlan = useCallback(async () => {
    if (!planDrawingNumber.trim()) {
      toast({ variant: "destructive", title: "Número do desenho obrigatório", description: "Informe o número do desenho para salvar." });
      return;
    }
    if (planDrawingNumber.includes('/')) {
      toast({ variant: "destructive", title: "Número inválido", description: "O número do desenho não pode conter '/'." });
      return;
    }
    if (!planCreator) {
      toast({ variant: "destructive", title: "Selecione o criador", description: "Informe quem está criando este plano." });
      return;
    }
    setIsSavingPlan(true);
    try {
      const id = planDrawingNumber.trim();
      let control = planControlNumber;
      const isNew = !control;
      if (isNew) {
        control = await generatePlanControlNumber();
        setPlanControlNumber(control);
      }
      const ref = doc(db, "companies", "mecald", "manufacturingPlans", id);
      await setDoc(ref, {
        controlNumber: control,
        drawingNumber: id,
        productCode: selectedProductForPlan?.code || "",
        productDescription: selectedProductForPlan?.description || "",
        revision: planRevision || "0",
        createdBy: planCreator,
        generalNotes: planGeneralNotes,
        tasks: planTasks,
        ...(isNew ? { createdAt: Timestamp.now() } : {}),
        updatedAt: Timestamp.now(),
      }, { merge: true });
      setSavedPlanDrawings(prev => new Set([...prev, id]));
      toast({ title: "Plano salvo!", description: `Controle ${control} • Desenho ${id}` });
    } catch (error) {
      console.error("Error saving plan:", error);
      toast({ variant: "destructive", title: "Erro ao salvar plano" });
    } finally {
      setIsSavingPlan(false);
    }
  }, [planDrawingNumber, planControlNumber, planCreator, planRevision, planGeneralNotes, planTasks, selectedProductForPlan, generatePlanControlNumber, toast]);

  useEffect(() => {
    if (!authLoading && user) {
      fetchProducts();
      fetchStages();
      fetchCustomMaterials();
      fetchSavedPricingCodes();
      fetchPlanCreators();
      fetchSavedPlanDrawings();
    }
  }, [user, authLoading, fetchProducts, fetchStages, fetchCustomMaterials, fetchSavedPricingCodes, fetchPlanCreators, fetchSavedPlanDrawings]);
  
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
  
  const handleDuplicateClick = (product: Product) => {
    const originalCode = product.code;
    const duplicatedCode = `${originalCode}_COPIA`;
    
    let finalCode = duplicatedCode;
    let counter = 1;
    while (products.some(p => p.code === finalCode)) {
      finalCode = `${originalCode}_COPIA_${counter}`;
      counter++;
    }
    
    setSelectedProduct(null);
    const planTemplate = product.productionPlanTemplate || (product.manufacturingStages 
        ? product.manufacturingStages.map((stage: string) => ({ stageName: stage, durationDays: 0 }))
        : []);
    
    form.reset({
      code: finalCode,
      description: `${product.description} (Cópia)`,
      unitPrice: product.unitPrice,
      unitWeight: product.unitWeight || 0,
      productionPlanTemplate: planTemplate
    });
    setIsFormOpen(true);
    
    toast({
      title: "Produto duplicado!",
      description: `Os dados de "${product.description}" foram copiados. Ajuste o código e descrição conforme necessário.`,
    });
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

  const handleDragStart = useCallback((e: React.DragEvent, index: number) => {
    setDraggedIndex(index);
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/html', e.currentTarget.outerHTML);
    
    setTimeout(() => {
      if (e.currentTarget) {
        e.currentTarget.style.opacity = '0.5';
      }
    }, 0);
  }, []);

  const handleDragEnd = useCallback((e: React.DragEvent) => {
    if (e.currentTarget) {
      e.currentTarget.style.opacity = '';
    }
    setDraggedIndex(null);
    setDraggedOverIndex(null);
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
  }, []);

  const handleDrop = useCallback(async (e: React.DragEvent, dropIndex: number) => {
    e.preventDefault();
    
    if (draggedIndex === null || draggedIndex === dropIndex) return;

    const newStages = [...manufacturingStages];
    const draggedItem = newStages[draggedIndex];
    
    newStages.splice(draggedIndex, 1);
    
    const insertIndex = draggedIndex < dropIndex ? dropIndex - 1 : dropIndex;
    newStages.splice(insertIndex, 0, draggedItem);
    
    try {
      await updateDoc(stagesDocRef, { stages: newStages });
      toast({ title: "Ordem das etapas atualizada!" });
      await fetchStages(); 
    } catch (error) {
      console.error("Error reordering stages:", error);
      toast({ variant: "destructive", title: "Erro ao reordenar etapas" });
    }
  }, [draggedIndex, manufacturingStages, stagesDocRef, fetchStages, toast]);

  const DraggableStageItem = ({ stage, index, onEdit, onDelete, isDragging }: {
    stage: string;
    index: number;
    onEdit: (stage: string, index: number) => void;
    onDelete: (stage: string) => void;
    isDragging: boolean;
  }) => {
    return (
      <div
        draggable
        onDragStart={(e) => handleDragStart(e, index)}
        onDragEnd={handleDragEnd}
        onDragOver={handleDragOver}
        onDrop={(e) => handleDrop(e, index)}
        className={`flex items-center justify-between rounded-md border p-3 cursor-move transition-all duration-200 ${
          isDragging 
            ? 'opacity-50 scale-95 border-primary bg-primary/5' 
            : 'hover:border-primary/50 hover:shadow-sm'
        }`}
      >
        <div className="flex items-center gap-3">
          <GripVertical className="h-4 w-4 text-muted-foreground cursor-grab active:cursor-grabbing" />
          <span className="font-medium">{stage}</span>
        </div>
        <div className="flex items-center gap-1">
          <Button variant="ghost" size="icon" onClick={() => onEdit(stage, index)}>
            <Pencil className="h-4 w-4" />
          </Button>
          <Button 
            variant="ghost" 
            size="icon" 
            className="text-destructive hover:text-destructive" 
            onClick={() => onDelete(stage)}
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
      </div>
    );
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

  const removeItemFromCalculator = (id: string) => {
    setCalculatorItems(prev => prev.filter(item => item.id !== id));
  };

  const calculateFeasibility = () => {
    if (calculatorItems.length === 0) {
      toast({
        variant: "destructive",
        title: "Lista vazia",
        description: "Adicione pelo menos um item para calcular."
      });
      return;
    }

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

    const baseLeadTime = Math.max(...calculatorItems.map(item => {
      return item.stages.reduce((sum, stage) => sum + (stage.durationDays || 0), 0);
    }));
    const longestProductItem = calculatorItems.find(item => {
      const itemLeadTime = item.stages.reduce((sum, stage) => sum + (stage.durationDays || 0), 0);
      return itemLeadTime === baseLeadTime;
    });

    if (!longestProductItem) {
      toast({
        variant: "destructive",
        title: "Erro de cálculo",
        description: "Não foi possível identificar o produto crítico."
      });
      return;
    }

    const analysis = longestProductItem.stages.map((stage) => {
      const currentWorkload = sectorWorkload[stage.stageName] || 0;
      let adjustmentFactor = 1;
      let isBottleneck = false;
      if (currentWorkload >= 0.9) {
        adjustmentFactor = 2.5 + (currentWorkload - 0.9) * 10;
        isBottleneck = true;
      } else if (currentWorkload >= 0.8) {
        adjustmentFactor = 1.8 + (currentWorkload - 0.8) * 7;
        isBottleneck = true;
      } else if (currentWorkload >= 0.7) {
        adjustmentFactor = 1.3 + (currentWorkload - 0.7) * 5;
        isBottleneck = currentWorkload >= 0.75;
      } else if (currentWorkload >= 0.5) {
        adjustmentFactor = 1.0 + (currentWorkload - 0.5) * 1.5;
      } else {
        adjustmentFactor = 0.8 + currentWorkload * 0.4;
      }
      const adjustedDuration = Math.ceil((stage.durationDays || 0) * adjustmentFactor);
      return {
        stageName: stage.stageName,
        originalDuration: stage.durationDays || 0,
        adjustedDuration,
        workload: currentWorkload,
        bottleneck: isBottleneck
      };
    });

    let totalAdjustedLeadTime = analysis.reduce((sum, stage) => sum + stage.adjustedDuration, 0);

    const suggestedDate = new Date();
    suggestedDate.setDate(suggestedDate.getDate() + totalAdjustedLeadTime);

    const daysUntilRequested = Math.ceil((requestedDeliveryDate.getTime() - new Date().getTime()) / (1000 * 60 * 60 * 24));
    const isViable = daysUntilRequested >= totalAdjustedLeadTime;

    let confidence = 90;
    const avgWorkload = analysis.reduce((sum, a) => sum + a.workload, 0) / analysis.length;
    confidence -= avgWorkload * 60;
    const bottleneckCount = analysis.filter(a => a.bottleneck).length;
    confidence -= bottleneckCount * 25;
    const timeMargin = (daysUntilRequested - totalAdjustedLeadTime) / totalAdjustedLeadTime;
    if (timeMargin < 0) {
      confidence -= 30;
    } else if (timeMargin < 0.2) {
      confidence -= 20;
    } else if (timeMargin > 0.5) {
      confidence += 10;
    }
    confidence = Math.min(95, Math.max(5, Math.round(confidence)));

    setCalculatorResults({
      isViable,
      suggestedDate,
      analysis,
      totalAdjustedLeadTime,
      confidence
    });
  };

  const clearCalculator = () => {
    setCalculatorItems([]);
    setCalculatorResults(null);
    setSelectedProductForCalculator("");
    setCalculatorQuantity(1);
  };

  const exportCatalogToExcel = () => {
    if (filteredProducts.length === 0) {
      toast({
        variant: "destructive",
        title: "Nenhum produto para exportar",
        description: searchQuery
          ? `Nenhum produto encontrado para "${searchQuery}".`
          : "O catálogo está vazio.",
      });
      return;
    }

    const data = filteredProducts.map((product) => ({
      Código: product.code,
      Descrição: product.description,
      "Preço Unitário (R$)": product.unitPrice,
      "Peso Unitário (kg)": product.unitWeight || 0,
      "Lead Time (dias)": calculateLeadTime(product),
    }));

    const ws = XLSX.utils.json_to_sheet(data);

    ws["!cols"] = [
      { wch: 20 },
      { wch: 50 },
      { wch: 18 },
      { wch: 18 },
      { wch: 16 },
    ];

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Catálogo de Produtos");

    const fileName = `catalogo-produtos-mecald-${format(new Date(), "yyyyMMdd-HHmm")}.xlsx`;
    XLSX.writeFile(wb, fileName);

    toast({
      title: "Catálogo exportado!",
      description: `${filteredProducts.length} produtos exportados para Excel.`,
    });
  };

  const handleExportReport = () => {
    if (calculatorItems.length === 0) {
      toast({
        variant: "destructive",
        title: "Lista vazia",
        description: "Adicione produtos à análise antes de exportar o relatório."
      });
      return;
    }

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
            .bottleneck { color: #dc2626; font-weight: bold; }
            .recommendation { padding: 15px; margin: 10px 0; border-radius: 5px; }
            .rec-danger { background-color: #fef2f2; border-left: 4px solid #dc2626; }
            .rec-warning { background-color: #fffbeb; border-left: 4px solid #f59e0b; }
            .rec-info { background-color: #eff6ff; border-left: 4px solid #3b82f6; }
            table { width: 100%; border-collapse: collapse; margin: 10px 0; }
            th, td { border: 1px solid #ddd; padding: 8px; text-align: left; }
            th { background-color: #f5f5f5; }
            @media print { .no-print { display: none; } body { margin: 0; } }
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
                  O prazo solicitado não pode ser cumprido. Recomenda-se reagendar para ${format(calculatorResults.suggestedDate, "dd/MM/yyyy", { locale: ptBR })} ou posterior.
                </div>
              ` : ''}
              ${calculatorResults.confidence < 70 ? `
                <div class="recommendation rec-warning">
                  <strong>⚠️ Baixa Confiança (${calculatorResults.confidence}%)</strong><br>
                  A alta carga dos setores produtivos pode causar atrasos. Recomenda-se monitoramento constante e planos de contingência.
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
                  O prazo é viável com boa margem de segurança. Mantenha o monitoramento regular do progresso.
                </div>
              ` : ''}
            </div>
          ` : ''}

          <div class="section" style="margin-top: 40px; font-size: 10px; color: #666; text-align: center;">
            <p>Este relatório foi gerado automaticamente pelo sistema MECALD em ${format(new Date(), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}</p>
          </div>

          <script>
            window.onload = function() { window.print(); setTimeout(function() { window.close(); }, 1000); }
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

    const fetchCompanyDataForPDF = useCallback(async () => {
        try {
        const companyRef = doc(db, "companies", "mecald", "settings", "company");
        const docSnap = await getDoc(companyRef);
        if (docSnap.exists()) {
            return docSnap.data();
        }
        } catch (error) {
        console.error("Error fetching company data:", error);
        }
        return null;
    }, []);


  const exportManufacturingPlanPDF = useCallback(async () => {
    if (planTasks.length === 0 || !planDrawingNumber.trim()) {
      toast({ variant: "destructive", title: "Dados insuficientes", description: "Selecione o produto/etapas e informe o número do desenho." });
      return;
    }
    const companyData = await fetchCompanyDataForPDF();
    const doc = new jsPDF();
    const pageWidth = doc.internal.pageSize.getWidth();
    const pageHeight = doc.internal.pageSize.getHeight();
    const margin = 20;
    const contentWidth = pageWidth - 2 * margin;
    let y = margin;

    const checkBreak = (need = 20) => {
      if (y + need > pageHeight - 28) { doc.addPage(); y = margin; return true; }
      return false;
    };

    // ── Cabeçalho da empresa ──
    doc.setFillColor(37, 99, 235);
    doc.rect(0, 0, pageWidth, 42, 'F');
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(22); doc.setFont('helvetica', 'bold');
    doc.text((companyData?.nomeFantasia || 'MECALD').toUpperCase(), margin, 18);
    doc.setFontSize(14); doc.setFont('helvetica', 'normal');
    doc.text('PLANO DE FABRICAÇÃO', margin, 28);
    doc.setFontSize(9);
    doc.text(`Emitido em: ${format(new Date(), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}`, margin, 36);

    // Logo (mesmo padrão do relatório de precificação)
    if (companyData?.logo?.preview) {
      try {
        let logoSrc = companyData.logo.preview;
        if (!logoSrc.startsWith('data:')) logoSrc = `data:image/png;base64,${logoSrc}`;
        const base64Data = logoSrc.split(',')[1] || logoSrc;
        const imageType = logoSrc.match(/data:image\/(\w+)/)?.[1] || 'png';
        doc.addImage(base64Data, imageType.toUpperCase(), pageWidth - margin - 40, 8, 38, 26, undefined, 'FAST');
      } catch { /* ignora logo inválido */ }
    }

    y = 52;
    doc.setTextColor(0, 0, 0);

    // ── Caixa de identificação ──
    doc.setFillColor(239, 246, 255);
    doc.setDrawColor(59, 130, 246);
    doc.roundedRect(margin, y, contentWidth, 34, 3, 3, 'FD');
    doc.setFontSize(9); doc.setFont('helvetica', 'bold');
    doc.setTextColor(30, 64, 175);
    doc.text('IDENTIFICAÇÃO DO DOCUMENTO', margin + 4, y + 7);
    doc.setTextColor(0, 0, 0); doc.setFont('helvetica', 'normal');
    doc.text(`Nº de Controle: ${planControlNumber || '(gerado ao salvar)'}`, margin + 4, y + 15);
    doc.text(`Nº do Desenho: ${planDrawingNumber}`, pageWidth / 2 + 6, y + 15);
    doc.text(`Produto: ${(selectedProductForPlan?.code || '-') + ' ' + (selectedProductForPlan?.description || '')}`.substring(0, 60), margin + 4, y + 22);
    doc.text(`Revisão: ${planRevision || '0'}`, pageWidth / 2 + 6, y + 22);
    doc.text(`Elaborado por: ${planCreator || '-'}`, margin + 4, y + 29);
    y += 42;

    // ── Aviso de confidencialidade ──
    checkBreak(40);
    const empresa = (companyData?.nomeFantasia || companyData?.razaoSocial || 'MECALD').toUpperCase();
    doc.setFillColor(254, 242, 242);
    doc.setDrawColor(220, 38, 38);
    const confText =
      `DOCUMENTO CONFIDENCIAL — USO INTERNO RESTRITO. Este Plano de Fabricação e todo o seu conteúdo ` +
      `(procedimentos, desenhos, imagens e especificações) constituem segredo de indústria e propriedade ` +
      `intelectual de ${empresa}. Sua reprodução, divulgação, cópia ou utilização, total ou parcial, fora do ` +
      `ambiente da empresa, sem autorização expressa e por escrito, é proibida. A violação sujeita o infrator ` +
      `às sanções da Lei nº 9.279/1996 (Lei da Propriedade Industrial), em especial art. 195, incisos XI e XII ` +
      `(crime de concorrência desleal), do art. 482, "g", da CLT (justa causa por violação de segredo da empresa) ` +
      `e demais cominações civis e penais aplicáveis.`;
    const confLines = doc.splitTextToSize(confText, contentWidth - 8);
    const confBoxH = confLines.length * 4.5 + 8;
    doc.roundedRect(margin, y, contentWidth, confBoxH, 2, 2, 'FD');
    doc.setFontSize(7.5); doc.setFont('helvetica', 'normal');
    doc.setTextColor(153, 27, 27);
    doc.text(confLines, margin + 4, y + 6);
    y += confBoxH + 8;
    doc.setTextColor(0, 0, 0);

    // ── Notas gerais ──
    if (planGeneralNotes.trim()) {
      checkBreak(20);
      doc.setFontSize(11); doc.setFont('helvetica', 'bold');
      doc.text('OBSERVAÇÕES GERAIS', margin, y); y += 6;
      doc.setFontSize(9); doc.setFont('helvetica', 'normal');
      const notes = doc.splitTextToSize(planGeneralNotes, contentWidth);
      notes.forEach((ln: string) => { checkBreak(6); doc.text(ln, margin, y); y += 5; });
      y += 4;
    }

    // ── Tarefas por etapa ──
    for (let idx = 0; idx < planTasks.length; idx++) {
      const task = planTasks[idx];
      checkBreak(24);
      doc.setFillColor(37, 99, 235);
      doc.rect(margin, y - 5, contentWidth, 8, 'F');
      doc.setTextColor(255, 255, 255);
      doc.setFontSize(10); doc.setFont('helvetica', 'bold');
      doc.text(`ETAPA ${idx + 1}: ${task.stageName}`, margin + 3, y);
      doc.text(`Prazo: ${task.deadlineDays || 0} dia(s)`, pageWidth - margin - 3, y, { align: 'right' });
      doc.setTextColor(0, 0, 0);
      y += 9;

      doc.setFontSize(9); doc.setFont('helvetica', 'normal');
      const taskInstructions = task.instructions?.trim() ? task.instructions : 'Sem instruções cadastradas.';
      const instrLines = doc.splitTextToSize(taskInstructions, contentWidth);
      instrLines.forEach((ln: string) => { checkBreak(6); doc.text(ln, margin, y); y += 5; });
      y += 2;

      // Imagens
      if (task.images && task.images.length > 0) {
        for (const img of task.images) {
          const dims = await getImageDimensions(img.dataUrl);
          const targetW = 90;
          const targetH = (dims.h / dims.w) * targetW;
          checkBreak(targetH + (img.caption ? 8 : 4));
          try {
            doc.addImage(img.dataUrl, 'JPEG', margin, y, targetW, targetH, undefined, 'FAST');
          } catch { /* ignora imagem inválida */ }
          y += targetH + 2;
          if (img.caption?.trim()) {
            doc.setFontSize(8); doc.setFont('helvetica', 'italic');
            doc.setTextColor(100, 100, 100);
            doc.text(doc.splitTextToSize(img.caption, contentWidth), margin, y);
            y += 5;
            doc.setTextColor(0, 0, 0);
          }
          y += 2;
        }
      }
      y += 4;
    }

    // ── Rodapé em todas as páginas ──
    const totalPages = doc.internal.pages.length - 1;
    for (let i = 1; i <= totalPages; i++) {
      doc.setPage(i);
      doc.setFontSize(7);
      doc.setTextColor(150, 150, 150);
      doc.text(`DOCUMENTO CONFIDENCIAL — ${empresa} • Controle ${planControlNumber || '-'} • Desenho ${planDrawingNumber}`, pageWidth / 2, pageHeight - 14, { align: 'center' });
      doc.text(`Página ${i} de ${totalPages}`, pageWidth / 2, pageHeight - 9, { align: 'center' });
    }

    doc.save(`plano-fabricacao-${planDrawingNumber}-${format(new Date(), 'yyyyMMdd-HHmm')}.pdf`);
    toast({ title: "PDF gerado!", description: "O plano de fabricação foi baixado." });
  }, [planTasks, planDrawingNumber, planControlNumber, planRevision, planCreator, planGeneralNotes, selectedProductForPlan, fetchCompanyDataForPDF, toast]);

    const saveStageCosts = useCallback(async () => {
        try {
        const costsRef = doc(db, "companies", "mecald", "settings", "stageCosts");
        await setDoc(costsRef, { 
            costs: stageCosts, 
            machineHourRate,
            consumablesCostPerKg
        }, { merge: true });
        toast({ title: "Custos salvos com sucesso!" });
        } catch (error) {
        console.error("Error saving stage costs:", error);
        toast({ variant: "destructive", title: "Erro ao salvar custos" });
        }
    }, [stageCosts, machineHourRate, consumablesCostPerKg, toast]);

    const loadStageCosts = useCallback(async () => {
        try {
        const costsRef = doc(db, "companies", "mecald", "settings", "stageCosts");
        const docSnap = await getDoc(costsRef);
        if (docSnap.exists()) {
            const data = docSnap.data();
            setStageCosts(data.costs || {});
            setMachineHourRate(data.machineHourRate || 150);
            setConsumablesCostPerKg(data.consumablesCostPerKg || 0);
        }
        } catch (error) {
        console.error("Error loading stage costs:", error);
        }
    }, []);

    useEffect(() => {
        if (!authLoading && user) {
        loadStageCosts();
        }
    }, [user, authLoading, loadStageCosts]);

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
                    <TabsTrigger value="pricing">
                        <Calculator className="mr-2 h-4 w-4" />
                        Calculadora de Preços
                    </TabsTrigger>
                    <TabsTrigger value="manufacturingPlan">
                        <BookOpen className="mr-2 h-4 w-4" />
                        Plano de Fabricação
                    </TabsTrigger>
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
                                <Button onClick={exportCatalogToExcel} variant="outline" size="sm">
                                    <Download className="mr-2 h-4 w-4" />
                                    Exportar Excel
                                </Button>
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
                                {/* ─── NOVO: coluna de precificação ─── */}
                                <TableHead className="w-[100px] text-center">Precificação</TableHead>
                                <TableHead className="w-[140px] text-center">Ações</TableHead>
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
                                        {/* ─── NOVO: badge indicador de precificação salva ─── */}
                                        <TableCell className="text-center">
                                            {savedPricingCodes.has(product.code) ? (
                                                <Badge
                                                    variant="outline"
                                                    className="cursor-pointer border-green-500 text-green-600 hover:bg-green-50"
                                                    title="Precificação salva — clique para abrir"
                                                    onClick={() => {
                                                        setActiveTab("pricing");
                                                        setPricingProductSearch(product.code);
                                                        setSelectedProductForPricing(product);
                                                        loadSavedPricing(product.code);
                                                    }}
                                                >
                                                    <Calculator className="mr-1 h-3 w-3" />
                                                    Salvo
                                                </Badge>
                                            ) : (
                                                <span className="text-xs text-muted-foreground">—</span>
                                            )}
                                        </TableCell>
                                        <TableCell className="text-center">
                                            <div className="flex items-center justify-center gap-2">
                                                <Button variant="ghost" size="icon" onClick={() => handleEditClick(product)}>
                                                    <Pencil className="h-4 w-4" />
                                                    <span className="sr-only">Editar</span>
                                                </Button>
                                                <Button variant="ghost" size="icon" onClick={() => handleDuplicateClick(product)}>
                                                    <Copy className="h-4 w-4" />
                                                    <span className="sr-only">Duplicar</span>
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
                                    <TableCell colSpan={6} className="text-center h-24">
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
                            Cadastre e gerencie as etapas do seu processo produtivo. 
                            <strong> Arraste e solte para reordenar rapidamente.</strong>
                        </CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-6">
                        <div className="flex items-center gap-2">
                            <Input 
                                placeholder="Nome da nova etapa (ex: Solda, Pintura)"
                                value={newStageName}
                                onChange={(e) => setNewStageName(e.target.value)}
                                onKeyDown={(e) => e.key === 'Enter' && handleAddStage()}
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
                                <div className="flex items-center justify-between mb-4">
                                    <h3 className="text-sm font-medium text-muted-foreground">
                                        ETAPAS CADASTRADAS ({manufacturingStages.length})
                                    </h3>
                                    {manufacturingStages.length > 1 && (
                                        <div className="text-xs text-muted-foreground flex items-center gap-2">
                                            <GripVertical className="h-3 w-3" />
                                            Arraste para reordenar
                                        </div>
                                    )}
                                </div>
                                
                                {manufacturingStages.length > 0 ? (
                                    <div className="space-y-2">
                                        {manufacturingStages.map((stage, index) => (
                                            <DraggableStageItem
                                                key={`${stage}-${index}`}
                                                stage={stage}
                                                index={index}
                                                onEdit={handleEditStageClick}
                                                onDelete={handleDeleteStageClick}
                                                isDragging={draggedIndex === index}
                                            />
                                        ))}
                                    </div>
                                ) : (
                                    <div className="text-center py-8 text-muted-foreground">
                                        <div className="mb-2 text-2xl">📋</div>
                                        <p className="font-medium">Nenhuma etapa cadastrada</p>
                                        <p className="text-sm">Adicione a primeira etapa acima</p>
                                    </div>
                                )}
                            </div>
                        )}
                        
                        {manufacturingStages.length > 1 && (
                            <div className="bg-muted/30 rounded-lg p-4 text-sm border">
                                <div className="font-medium mb-2 flex items-center gap-2">
                                    💡 Dicas de uso
                                </div>
                                <ul className="space-y-1 text-muted-foreground text-xs">
                                    <li>• <strong>Arrastar:</strong> Clique e arraste usando o ícone ⋮⋮ para reordenar</li>
                                    <li>• <strong>Lead time:</strong> A ordem das etapas afeta o cálculo do tempo total</li>
                                    <li>• <strong>Salvamento:</strong> Mudanças são salvas automaticamente no Firebase</li>
                                </ul>
                            </div>
                        )}
                    </CardContent>
                </Card>
            </TabsContent>
            <TabsContent value="calculator" className="mt-4">
                <div className="grid gap-6 lg:grid-cols-2">
                    <Card>
                        <CardHeader>
                            <CardTitle>Calculadora de Viabilidade de Prazos</CardTitle>
                            <CardDescription>
                                Analise se é possível cumprir prazos considerando a carga atual dos setores de produção.
                            </CardDescription>
                        </CardHeader>
                        <CardContent className="space-y-6">
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
                <TabsContent value="pricing" className="mt-4">
                    <div className="grid gap-6">
                        <Card>
                            <CardHeader>
                                <CardTitle>Configurações de Custos</CardTitle>
                                <CardDescription>
                                    Defina os custos operacionais e taxas que serão usados nos cálculos
                                </CardDescription>
                            </CardHeader>
                            <CardContent className="space-y-4">
                                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                                    <div>
                                        <Label>Valor da Hora Máquina (R$)</Label>
                                        <Input
                                            type="number"
                                            value={machineHourRate}
                                            onChange={(e) => setMachineHourRate(Number(e.target.value))}
                                            placeholder="150.00"
                                        />
                                        <p className="text-xs text-muted-foreground mt-1">
                                            Usado para calcular custos de usinagem
                                        </p>
                                    </div>
                                    <div>
                                        <Label>Margem de Lucro Padrão (%)</Label>
                                        <Input
                                            type="number"
                                            value={profitMargin}
                                            onChange={(e) => setProfitMargin(Number(e.target.value))}
                                            placeholder="30"
                                        />
                                        <p className="text-xs text-muted-foreground mt-1">
                                            Percentual aplicado sobre o custo total
                                        </p>
                                    </div>
                                    <div>
                                        <Label>IRPJ (%)</Label>
                                        <Input
                                            type="number"
                                            min="0"
                                            max="99.99"
                                            step="0.01"
                                            value={irpjRate}
                                            onChange={(e) => setIrpjRate(Number(e.target.value))}
                                            placeholder="4.80"
                                        />
                                        <p className="text-xs text-muted-foreground mt-1">
                                            Calculado por dentro sobre o preço bruto
                                        </p>
                                    </div>
                                    <div>
                                        <Label>CSLL (%)</Label>
                                        <Input
                                            type="number"
                                            min="0"
                                            max="99.99"
                                            step="0.01"
                                            value={csllRate}
                                            onChange={(e) => setCsllRate(Number(e.target.value))}
                                            placeholder="2.88"
                                        />
                                        <p className="text-xs text-muted-foreground mt-1">
                                            Calculada por dentro sobre o preço bruto
                                        </p>
                                    </div>
                                    <div>
                                        <Label>Custo de Insumos por Kg (R$/kg)</Label>
                                        <Input
                                            type="number"
                                            step="0.01"
                                            value={consumablesCostPerKg}
                                            onChange={(e) => setConsumablesCostPerKg(Number(e.target.value))}
                                            placeholder="0.00"
                                        />
                                        <p className="text-xs text-muted-foreground mt-1">
                                            Custo de consumíveis (eletrodos, gases, etc.) por kg do produto
                                        </p>
                                    </div>
                                </div>

                                <Separator />

                                <div>
                                    <h4 className="text-sm font-medium mb-3">Custo por Kg de Cada Etapa (R$/kg)</h4>
                                    <p className="text-xs text-muted-foreground mb-3">
                                        💡 Defina quanto custa cada etapa por quilograma do produto. O sistema multiplicará pelo peso total automaticamente.
                                    </p>
                                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                                        {manufacturingStages.map(stage => (
                                            <div key={stage}>
                                                <Label className="text-xs">{stage}</Label>
                                                <div className="relative">
                                                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">
                                                        R$
                                                    </span>
                                                    <Input
                                                        type="number"
                                                        step="0.01"
                                                        placeholder="0.00"
                                                        className="pl-8"
                                                        value={stageCosts[stage] || ''}
                                                        onChange={(e) => setStageCosts(prev => ({
                                                            ...prev,
                                                            [stage]: Number(e.target.value)
                                                        }))}
                                                    />
                                                    <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">
                                                        /kg
                                                    </span>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                    
                                    <div className="mt-3 p-3 bg-muted rounded-md text-xs space-y-1">
                                        <div className="font-medium">Exemplo de cálculo:</div>
                                        <div className="text-muted-foreground">
                                            Se "Listagem de matéria-prima" custa R$ 0,15/kg e o produto pesa 1000 kg:
                                        </div>
                                        <div className="font-mono">
                                            Custo da etapa = 0,15 × 1.000 = <span className="font-bold text-primary">R$ 150,00</span>
                                        </div>
                                    </div>
                                    
                                    <Button onClick={saveStageCosts} className="mt-3" variant="outline">
                                        Salvar Configurações
                                    </Button>
                                </div>
                            </CardContent>
                        </Card>

                        <div className="grid gap-6 lg:grid-cols-2">
                            <Card>
                                <CardHeader>
                                    <CardTitle>Calcular Preço do Produto</CardTitle>
                                    <CardDescription>
                                        Selecione um produto e defina a composição de materiais
                                    </CardDescription>
                                </CardHeader>
                                <CardContent className="space-y-4">
                                    <div className="space-y-2">
                                        <Label>Produto</Label>
                                        
                                        <div className="relative">
                                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                                            <Input
                                                placeholder="Digite o código ou nome do produto..."
                                                value={pricingProductSearch}
                                                onChange={(e) => setPricingProductSearch(e.target.value)}
                                                className="pl-10"
                                            />
                                            {pricingProductSearch && (
                                                <Button
                                                    variant="ghost"
                                                    size="sm"
                                                    className="absolute right-1 top-1/2 -translate-y-1/2 h-7"
                                                    onClick={() => setPricingProductSearch("")}
                                                >
                                                    ✕
                                                </Button>
                                            )}
                                        </div>
                                        
                                        {/* ─── MODIFICADO: onValueChange agora também chama loadSavedPricing ─── */}
                                        <Select 
                                            value={selectedProductForPricing?.id || ''} 
                                            onValueChange={(value) => {
                                                const product = products.find(p => p.id === value);
                                                setSelectedProductForPricing(product || null);
                                                if (product) {
                                                    loadSavedPricing(product.code);
                                                } else {
                                                    setMaterialComposition([]);
                                                    setPricingCalculation(null);
                                                    setMachiningHours(0);
                                                }
                                            }}
                                        >
                                            <SelectTrigger>
                                                <SelectValue placeholder="Selecione um produto da lista" />
                                            </SelectTrigger>
                                            <SelectContent className="max-h-[350px]">
                                                {(() => {
                                                    const filteredForPricing = products
                                                        .filter(p => p.unitWeight && p.unitWeight > 0)
                                                        .filter(p => {
                                                            if (!pricingProductSearch) return true;
                                                            const query = pricingProductSearch.toLowerCase();
                                                            return (
                                                                p.code.toLowerCase().includes(query) ||
                                                                p.description.toLowerCase().includes(query)
                                                            );
                                                        });

                                                    if (filteredForPricing.length === 0) {
                                                        return (
                                                            <div className="p-6 text-center text-sm text-muted-foreground">
                                                                {pricingProductSearch ? (
                                                                    <>
                                                                        <Search className="mx-auto h-10 w-10 mb-3 opacity-30" />
                                                                        <p className="font-medium">Nenhum produto encontrado</p>
                                                                        <p className="text-xs mt-1">
                                                                            Não há produtos com código ou descrição contendo "{pricingProductSearch}"
                                                                        </p>
                                                                    </>
                                                                ) : (
                                                                    <>
                                                                        <Package className="mx-auto h-10 w-10 mb-3 opacity-30" />
                                                                        <p className="font-medium">Nenhum produto disponível</p>
                                                                        <p className="text-xs mt-1">
                                                                            Cadastre produtos com peso definido para usar a calculadora
                                                                        </p>
                                                                    </>
                                                                )}
                                                            </div>
                                                        );
                                                    }

                                                    return filteredForPricing.map(product => (
                                                        <SelectItem key={product.id} value={product.id}>
                                                            <div className="flex items-start gap-3 py-1">
                                                                <div className="flex-shrink-0">
                                                                    <div className="font-mono text-xs font-bold bg-primary/10 text-primary px-2 py-0.5 rounded">
                                                                        {product.code}
                                                                    </div>
                                                                </div>
                                                                <div className="flex-1 min-w-0">
                                                                    <div className="text-sm truncate">{product.description}</div>
                                                                    <div className="text-xs text-muted-foreground flex items-center gap-2 mt-0.5">
                                                                        <span>⚖️ {product.unitWeight}kg</span>
                                                                        <span>•</span>
                                                                        <span>⏱️ {calculateLeadTime(product)} dias</span>
                                                                        {/* ─── NOVO: indicador visual inline no select ─── */}
                                                                        {savedPricingCodes.has(product.code) && (
                                                                            <>
                                                                                <span>•</span>
                                                                                <span className="text-green-600 font-medium">✓ Salvo</span>
                                                                            </>
                                                                        )}
                                                                    </div>
                                                                </div>
                                                            </div>
                                                        </SelectItem>
                                                    ));
                                                })()}
                                            </SelectContent>
                                        </Select>
                                        
                                        {pricingProductSearch && (
                                            <div className="flex items-center gap-2 text-xs text-muted-foreground">
                                                <span className="inline-flex items-center gap-1">
                                                    <span className="font-medium text-primary">
                                                        {products.filter(p => 
                                                            p.unitWeight && 
                                                            p.unitWeight > 0 &&
                                                            (p.code.toLowerCase().includes(pricingProductSearch.toLowerCase()) ||
                                                            p.description.toLowerCase().includes(pricingProductSearch.toLowerCase()))
                                                        ).length}
                                                    </span>
                                                    produto(s) encontrado(s)
                                                </span>
                                            </div>
                                        )}
                                    </div>

                                    {selectedProductForPricing && (
                                        <>
                                            <div className="p-3 bg-muted rounded-md">
                                                <div className="text-sm space-y-1">
                                                    <div className="flex justify-between">
                                                        <span className="font-medium">Peso total:</span>
                                                        <span>{selectedProductForPricing.unitWeight} kg</span>
                                                    </div>
                                                    <div className="flex justify-between">
                                                        <span className="font-medium">Lead time:</span>
                                                        <span>{calculateLeadTime(selectedProductForPricing)} dias</span>
                                                    </div>
                                                    {/* ─── NOVO: indicador de precificação salva no card ─── */}
                                                    {savedPricingCodes.has(selectedProductForPricing.code) && (
                                                        <div className="flex justify-between items-center pt-1 border-t mt-1">
                                                            <span className="font-medium text-green-700">Precificação salva</span>
                                                            <Badge variant="outline" className="border-green-500 text-green-600 text-xs">
                                                                <Calculator className="mr-1 h-3 w-3" />
                                                                Dados carregados
                                                            </Badge>
                                                        </div>
                                                    )}
                                                </div>
                                            </div>

                                            <Button
                                                type="button"
                                                variant="outline"
                                                className="w-full border-blue-500/50 text-blue-700 hover:bg-blue-50"
                                                onClick={() => {
                                                    setCopyPricingSourceId("");
                                                    setCopyPricingSearch("");
                                                    setIsCopyPricingDialogOpen(true);
                                                }}
                                            >
                                                <Copy className="mr-2 h-4 w-4" />
                                                Copiar precificação de outro produto
                                            </Button>

                                            <Separator />

                                            <div>
                                                <h4 className="text-sm font-medium mb-3">Composição de Materiais</h4>
                                                <p className="text-xs text-muted-foreground mb-3">
                                                    Selecione materiais na lista abaixo para adicionar à composição
                                                </p>

                                                <div className="space-y-3">
                                                    <div className="space-y-2">
                                                        <Label className="text-xs text-muted-foreground">Selecione um material para adicionar:</Label>
                                                        <Select
                                                            value=""
                                                            onValueChange={(materialId) => {
                                                                const material = allMaterials.find(m => m.id === materialId);
                                                                if (!material) return;
                                                                
                                                                if (materialComposition.some(m => m.materialId === materialId)) {
                                                                    toast({
                                                                        variant: "destructive",
                                                                        title: "Material já adicionado",
                                                                        description: "Este material já está na lista. Edite o peso existente."
                                                                    });
                                                                    return;
                                                                }
                                                                
                                                                const newItem: MaterialCompositionItem = {
                                                                    id: Date.now().toString(),
                                                                    materialId: material.id,
                                                                    materialDescription: material.description,
                                                                    weightKg: 0,
                                                                    pricePerKg: material.pricePerKg,
                                                                    totalCost: 0
                                                                };
                                                                
                                                                setMaterialComposition(prev => [...prev, newItem]);
                                                                
                                                                toast({
                                                                    title: "Material adicionado",
                                                                    description: "Agora defina o peso em kg deste material."
                                                                });
                                                            }}
                                                        >
                                                            <SelectTrigger>
                                                                <SelectValue placeholder="Buscar e selecionar material..." />
                                                            </SelectTrigger>
                                                            <SelectContent className="max-h-[400px]">
                                                                <div className="px-2 py-1.5 text-xs font-medium text-muted-foreground sticky top-0 bg-background">
                                                                    💡 Dica: Role para ver todas as categorias
                                                                </div>
                                                                {MATERIAL_CATEGORIES.map(category => {
                                                                    const categoryMaterials = allMaterials.filter(m => m.category === category);
                                                                    if (categoryMaterials.length === 0) return null;
                                                                    
                                                                    return (
                                                                        <div key={category}>
                                                                            <div className="px-2 py-1.5 text-sm font-semibold text-primary sticky top-6 bg-background/95 backdrop-blur-sm">
                                                                                {category}
                                                                            </div>
                                                                            {categoryMaterials.map(material => {
                                                                                const isAdded = materialComposition.some(m => m.materialId === material.id);
                                                                                return (
                                                                                    <SelectItem 
                                                                                        key={material.id} 
                                                                                        value={material.id}
                                                                                        disabled={isAdded}
                                                                                        className={isAdded ? "opacity-50" : ""}
                                                                                    >
                                                                                        <div className="flex items-center justify-between w-full gap-4">
                                                                                            <span className="truncate flex-1">{material.description}</span>
                                                                                            <span className="text-xs text-muted-foreground flex-shrink-0">
                                                                                                R$ {material.pricePerKg.toFixed(2)}/kg
                                                                                                {isAdded && " ✓"}
                                                                                            </span>
                                                                                        </div>
                                                                                    </SelectItem>
                                                                                );
                                                                            })}
                                                                        </div>
                                                                    );
                                                                })}
                                                            </SelectContent>
                                                        </Select>
                                                    </div>

                                                    {materialComposition.length > 0 ? (
                                                        <div className="space-y-2 max-h-[400px] overflow-y-auto">
                                                            {materialComposition.map((item, index) => (
                                                                <div key={item.id} className="flex items-start gap-2 p-3 border rounded-md bg-card">
                                                                    <div className="flex-1 min-w-0">
                                                                        <div className="text-sm font-medium truncate">
                                                                            {item.materialDescription}
                                                                        </div>
                                                                        <div className="text-xs text-muted-foreground mt-1">
                                                                            R$ {item.pricePerKg.toFixed(2)}/kg
                                                                        </div>
                                                                        <div className="flex items-center gap-2 mt-2">
                                                                            <Input
                                                                                type="number"
                                                                                step="0.01"
                                                                                placeholder="Peso (kg)"
                                                                                className="h-8 text-sm"
                                                                                value={item.weightKg || ''}
                                                                                onChange={(e) => {
                                                                                    const weight = Number(e.target.value);
                                                                                    setMaterialComposition(prev => prev.map((m, i) => 
                                                                                        i === index 
                                                                                            ? { ...m, weightKg: weight, totalCost: weight * m.pricePerKg }
                                                                                            : m
                                                                                    ));
                                                                                }}
                                                                            />
                                                                            <div className="text-sm font-medium whitespace-nowrap">
                                                                                = R$ {item.totalCost.toFixed(2)}
                                                                            </div>
                                                                        </div>
                                                                    </div>
                                                                    <Button
                                                                        variant="ghost"
                                                                        size="icon"
                                                                        className="h-8 w-8 flex-shrink-0"
                                                                        onClick={() => setMaterialComposition(prev => prev.filter((_, i) => i !== index))}
                                                                    >
                                                                        <Trash2 className="h-4 w-4 text-destructive" />
                                                                    </Button>
                                                                </div>
                                                            ))}

                                                            <div className="p-3 bg-muted rounded-md space-y-1">
                                                                <div className="flex justify-between text-sm">
                                                                    <span className="font-medium">Total de materiais:</span>
                                                                    <span>{materialComposition.length}</span>
                                                                </div>
                                                                <div className="flex justify-between text-sm">
                                                                    <span className="font-medium">Peso dos materiais:</span>
                                                                    <span className="font-mono">
                                                                        {materialComposition.reduce((sum, m) => sum + m.weightKg, 0).toFixed(2)} kg
                                                                    </span>
                                                                </div>
                                                                <div className="flex justify-between text-sm">
                                                                    <span className="font-medium">Peso do produto:</span>
                                                                    <span className="font-mono">{selectedProductForPricing.unitWeight} kg</span>
                                                                </div>
                                                                <div className="flex justify-between text-sm font-bold border-t pt-1 mt-1">
                                                                    <span>Custo total materiais:</span>
                                                                    <span className="font-mono text-primary">
                                                                        R$ {materialComposition.reduce((sum, m) => sum + m.totalCost, 0).toFixed(2)}
                                                                    </span>
                                                                </div>
                                                                {Math.abs(materialComposition.reduce((sum, m) => sum + m.weightKg, 0) - (selectedProductForPricing.unitWeight || 0)) > 0.1 && (
                                                                    <div className="flex items-center gap-1 text-xs text-yellow-600 pt-1 border-t">
                                                                        <span>⚠️</span>
                                                                        <span>Diferença de peso: {Math.abs(materialComposition.reduce((sum, m) => sum + m.weightKg, 0) - (selectedProductForPricing.unitWeight || 0)).toFixed(2)} kg</span>
                                                                    </div>
                                                                )}
                                                            </div>
                                                        </div>
                                                    ) : (
                                                        <div className="text-center py-8 text-sm text-muted-foreground border-2 border-dashed rounded-md">
                                                            <Package className="mx-auto h-8 w-8 mb-2 opacity-50" />
                                                            <p>Nenhum material adicionado</p>
                                                            <p className="text-xs mt-1">Use o seletor acima para adicionar materiais</p>
                                                        </div>
                                                    )}
                                                </div>
                                            </div>

                                            {selectedProductForPricing.productionPlanTemplate?.some(stage => 
                                                stage.stageName.toLowerCase().includes('usinagem')
                                            ) && (
                                                <>
                                                    <Separator />
                                                    <div>
                                                        <Label>Horas de Usinagem Estimadas</Label>
                                                        <Input
                                                            type="number"
                                                            step="0.5"
                                                            placeholder="0"
                                                            value={machiningHours}
                                                            onChange={(e) => setMachiningHours(Number(e.target.value))}
                                                        />
                                                        <p className="text-xs text-muted-foreground mt-1">
                                                            Valor da hora: R$ {machineHourRate.toFixed(2)} = {machiningHours > 0 ? `R$ ${(machiningHours * machineHourRate).toFixed(2)}` : 'R$ 0,00'}
                                                        </p>
                                                    </div>
                                                </>
                                            )}

                                            {/* ─── MODIFICADO: botão Calcular agora também salva ─── */}
                                            <Button 
                                                onClick={async () => {
                                                    if (materialComposition.length === 0) {
                                                        toast({
                                                            variant: "destructive",
                                                            title: "Adicione materiais",
                                                            description: "É necessário adicionar pelo menos um material à composição."
                                                        });
                                                        return;
                                                    }

                                                    const materialsWithoutWeight = materialComposition.filter(m => !m.weightKg || m.weightKg <= 0);
                                                    if (materialsWithoutWeight.length > 0) {
                                                        toast({
                                                            variant: "destructive",
                                                            title: "Defina o peso dos materiais",
                                                            description: `${materialsWithoutWeight.length} material(is) sem peso definido.`
                                                        });
                                                        return;
                                                    }

                                                    const productWeight = selectedProductForPricing.unitWeight || 0;

                                                    const stageCostItems: StageCostItem[] = (selectedProductForPricing.productionPlanTemplate || []).map(stage => {
                                                        const costPerKg = stageCosts[stage.stageName] || 0;
                                                        const totalCost = costPerKg * productWeight;
                                                        
                                                        return {
                                                            stageName: stage.stageName,
                                                            durationDays: stage.durationDays || 0,
                                                            costPerDay: costPerKg,
                                                            totalCost: totalCost
                                                        };
                                                    });

                                                    const materialCostTotal = materialComposition.reduce((sum, m) => sum + m.totalCost, 0);
                                                    const stageCostTotal = stageCostItems.reduce((sum, s) => sum + s.totalCost, 0);
                                                    const machiningCost = machiningHours * machineHourRate;
                                                    const consumablesCost = consumablesCostPerKg * productWeight;
                                                    const totalCost = materialCostTotal + stageCostTotal + machiningCost + consumablesCost;
                                                    const profitValue = totalCost * (profitMargin / 100);
                                                    const priceBeforeIncomeTaxes = totalCost + profitValue;
                                                    const irpjDecimal = irpjRate / 100;
                                                    const csllDecimal = csllRate / 100;
                                                    const incomeTaxDenominator = 1 - irpjDecimal - csllDecimal;

                                                    if (irpjRate < 0 || csllRate < 0 || incomeTaxDenominator <= 0) {
                                                        toast({
                                                            variant: "destructive",
                                                            title: "Alíquotas inválidas",
                                                            description: "IRPJ e CSLL devem ser positivos e a soma precisa ser menor que 100%."
                                                        });
                                                        return;
                                                    }

                                                    // Gross-up: IRPJ e CSLL incidem sobre o próprio preço bruto.
                                                    const finalPrice = priceBeforeIncomeTaxes / incomeTaxDenominator;
                                                    const irpjAmount = finalPrice * irpjDecimal;
                                                    const csllAmount = finalPrice * csllDecimal;
                                                    const pricePerKg = finalPrice / productWeight;

                                                    const calculation: PricingCalculation = {
                                                        productId: selectedProductForPricing.id,
                                                        productCode: selectedProductForPricing.code,
                                                        productDescription: selectedProductForPricing.description,
                                                        productWeight: productWeight,
                                                        materialCosts: materialComposition,
                                                        stageCosts: stageCostItems,
                                                        machiningCost,
                                                        consumablesCost: consumablesCost,
                                                        totalCost,
                                                        profitMargin,
                                                        profitValue,
                                                        priceBeforeIncomeTaxes,
                                                        irpjRate,
                                                        irpjAmount,
                                                        csllRate,
                                                        csllAmount,
                                                        finalPrice,
                                                        pricePerKg,
                                                        createdAt: new Date()
                                                    };

                                                    setPricingCalculation(calculation);

                                                    // ─── NOVO: salva automaticamente no Firestore ───
                                                    await savePricingCalculation(calculation, materialComposition, machiningHours);
                                                }} 
                                                className="w-full"
                                                disabled={materialComposition.length === 0}
                                            >
                                                <Calculator className="mr-2 h-4 w-4" />
                                                Calcular e Salvar Preço
                                            </Button>
                                        </>
                                    )}
                                </CardContent>
                            </Card>

                            <Card>
                                <CardHeader>
                                    <div className="flex items-center justify-between">
                                        <div>
                                            <CardTitle>Resultado da Precificação</CardTitle>
                                            <CardDescription>
                                                Composição detalhada de custos e preço final
                                            </CardDescription>
                                        </div>
                                        {pricingCalculation && (
                                            <Button
                                                variant="outline"
                                                size="sm"
                                                onClick={async () => {
                                                    const companyData = await fetchCompanyDataForPDF();
                                                    
                                                    const doc = new jsPDF();
                                                    
                                                    const pageWidth = doc.internal.pageSize.getWidth();
                                                    const pageHeight = doc.internal.pageSize.getHeight();
                                                    const margin = 20;
                                                    let yPosition = margin;
                                                    const lineHeight = 7;
                                                    
                                                    const addText = (text: string, fontSize: number = 10, isBold: boolean = false, align: 'left' | 'center' | 'right' = 'left') => {
                                                        doc.setFontSize(fontSize);
                                                        doc.setFont('helvetica', isBold ? 'bold' : 'normal');
                                                        
                                                        if (align === 'center') {
                                                            doc.text(text, pageWidth / 2, yPosition, { align: 'center' });
                                                        } else if (align === 'right') {
                                                            doc.text(text, pageWidth - margin, yPosition, { align: 'right' });
                                                        } else {
                                                            doc.text(text, margin, yPosition);
                                                        }
                                                        
                                                        yPosition += lineHeight;
                                                    };
                                                    
                                                    const addLine = () => {
                                                        doc.setDrawColor(200, 200, 200);
                                                        doc.line(margin, yPosition, pageWidth - margin, yPosition);
                                                        yPosition += lineHeight;
                                                    };
                                                    
                                                    const checkPageBreak = (spaceNeeded: number = 20) => {
                                                        if (yPosition + spaceNeeded > pageHeight - margin) {
                                                            doc.addPage();
                                                            yPosition = margin;
                                                            return true;
                                                        }
                                                        return false;
                                                    };
                                                    
                                                    const addSection = (title: string) => {
                                                        checkPageBreak(15);
                                                        yPosition += 3;
                                                        doc.setFillColor(37, 99, 235);
                                                        doc.rect(margin, yPosition - 5, pageWidth - (2 * margin), 8, 'F');
                                                        doc.setTextColor(255, 255, 255);
                                                        addText(title, 11, true);
                                                        doc.setTextColor(0, 0, 0);
                                                        yPosition += 2;
                                                    };
                                                    
                                                    doc.setFillColor(37, 99, 235);
                                                    doc.rect(0, 0, pageWidth, 50, 'F');
                                                    doc.setTextColor(255, 255, 255);
                                                    
                                                    doc.setFontSize(24);
                                                    doc.setFont('helvetica', 'bold');
                                                    doc.text((companyData?.nomeFantasia || 'MECALD').toUpperCase(), pageWidth / 2, 18, { align: 'center' });
                                                    
                                                    doc.setFontSize(16);
                                                    doc.setFont('helvetica', 'normal');
                                                    doc.text('RELATÓRIO DE PRECIFICAÇÃO', pageWidth / 2, 28, { align: 'center' });
                                                    
                                                    doc.setFontSize(9);
                                                    doc.text(`Gerado em: ${format(new Date(), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}`, pageWidth / 2, 38, { align: 'center' });
                                                    
                                                    yPosition = 60;
                                                    doc.setTextColor(0, 0, 0);
                                                    
                                                    doc.setFillColor(249, 250, 251);
                                                    doc.rect(0, yPosition, pageWidth, 35, 'F');
                                                    
                                                    const logoX = pageWidth - margin - 50;
                                                    const logoY = yPosition + 5;
                                                    const logoWidth = 45;
                                                    const logoHeight = 25;
                                                    
                                                    doc.setFillColor(255, 255, 255);
                                                    doc.roundedRect(logoX, logoY, logoWidth, logoHeight, 2, 2, 'F');
                                                    doc.setDrawColor(200, 200, 200);
                                                    doc.setLineWidth(0.5);
                                                    doc.roundedRect(logoX, logoY, logoWidth, logoHeight, 2, 2, 'D');
                                                    
                                                    if (companyData?.logo?.preview) {
                                                        try {
                                                            let logoSrc = companyData.logo.preview;
                                                            if (!logoSrc.startsWith('data:')) {
                                                                logoSrc = `data:image/png;base64,${logoSrc}`;
                                                            }
                                                            if (logoSrc.startsWith('data:image/')) {
                                                                const base64Data = logoSrc.split(',')[1] || logoSrc;
                                                                const imageType = logoSrc.match(/data:image\/(\w+)/)?.[1] || 'png';
                                                                try {
                                                                    doc.addImage(base64Data, imageType.toUpperCase(), logoX + 2, logoY + 2, logoWidth - 4, logoHeight - 4, undefined, 'FAST');
                                                                } catch (imgError) {
                                                                    doc.setFontSize(7);
                                                                    doc.setTextColor(150, 150, 150);
                                                                    doc.text('LOGO', logoX + logoWidth / 2, logoY + logoHeight / 2, { align: 'center' });
                                                                }
                                                            } else {
                                                                doc.setFontSize(7);
                                                                doc.setTextColor(150, 150, 150);
                                                                doc.text('LOGO', logoX + logoWidth / 2, logoY + logoHeight / 2, { align: 'center' });
                                                            }
                                                        } catch (error) {
                                                            doc.setFontSize(7);
                                                            doc.setTextColor(150, 150, 150);
                                                            doc.text('LOGO', logoX + logoWidth / 2, logoY + logoHeight / 2, { align: 'center' });
                                                        }
                                                    } else {
                                                        doc.setFontSize(7);
                                                        doc.setTextColor(150, 150, 150);
                                                        doc.text('LOGO', logoX + logoWidth / 2, logoY + logoHeight / 2, { align: 'center' });
                                                    }
                                                    
                                                    doc.setTextColor(0, 0, 0);
                                                    
                                                    doc.setFontSize(8);
                                                    doc.setFont('helvetica', 'normal');
                                                    let infoY = yPosition + 8;
                                                    
                                                    if (companyData?.cnpj) {
                                                        doc.setFont('helvetica', 'bold');
                                                        doc.text('CNPJ:', margin, infoY);
                                                        doc.setFont('helvetica', 'normal');
                                                        doc.text(companyData.cnpj, margin + 20, infoY);
                                                        infoY += 5;
                                                    }
                                                    if (companyData?.inscricaoEstadual) {
                                                        doc.setFont('helvetica', 'bold');
                                                        doc.text('I.E.:', margin, infoY);
                                                        doc.setFont('helvetica', 'normal');
                                                        doc.text(companyData.inscricaoEstadual, margin + 20, infoY);
                                                        infoY += 5;
                                                    }
                                                    if (companyData?.email) {
                                                        doc.setFont('helvetica', 'bold');
                                                        doc.text('E-mail:', margin, infoY);
                                                        doc.setFont('helvetica', 'normal');
                                                        doc.text(companyData.email, margin + 25, infoY);
                                                        infoY += 5;
                                                    }
                                                    if (companyData?.celular) {
                                                        doc.setFont('helvetica', 'bold');
                                                        doc.text('Telefone:', margin, infoY);
                                                        doc.setFont('helvetica', 'normal');
                                                        doc.text(companyData.celular, margin + 30, infoY);
                                                    }
                                                    if (companyData?.endereco) {
                                                        doc.setFont('helvetica', 'bold');
                                                        doc.text('Endereço:', margin, infoY + 5);
                                                        doc.setFont('helvetica', 'normal');
                                                        const enderecoText = companyData.endereco.length > 50 
                                                            ? companyData.endereco.substring(0, 50) + '...' 
                                                            : companyData.endereco;
                                                        doc.text(enderecoText, margin + 30, infoY + 5);
                                                    }
                                                    
                                                    doc.setDrawColor(200, 200, 200);
                                                    doc.setLineWidth(0.5);
                                                    doc.line(margin, yPosition + 35, pageWidth - margin, yPosition + 35);
                                                    yPosition += 45;
                                                    doc.setTextColor(0, 0, 0);
                                                    
                                                    checkPageBreak(35);
                                                    const productBoxY = yPosition;
                                                    doc.setFillColor(239, 246, 255);
                                                    doc.setDrawColor(59, 130, 246);
                                                    doc.setLineWidth(0.5);
                                                    doc.roundedRect(margin, productBoxY, pageWidth - (2 * margin), 30, 3, 3, 'FD');
                                                    
                                                    yPosition = productBoxY + 8;
                                                    doc.setFontSize(11);
                                                    doc.setFont('helvetica', 'bold');
                                                    doc.setTextColor(30, 64, 175);
                                                    doc.text('DADOS DO PRODUTO', margin + 5, yPosition);
                                                    
                                                    yPosition += 8;
                                                    doc.setFontSize(9);
                                                    doc.setFont('helvetica', 'normal');
                                                    doc.setTextColor(0, 0, 0);
                                                    doc.text(`Código: ${pricingCalculation.productCode}`, margin + 5, yPosition);
                                                    doc.text(`Peso: ${pricingCalculation.productWeight} kg`, pageWidth / 2 + 10, yPosition);
                                                    
                                                    yPosition += 5;
                                                    doc.text(`Descrição: ${pricingCalculation.productDescription}`, margin + 5, yPosition);
                                                    
                                                    const leadTimeDays = calculateLeadTime(selectedProductForPricing || {
                                                        productionPlanTemplate: pricingCalculation.stageCosts.map(s => ({
                                                            stageName: s.stageName,
                                                            durationDays: s.durationDays
                                                        }))
                                                    } as Product);
                                                    doc.text(`Lead Time: ${leadTimeDays} dias`, pageWidth / 2 + 10, yPosition);
                                                    
                                                    yPosition += 10;
                                                    
                                                    const materialTotal = pricingCalculation.materialCosts.reduce((s, m) => s + m.totalCost, 0);
                                                    
                                                    addSection('COMPOSIÇÃO DE MATERIAIS');
                                                    
                                                    if (pricingCalculation.materialCosts.length > 0) {
                                                        const tableY = yPosition;
                                                        doc.setFillColor(243, 244, 246);
                                                        doc.rect(margin, tableY, pageWidth - (2 * margin), 8, 'F');
                                                        doc.setFontSize(9);
                                                        doc.setFont('helvetica', 'bold');
                                                        
                                                        doc.text('Material', margin + 2, tableY + 6);
                                                        doc.text('Peso (kg)', pageWidth - margin - 60, tableY + 6, { align: 'right' });
                                                        doc.text('R$/kg', pageWidth - margin - 30, tableY + 6, { align: 'right' });
                                                        doc.text('Subtotal', pageWidth - margin - 2, tableY + 6, { align: 'right' });
                                                        
                                                        yPosition = tableY + 10;
                                                        
                                                        pricingCalculation.materialCosts.forEach((m, index) => {
                                                            checkPageBreak(10);
                                                            if (index % 2 === 0) {
                                                                doc.setFillColor(249, 250, 251);
                                                                doc.rect(margin, yPosition - 4, pageWidth - (2 * margin), 8, 'F');
                                                            }
                                                            doc.setFontSize(8);
                                                            doc.setFont('helvetica', 'normal');
                                                            doc.setTextColor(0, 0, 0);
                                                            const materialText = `${index + 1}. ${m.materialDescription}`;
                                                            doc.text(materialText.substring(0, 50) + (materialText.length > 50 ? '...' : ''), margin + 2, yPosition);
                                                            doc.text(m.weightKg.toFixed(3), pageWidth - margin - 60, yPosition, { align: 'right' });
                                                            doc.text(`R$ ${m.pricePerKg.toFixed(2)}`, pageWidth - margin - 30, yPosition, { align: 'right' });
                                                            doc.setFont('helvetica', 'bold');
                                                            doc.text(`R$ ${m.totalCost.toFixed(2)}`, pageWidth - margin - 2, yPosition, { align: 'right' });
                                                            yPosition += 8;
                                                        });
                                                        
                                                        checkPageBreak(10);
                                                        doc.setFillColor(254, 243, 199);
                                                        doc.rect(margin, yPosition - 4, pageWidth - (2 * margin), 10, 'F');
                                                        doc.setFontSize(10);
                                                        doc.setFont('helvetica', 'bold');
                                                        doc.setTextColor(146, 64, 14);
                                                        doc.text('TOTAL MATERIAIS:', margin + 2, yPosition + 4);
                                                        doc.text(`R$ ${materialTotal.toFixed(2)}`, pageWidth - margin - 2, yPosition + 4, { align: 'right' });
                                                        doc.setTextColor(0, 0, 0);
                                                        yPosition += 12;
                                                    }
                                                    
                                                    const activeStages = pricingCalculation.stageCosts.filter(s => s.totalCost > 0);
                                                    
                                                    if (activeStages.length > 0) {
                                                        addSection('CUSTOS DE PRODUÇÃO POR ETAPA');
                                                        
                                                        const stagesTableY = yPosition;
                                                        doc.setFillColor(239, 246, 255);
                                                        doc.rect(margin, stagesTableY, pageWidth - (2 * margin), 8, 'F');
                                                        doc.setFontSize(9);
                                                        doc.setFont('helvetica', 'bold');
                                                        doc.text('Etapa', margin + 2, stagesTableY + 6);
                                                        doc.text('Custo/kg', pageWidth - margin - 80, stagesTableY + 6, { align: 'right' });
                                                        doc.text('Peso Total', pageWidth - margin - 50, stagesTableY + 6, { align: 'right' });
                                                        doc.text('Custo Total', pageWidth - margin - 2, stagesTableY + 6, { align: 'right' });
                                                        yPosition = stagesTableY + 10;
                                                        
                                                        activeStages.forEach((s, index) => {
                                                            checkPageBreak(10);
                                                            if (index % 2 === 0) {
                                                                doc.setFillColor(249, 250, 251);
                                                                doc.rect(margin, yPosition - 4, pageWidth - (2 * margin), 8, 'F');
                                                            }
                                                            doc.setFontSize(8);
                                                            doc.setFont('helvetica', 'normal');
                                                            doc.setTextColor(0, 0, 0);
                                                            doc.text(`${index + 1}. ${s.stageName}`, margin + 2, yPosition);
                                                            doc.text(`R$ ${s.costPerDay.toFixed(2)}/kg`, pageWidth - margin - 80, yPosition, { align: 'right' });
                                                            doc.text(`${pricingCalculation.productWeight.toFixed(2)} kg`, pageWidth - margin - 50, yPosition, { align: 'right' });
                                                            doc.setFont('helvetica', 'bold');
                                                            doc.text(`R$ ${s.totalCost.toFixed(2)}`, pageWidth - margin - 2, yPosition, { align: 'right' });
                                                            yPosition += 8;
                                                        });
                                                        
                                                        checkPageBreak(10);
                                                        doc.setFillColor(254, 243, 199);
                                                        doc.rect(margin, yPosition - 4, pageWidth - (2 * margin), 10, 'F');
                                                        doc.setFontSize(10);
                                                        doc.setFont('helvetica', 'bold');
                                                        doc.setTextColor(146, 64, 14);
                                                        doc.text('TOTAL ETAPAS:', margin + 2, yPosition + 4);
                                                        const stageTotal = activeStages.reduce((s, st) => s + st.totalCost, 0);
                                                        doc.text(`R$ ${stageTotal.toFixed(2)}`, pageWidth - margin - 2, yPosition + 4, { align: 'right' });
                                                        doc.setTextColor(0, 0, 0);
                                                        yPosition += 12;
                                                    }
                                                    
                                                    addSection('OUTROS CUSTOS');
                                                    if (pricingCalculation.machiningCost > 0) {
                                                        addText(`Usinagem: ${machiningHours}h × R$ ${machineHourRate.toFixed(2)}/h = R$ ${pricingCalculation.machiningCost.toFixed(2)}`, 9);
                                                    }
                                                    if (pricingCalculation.consumablesCost > 0) {
                                                        addText(`Insumos e Consumíveis:`, 9, true);
                                                        addText(`   R$ ${consumablesCostPerKg.toFixed(2)}/kg × ${pricingCalculation.productWeight}kg = R$ ${pricingCalculation.consumablesCost.toFixed(2)}`, 9);
                                                    }
                                                    
                                                    checkPageBreak(40);
                                                    addSection('RESUMO FINANCEIRO');
                                                    addText(`Preço antes de IRPJ e CSLL: R$ ${(pricingCalculation.priceBeforeIncomeTaxes ?? (pricingCalculation.totalCost + pricingCalculation.profitValue)).toFixed(2)}`, 9);
                                                    addText(`IRPJ (${pricingCalculation.irpjRate ?? 0}%): R$ ${(pricingCalculation.irpjAmount ?? 0).toFixed(2)}`, 9);
                                                    addText(`CSLL (${pricingCalculation.csllRate ?? 0}%): R$ ${(pricingCalculation.csllAmount ?? 0).toFixed(2)}`, 9);
                                                    
                                                    yPosition += 3;
                                                    const boxY = yPosition;
                                                    doc.setFillColor(240, 240, 240);
                                                    doc.roundedRect(margin, boxY, pageWidth - (2 * margin), 35, 3, 3, 'F');
                                                    
                                                    yPosition = boxY + 8;
                                                    doc.setFont('helvetica', 'normal');
                                                    doc.text(`Custo Total:`, margin + 5, yPosition);
                                                    doc.setFont('helvetica', 'bold');
                                                    doc.text(`R$ ${pricingCalculation.totalCost.toFixed(2)}`, pageWidth - margin - 5, yPosition, { align: 'right' });
                                                    
                                                    yPosition = boxY + 16;
                                                    doc.setFont('helvetica', 'normal');
                                                    doc.setTextColor(22, 163, 74);
                                                    doc.text(`Margem de Lucro (${pricingCalculation.profitMargin}%):`, margin + 5, yPosition);
                                                    doc.setFont('helvetica', 'bold');
                                                    doc.text(`R$ ${pricingCalculation.profitValue.toFixed(2)}`, pageWidth - margin - 5, yPosition, { align: 'right' });
                                                    doc.setTextColor(0, 0, 0);
                                                    
                                                    yPosition = boxY + 26;
                                                    doc.setDrawColor(37, 99, 235);
                                                    doc.setLineWidth(0.5);
                                                    doc.line(margin + 5, yPosition - 2, pageWidth - margin - 5, yPosition - 2);
                                                    
                                                    yPosition = boxY + 32;
                                                    doc.setFont('helvetica', 'bold');
                                                    doc.setFontSize(14);
                                                    doc.setTextColor(37, 99, 235);
                                                    doc.text('PREÇO FINAL:', margin + 5, yPosition);
                                                    doc.text(`R$ ${pricingCalculation.finalPrice.toFixed(2)}`, pageWidth - margin - 5, yPosition, { align: 'right' });
                                                    
                                                    yPosition += 8;
                                                    doc.setFontSize(10);
                                                    doc.setTextColor(100, 100, 100);
                                                    doc.text(`Preço por kg: R$ ${pricingCalculation.pricePerKg.toFixed(2)}/kg`, pageWidth - margin - 5, yPosition, { align: 'right' });
                                                    doc.setTextColor(0, 0, 0);
                                                    
                                                    yPosition += 10;
                                                    checkPageBreak(50);
                                                    addSection('COMPOSIÇÃO DO PREÇO FINAL');
                                                    
                                                    const stageTotal2 = activeStages.length > 0 
                                                        ? activeStages.reduce((s, st) => s + st.totalCost, 0)
                                                        : 0;
                                                    
                                                    const percentages = [
                                                        { label: 'Materiais', value: materialTotal, color: [59, 130, 246] },
                                                        { label: 'Etapas de Produção', value: stageTotal2, color: [16, 185, 129] },
                                                        { label: 'Usinagem', value: pricingCalculation.machiningCost, color: [245, 158, 11] },
                                                        { label: 'Insumos', value: pricingCalculation.consumablesCost, color: [139, 92, 246] },
                                                        { label: 'Lucro', value: pricingCalculation.profitValue, color: [34, 197, 94] },
                                                        { label: 'IRPJ', value: pricingCalculation.irpjAmount ?? 0, color: [234, 88, 12] },
                                                        { label: 'CSLL', value: pricingCalculation.csllAmount ?? 0, color: [202, 138, 4] }
                                                    ].filter(item => item.value > 0);
                                                    
                                                    percentages.forEach((item, index) => {
                                                        checkPageBreak();
                                                        const percentage = ((item.value / pricingCalculation.finalPrice) * 100).toFixed(1);
                                                        doc.setFillColor(item.color[0], item.color[1], item.color[2]);
                                                        doc.circle(margin + 2, yPosition - 2, 2, 'F');
                                                        doc.setFont('helvetica', 'normal');
                                                        doc.text(`${item.label}:`, margin + 8, yPosition);
                                                        doc.setFont('helvetica', 'bold');
                                                        doc.text(`R$ ${item.value.toFixed(2)} (${percentage}%)`, pageWidth - margin - 5, yPosition, { align: 'right' });
                                                        yPosition += lineHeight;
                                                    });
                                                    
                                                    yPosition += 5;
                                                    checkPageBreak(15);
                                                    doc.setFillColor(255, 243, 205);
                                                    doc.roundedRect(margin, yPosition, pageWidth - (2 * margin), 15, 2, 2, 'F');
                                                    doc.setFontSize(9);
                                                    doc.setTextColor(133, 77, 14);
                                                    yPosition += 5;
                                                    doc.text('⚠️ IMPORTANTE:', margin + 5, yPosition);
                                                    yPosition += 5;
                                                    doc.setFont('helvetica', 'normal');
                                                    doc.text('Este é o preço SEM impostos. Lembre-se de adicionar os impostos aplicáveis', margin + 5, yPosition);
                                                    yPosition += 5;
                                                    doc.text('(ICMS, PIS, COFINS, etc.) ao enviar a proposta ao cliente.', margin + 5, yPosition);
                                                    
                                                    const totalPages = doc.internal.pages.length - 1;
                                                    for (let i = 1; i <= totalPages; i++) {
                                                        doc.setPage(i);
                                                        const footerY = pageHeight - 15;
                                                        doc.setFontSize(8);
                                                        doc.setTextColor(150, 150, 150);
                                                        doc.text('MECALD - Indústria e Comércio', pageWidth / 2, footerY, { align: 'center' });
                                                        doc.text(`Página ${i} de ${totalPages}`, pageWidth / 2, footerY + 5, { align: 'center' });
                                                    }
                                                    
                                                    doc.save(`precificacao-${pricingCalculation.productCode}-${format(new Date(), 'yyyyMMdd-HHmm')}.pdf`);
                                                    
                                                    toast({
                                                        title: "PDF exportado!",
                                                        description: "O relatório de precificação foi baixado com sucesso."
                                                    });
                                                }}
                                            >
                                                <Download className="mr-2 h-3 w-3" />
                                                Exportar PDF
                                            </Button>
                                        )}
                                    </div>
                                </CardHeader>
                                <CardContent>
                                    {pricingCalculation ? (
                                        <div className="space-y-4">
                                            <div>
                                                <h4 className="text-sm font-medium mb-2">Materiais</h4>
                                                <div className="space-y-1 text-sm">
                                                    {pricingCalculation.materialCosts.map(m => (
                                                        <div key={m.id} className="flex justify-between text-muted-foreground">
                                                            <span className="truncate flex-1">{m.materialDescription}</span>
                                                            <span className="ml-2 font-mono">R$ {m.totalCost.toFixed(2)}</span>
                                                        </div>
                                                    ))}
                                                    <div className="flex justify-between font-medium pt-1 border-t">
                                                        <span>Subtotal Materiais</span>
                                                        <span className="font-mono">
                                                            R$ {pricingCalculation.materialCosts.reduce((s, m) => s + m.totalCost, 0).toFixed(2)}
                                                        </span>
                                                    </div>
                                                </div>
                                            </div>

                                            <Separator />

                                            <div>
                                                <h4 className="text-sm font-medium mb-2">Custos de Produção</h4>
                                                <div className="space-y-1 text-sm">
                                                    {pricingCalculation.stageCosts.map(s => (
                                                        <div key={s.stageName} className="flex justify-between text-muted-foreground">
                                                            <span className="flex-1">
                                                                {s.stageName}
                                                                <span className="text-xs ml-1">
                                                                    (R$ {s.costPerDay.toFixed(2)}/kg × {pricingCalculation.productWeight}kg)
                                                                </span>
                                                            </span>
                                                            <span className="font-mono">R$ {s.totalCost.toFixed(2)}</span>
                                                        </div>
                                                    ))}
                                                    {pricingCalculation.machiningCost > 0 && (
                                                        <div className="flex justify-between text-muted-foreground">
                                                            <span className="flex-1">
                                                                Usinagem
                                                                <span className="text-xs ml-1">
                                                                    ({machiningHours}h × R$ {machineHourRate.toFixed(2)}/h)
                                                                </span>
                                                            </span>
                                                            <span className="font-mono">R$ {pricingCalculation.machiningCost.toFixed(2)}</span>
                                                        </div>
                                                    )}
                                                    {pricingCalculation.consumablesCost > 0 && (
                                                        <div className="flex justify-between text-muted-foreground">
                                                            <span className="flex-1">
                                                                Insumos e Consumíveis
                                                                <span className="text-xs ml-1">
                                                                    (R$ {consumablesCostPerKg.toFixed(2)}/kg × {pricingCalculation.productWeight}kg)
                                                                </span>
                                                            </span>
                                                            <span className="font-mono">R$ {pricingCalculation.consumablesCost.toFixed(2)}</span>
                                                        </div>
                                                    )}
                                                    <div className="flex justify-between font-medium pt-1 border-t">
                                                        <span>Subtotal Produção</span>
                                                        <span className="font-mono">
                                                            R$ {(
                                                                pricingCalculation.stageCosts.reduce((s, st) => s + st.totalCost, 0) + 
                                                                pricingCalculation.machiningCost + 
                                                                pricingCalculation.consumablesCost
                                                            ).toFixed(2)}
                                                        </span>
                                                    </div>
                                                </div>
                                            </div>

                                            <Separator />

                                            <div className="space-y-2">
                                                <div className="flex justify-between text-sm">
                                                    <span className="font-medium">Custo Total</span>
                                                    <span className="font-mono font-medium">R$ {pricingCalculation.totalCost.toFixed(2)}</span>
                                                </div>
                                                <div className="flex justify-between text-sm text-green-600">
                                                    <span className="font-medium">Lucro ({pricingCalculation.profitMargin}%)</span>
                                                    <span className="font-mono font-medium">R$ {pricingCalculation.profitValue.toFixed(2)}</span>
                                                </div>
                                                <div className="flex justify-between text-sm pt-1 border-t">
                                                    <span className="font-medium">Preço antes de IRPJ e CSLL</span>
                                                    <span className="font-mono font-medium">
                                                        R$ {(pricingCalculation.priceBeforeIncomeTaxes ?? (pricingCalculation.totalCost + pricingCalculation.profitValue)).toFixed(2)}
                                                    </span>
                                                </div>
                                                <div className="flex justify-between text-sm text-amber-600">
                                                    <span className="font-medium">IRPJ ({pricingCalculation.irpjRate ?? 0}%)</span>
                                                    <span className="font-mono font-medium">R$ {(pricingCalculation.irpjAmount ?? 0).toFixed(2)}</span>
                                                </div>
                                                <div className="flex justify-between text-sm text-amber-600">
                                                    <span className="font-medium">CSLL ({pricingCalculation.csllRate ?? 0}%)</span>
                                                    <span className="font-mono font-medium">R$ {(pricingCalculation.csllAmount ?? 0).toFixed(2)}</span>
                                                </div>
                                            </div>

                                            <Separator />

                                            <div className="p-4 bg-primary/5 rounded-lg border-2 border-primary/20">
                                                <div className="space-y-2">
                                                    <div className="flex justify-between items-center">
                                                        <span className="text-lg font-bold">Preço Final</span>
                                                        <span className="text-2xl font-bold text-primary font-mono">
                                                            R$ {pricingCalculation.finalPrice.toFixed(2)}
                                                        </span>
                                                    </div>
                                                    <div className="flex justify-between items-center text-sm text-muted-foreground">
                                                        <span>Preço por kg</span>
                                                        <span className="font-mono font-medium">
                                                            R$ {pricingCalculation.pricePerKg.toFixed(2)}/kg
                                                        </span>
                                                    </div>
                                                </div>
                                            </div>

                                            <div className="text-xs text-muted-foreground p-3 bg-muted rounded-md">
                                                💡 <strong>Dica:</strong> O preço final já contém IRPJ e CSLL. ICMS, PIS e COFINS
                                                continuam sendo tratados na cotação comercial.
                                            </div>
                                        </div>
                                    ) : (
                                        <div className="text-center py-12 text-muted-foreground">
                                            <Calculator className="mx-auto h-12 w-12 mb-4 opacity-50" />
                                            <p>Selecione um produto e calcule o preço para ver os resultados aqui.</p>
                                        </div>
                                    )}
                                </CardContent>
                            </Card>
                        </div>

                        {/* Card de Biblioteca de Materiais */}
                        <Card>
                            <CardHeader>
                                <div className="flex items-center justify-between">
                                    <div>
                                        <CardTitle>Biblioteca de Materiais</CardTitle>
                                        <CardDescription>
                                            {allMaterials.length} materiais disponíveis
                                        </CardDescription>
                                    </div>
                                    <Button onClick={handleAddMaterial} size="sm">
                                        <PlusCircle className="mr-2 h-4 w-4" />
                                        Novo Material
                                    </Button>
                                </div>
                            </CardHeader>
                            <CardContent>
                                <div className="space-y-4">
                                    <div className="relative">
                                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                                        <Input
                                            placeholder="Buscar materiais..."
                                            value={materialSearchQuery}
                                            onChange={(e) => setMaterialSearchQuery(e.target.value)}
                                            className="pl-10"
                                        />
                                    </div>

                                    <ScrollArea className="h-96">
                                        <div className="space-y-6">
                                            {MATERIAL_CATEGORIES.map(category => {
                                                const categoryMaterials = allMaterials.filter(m => 
                                                    m.category === category &&
                                                    (materialSearchQuery === "" ||
                                                     m.description.toLowerCase().includes(materialSearchQuery.toLowerCase()) ||
                                                     m.category.toLowerCase().includes(materialSearchQuery.toLowerCase()))
                                                );
                                                if (categoryMaterials.length === 0) return null;
                                                
                                                return (
                                                    <div key={category}>
                                                        <div className="flex items-center gap-2 mb-3">
                                                            <h4 className="text-sm font-semibold text-primary">{category}</h4>
                                                            <Badge variant="secondary" className="text-xs">
                                                                {categoryMaterials.length}
                                                            </Badge>
                                                        </div>
                                                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2">
                                                            {categoryMaterials.map(material => (
                                                                <div 
                                                                    key={material.id} 
                                                                    className="p-3 border rounded-lg text-xs group hover:border-primary hover:shadow-sm transition-all"
                                                                >
                                                                    <div className="flex items-start justify-between gap-2">
                                                                        <div className="flex-1 min-w-0">
                                                                            <div className="font-medium truncate">
                                                                                {material.description}
                                                                            </div>
                                                                            <div className="text-primary font-semibold mt-1">
                                                                                R$ {material.pricePerKg.toFixed(2)}/{material.unit}
                                                                            </div>
                                                                            {material.specification && (
                                                                                <div className="text-xs text-muted-foreground mt-1 truncate">
                                                                                    {material.specification}
                                                                                </div>
                                                                            )}
                                                                        </div>
                                                                        <div className="flex flex-col gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                                                            <Button
                                                                                variant="ghost"
                                                                                size="icon"
                                                                                className="h-7 w-7 hover:bg-primary/10"
                                                                                onClick={() => handleEditMaterial(material)}
                                                                                title="Editar material"
                                                                            >
                                                                                <Pencil className="h-3.5 w-3.5" />
                                                                            </Button>
                                                                            <Button
                                                                                variant="ghost"
                                                                                size="icon"
                                                                                className="h-7 w-7 text-destructive hover:text-destructive hover:bg-destructive/10"
                                                                                onClick={() => {
                                                                                    const isDefault = DEFAULT_MATERIALS.some(dm => dm.id === material.id);
                                                                                    const confirmMessage = isDefault
                                                                                        ? `Deseja ocultar "${material.description}"?`
                                                                                        : `Deseja excluir "${material.description}"?`;
                                                                                    if (confirm(confirmMessage)) {
                                                                                        deleteMaterial(material.id);
                                                                                    }
                                                                                }}
                                                                                title="Remover material"
                                                                            >
                                                                                <Trash2 className="h-3.5 w-3.5" />
                                                                            </Button>
                                                                        </div>
                                                                    </div>
                                                                </div>
                                                            ))}
                                                        </div>
                                                    </div>
                                                );
                                            })}

                                            {materialSearchQuery && allMaterials.filter(m =>
                                                m.description.toLowerCase().includes(materialSearchQuery.toLowerCase()) ||
                                                m.category.toLowerCase().includes(materialSearchQuery.toLowerCase())
                                            ).length === 0 && (
                                                <div className="text-center py-8 text-muted-foreground">
                                                    <Package className="mx-auto h-12 w-12 mb-3 opacity-30" />
                                                    <p className="font-medium">Nenhum material encontrado</p>
                                                    <p className="text-xs mt-1">Tente buscar com outros termos</p>
                                                </div>
                                            )}
                                        </div>
                                    </ScrollArea>
                                </div>
                            </CardContent>
                        </Card>
                    </div>
                </TabsContent>
            <TabsContent value="manufacturingPlan" className="mt-4">
                <div className="grid gap-6">
                    <Card>
                        <CardHeader>
                            <div className="flex items-center justify-between">
                                <div>
                                    <CardTitle>Plano de Fabricação</CardTitle>
                                    <CardDescription>
                                        Manual de "como fazer" cada peça, seguindo as etapas de fabricação do produto. Documento confidencial.
                                    </CardDescription>
                                </div>
                                <div className="flex gap-2">
                                    <Button onClick={saveManufacturingPlan} disabled={isSavingPlan}>
                                        <Save className="mr-2 h-4 w-4" />
                                        {isSavingPlan ? "Salvando..." : "Salvar Plano"}
                                    </Button>
                                    <Button variant="outline" onClick={exportManufacturingPlanPDF} disabled={planTasks.length === 0}>
                                        <Download className="mr-2 h-4 w-4" />
                                        Exportar PDF
                                    </Button>
                                </div>
                            </div>
                        </CardHeader>
                        <CardContent className="space-y-6">
                            {/* Aviso de confidencialidade */}
                            <div className="flex items-start gap-3 p-4 rounded-md border border-red-300 bg-red-50">
                                <ShieldAlert className="h-5 w-5 text-red-600 flex-shrink-0 mt-0.5" />
                                <div className="text-xs text-red-700">
                                    <strong>Documento confidencial — uso interno restrito.</strong> Reprodução ou utilização fora da
                                    empresa é proibida (Lei nº 9.279/1996, art. 195, incisos XI e XII; art. 482, "g", da CLT).
                                    O aviso completo é incluído automaticamente no PDF exportado.
                                </div>
                            </div>

                            {/* Identificação */}
                            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                                <div className="lg:col-span-2 space-y-2">
                                    <Label>Produto</Label>
                                    <div className="relative">
                                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                                        <Input
                                            placeholder="Buscar código ou nome..."
                                            value={planProductSearch}
                                            onChange={(e) => setPlanProductSearch(e.target.value)}
                                            className="pl-9"
                                        />
                                    </div>
                                    <Select
                                        value={selectedProductForPlan?.id || ''}
                                        onValueChange={(value) => {
                                            const product = products.find(p => p.id === value) || null;
                                            setSelectedProductForPlan(product);
                                            if (product) initPlanTasksFromProduct(product);
                                        }}
                                    >
                                        <SelectTrigger>
                                            <SelectValue placeholder="Selecione o produto" />
                                        </SelectTrigger>
                                        <SelectContent className="max-h-[350px]">
                                            {products
                                                .filter(p => {
                                                    if (!planProductSearch) return true;
                                                    const q = planProductSearch.toLowerCase();
                                                    return p.code.toLowerCase().includes(q) || p.description.toLowerCase().includes(q);
                                                })
                                                .map(product => (
                                                    <SelectItem key={product.id} value={product.id}>
                                                        {product.code} - {product.description}
                                                    </SelectItem>
                                                ))}
                                        </SelectContent>
                                    </Select>
                                </div>

                                <div className="space-y-2">
                                    <Label className="flex items-center gap-1"><Hash className="h-3.5 w-3.5" /> Nº do Desenho</Label>
                                    <Input
                                        placeholder="Ex: DES-1234"
                                        value={planDrawingNumber}
                                        onChange={(e) => setPlanDrawingNumber(e.target.value)}
                                        onBlur={() => planDrawingNumber.trim() && loadManufacturingPlan(planDrawingNumber)}
                                    />
                                    {savedPlanDrawings.has(planDrawingNumber.trim()) ? (
                                        <p className="text-xs text-green-600">Já existe plano salvo para este desenho.</p>
                                    ) : (
                                        <p className="text-xs text-muted-foreground">Usado como chave de salvamento.</p>
                                    )}
                                </div>

                                <div className="space-y-2">
                                    <Label>Nº de Controle</Label>
                                    <Input value={planControlNumber} readOnly placeholder="Gerado ao salvar" className="bg-muted" />
                                </div>
                            </div>

                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <div className="space-y-2">
                                    <Label className="flex items-center gap-1"><User className="h-3.5 w-3.5" /> Criado por</Label>
                                    <Select value={planCreator} onValueChange={setPlanCreator}>
                                        <SelectTrigger>
                                            <SelectValue placeholder="Selecione o responsável" />
                                        </SelectTrigger>
                                        <SelectContent>
                                            {planCreators.map(name => (
                                                <SelectItem key={name} value={name}>{name}</SelectItem>
                                            ))}
                                        </SelectContent>
                                    </Select>
                                    <div className="flex gap-2">
                                        <Input
                                            placeholder="Adicionar novo responsável..."
                                            value={newPlanCreator}
                                            onChange={(e) => setNewPlanCreator(e.target.value)}
                                            onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), addPlanCreator())}
                                            className="h-8 text-sm"
                                        />
                                        <Button type="button" variant="outline" size="sm" onClick={addPlanCreator}>
                                            <PlusCircle className="h-4 w-4" />
                                        </Button>
                                    </div>
                                </div>
                                <div className="space-y-2">
                                    <Label>Revisão</Label>
                                    <Input value={planRevision} onChange={(e) => setPlanRevision(e.target.value)} placeholder="0" />
                                </div>
                            </div>

                            <div className="space-y-2">
                                <Label>Observações Gerais</Label>
                                <Textarea
                                    placeholder="Informações gerais aplicáveis a toda a fabricação..."
                                    value={planGeneralNotes}
                                    onChange={(e) => setPlanGeneralNotes(e.target.value)}
                                />
                            </div>

                            <Separator />

                            {/* Tarefas por etapa */}
                            {planTasks.length > 0 ? (
                                <div className="space-y-4">
                                    <h4 className="text-sm font-medium">Procedimentos por Etapa</h4>
                                    {planTasks.map((task, index) => (
                                        <Card key={`${task.stageName}-${index}`} className="border-l-4 border-l-primary">
                                            <CardContent className="pt-4 space-y-3">
                                                <div className="flex items-center justify-between">
                                                    <div className="font-medium">{index + 1}. {task.stageName}</div>
                                                    <div className="flex items-center gap-2">
                                                        <Label className="text-xs whitespace-nowrap">Prazo (dias):</Label>
                                                        <Input
                                                            type="number"
                                                            step="0.5"
                                                            className="h-8 w-24"
                                                            value={task.deadlineDays ?? 0}
                                                            onChange={(e) => {
                                                                const v = Number(e.target.value);
                                                                setPlanTasks(prev => prev.map((t, i) => i === index ? { ...t, deadlineDays: v } : t));
                                                            }}
                                                        />
                                                    </div>
                                                </div>
                                                <Textarea
                                                    placeholder="Descreva COMO executar esta etapa: ferramentas, parâmetros, sequência, cuidados de qualidade e segurança..."
                                                    value={task.instructions || ''}
                                                    onChange={(e) => {
                                                        const v = e.target.value;
                                                        setPlanTasks(prev => prev.map((t, i) => i === index ? { ...t, instructions: v } : t));
                                                    }}
                                                    className="min-h-[90px]"
                                                />

                                                {/* Imagens */}
                                                <div className="space-y-2">
                                                    <div className="flex items-center justify-between">
                                                        <Label className="text-xs">Fotos / Desenhos</Label>
                                                        <Button asChild variant="outline" size="sm">
                                                            <label className="cursor-pointer">
                                                                <ImagePlus className="mr-2 h-3.5 w-3.5" />
                                                                Adicionar imagem
                                                                <input
                                                                    type="file"
                                                                    accept="image/*"
                                                                    multiple
                                                                    className="hidden"
                                                                    onChange={(e) => {
                                                                    const fileArr = Array.from(e.target.files || []);
                                                                    e.target.value = '';
                                                                    handlePlanImageUpload(index, fileArr);
                                                                }}
                                                                />
                                                            </label>
                                                        </Button>
                                                    </div>
                                                    {task.images && task.images.length > 0 && (
                                                        <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                                                            {task.images.map((img, imgIdx) => (
                                                                <div key={imgIdx} className="border rounded-md p-2 space-y-1 relative">
                                                                    <Button
                                                                        variant="ghost"
                                                                        size="icon"
                                                                        className="absolute top-1 right-1 h-6 w-6 bg-background/80"
                                                                        onClick={() => setPlanTasks(prev => prev.map((t, i) =>
                                                                            i === index ? { ...t, images: (t.images || []).filter((_, ii) => ii !== imgIdx) } : t
                                                                        ))}
                                                                    >
                                                                        <X className="h-3.5 w-3.5 text-destructive" />
                                                                    </Button>
                                                                    <img src={img.dataUrl} alt="" className="w-full h-24 object-contain rounded" />
                                                                    <Input
                                                                        placeholder="Legenda..."
                                                                        className="h-7 text-xs"
                                                                        value={img.caption || ''}
                                                                        onChange={(e) => {
                                                                            const v = e.target.value;
                                                                            setPlanTasks(prev => prev.map((t, i) =>
                                                                                i === index ? {
                                                                                    ...t,
                                                                                    images: (t.images || []).map((im, ii) => ii === imgIdx ? { ...im, caption: v } : im)
                                                                                } : t
                                                                            ));
                                                                        }}
                                                                    />
                                                                </div>
                                                            ))}
                                                        </div>
                                                    )}
                                                </div>
                                            </CardContent>
                                        </Card>
                                    ))}
                                </div>
                            ) : (
                                <div className="text-center py-12 text-muted-foreground border-2 border-dashed rounded-md">
                                    <BookOpen className="mx-auto h-12 w-12 mb-3 opacity-40" />
                                    <p className="font-medium">Selecione um produto para começar</p>
                                    <p className="text-sm">As etapas de fabricação do produto serão carregadas automaticamente.</p>
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

      <Dialog open={isCopyPricingDialogOpen} onOpenChange={setIsCopyPricingDialogOpen}>
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Copy className="h-5 w-5 text-primary" />
              Copiar precificação
            </DialogTitle>
            <DialogDescription>
              Copie todos os materiais, custos de produção, usinagem, insumos, margem e impostos para o produto selecionado.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <div className="rounded-lg border bg-muted/40 p-4">
              <p className="text-xs text-muted-foreground">Produto que receberá a cópia</p>
              <p className="font-mono font-bold text-primary">{selectedProductForPricing?.code}</p>
              <p className="text-sm">{selectedProductForPricing?.description}</p>
            </div>

            <div className="space-y-2">
              <Label>Buscar produto de origem</Label>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  value={copyPricingSearch}
                  onChange={event => setCopyPricingSearch(event.target.value)}
                  placeholder="Digite o código ou a descrição..."
                  className="pl-10"
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label>Precificação que será copiada</Label>
              <Select value={copyPricingSourceId} onValueChange={setCopyPricingSourceId}>
                <SelectTrigger>
                  <SelectValue placeholder="Selecione um produto já precificado" />
                </SelectTrigger>
                <SelectContent className="max-h-[320px]">
                  {products
                    .filter(product => product.id !== selectedProductForPricing?.id)
                    .filter(product => savedPricingCodes.has(product.code))
                    .filter(product => {
                      const query = copyPricingSearch.trim().toLowerCase();
                      return !query
                        || product.code.toLowerCase().includes(query)
                        || product.description.toLowerCase().includes(query);
                    })
                    .map(product => (
                      <SelectItem key={product.id} value={product.id}>
                        <div className="flex flex-col py-1">
                          <span className="font-mono font-semibold">{product.code}</span>
                          <span className="text-xs text-muted-foreground">{product.description}</span>
                        </div>
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                Apenas produtos que possuem precificação salva são apresentados.
              </p>
            </div>

            {copyPricingSourceId && (() => {
              const source = products.find(product => product.id === copyPricingSourceId);
              if (!source || !selectedProductForPricing) return null;
              const weightDifference = Math.abs((source.unitWeight || 0) - (selectedProductForPricing.unitWeight || 0));
              return (
                <div className={`rounded-md border p-3 text-sm ${weightDifference > 0.01 ? 'border-amber-500 bg-amber-50 text-amber-900' : 'border-green-500 bg-green-50 text-green-900'}`}>
                  {weightDifference > 0.01
                    ? `Atenção: o peso do produto de origem é ${source.unitWeight || 0} kg e o destino possui ${selectedProductForPricing.unitWeight || 0} kg. Revise os valores após copiar.`
                    : 'Os pesos dos produtos são iguais. A precificação pode ser copiada diretamente.'}
                </div>
              );
            })()}
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setIsCopyPricingDialogOpen(false)} disabled={isCopyingPricing}>
              Cancelar
            </Button>
            <Button type="button" onClick={copySavedPricingToSelectedProduct} disabled={!copyPricingSourceId || isCopyingPricing}>
              <Copy className="mr-2 h-4 w-4" />
              {isCopyingPricing ? 'Copiando...' : 'Copiar e salvar precificação'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog de Material */}
      <Dialog open={isMaterialDialogOpen} onOpenChange={setIsMaterialDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>
              {materialToEdit ? "Editar Material" : "Novo Material"}
            </DialogTitle>
            <DialogDescription>
              {materialToEdit 
                ? "Altere os dados do material personalizado" 
                : "Adicione um novo material à biblioteca"}
            </DialogDescription>
          </DialogHeader>
          <Form {...materialForm}>
            <form onSubmit={materialForm.handleSubmit(saveMaterial)} className="space-y-4">
              <FormField
                control={materialForm.control}
                name="category"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Categoria</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value || ""}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Selecione uma categoria" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent className="max-h-[200px]">
                        {MATERIAL_CATEGORIES.map(cat => (
                          <SelectItem key={cat} value={cat}>{cat}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
              
              <FormField
                control={materialForm.control}
                name="description"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Descrição</FormLabel>
                    <FormControl>
                      <Input placeholder="Ex: Chapa 1/2 - ASTM A36" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              
              <div className="grid grid-cols-2 gap-4">
                <FormField
                  control={materialForm.control}
                  name="pricePerKg"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Preço/kg (R$)</FormLabel>
                      <FormControl>
                        <Input type="number" step="0.01" placeholder="0.00" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                
                <FormField
                  control={materialForm.control}
                  name="unit"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Unidade</FormLabel>
                      <FormControl>
                        <Input placeholder="kg, m³, un" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
              
              <FormField
                control={materialForm.control}
                name="specification"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Especificação (Opcional)</FormLabel>
                    <FormControl>
                      <Input placeholder="Ex: ASTM A36, SAE 1020" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              
              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => setIsMaterialDialogOpen(false)}>
                  Cancelar
                </Button>
                <Button type="submit">
                  {materialToEdit ? "Salvar Alterações" : "Adicionar Material"}
                </Button>
              </DialogFooter>
            </form>
          </Form>
        </DialogContent>
      </Dialog>
    </>
  );

}
