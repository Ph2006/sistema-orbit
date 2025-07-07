"use client";

import { useState, useEffect } from "react";
import { useParams } from "next/navigation";
import { doc, getDoc } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { CalendarDays, Download, AlertTriangle, CheckCircle, Clock, Building } from "lucide-react";

type PublicScheduleData = {
    orderId: string;
    orderNumber: string;
    customerName: string;
    projectName?: string;
    internalOS?: string;
    deliveryDate?: Date;
    createdAt: Date;
    companyName: string;
    expiresAt: Date;
    items: Array<{
        description: string;
        code: string;
        quantity: number;
        productionPlan: Array<{
            stageName: string;
            status: string;
            startDate?: Date;
            completedDate?: Date;
            durationDays: number;
        }>;
    }>;
};

const getStatusColor = (status: string) => {
    switch (status) {
        case "Concluído":
            return "bg-green-600 text-white";
        case "Em Andamento":
            return "bg-blue-600 text-white";
        default:
            return "bg-gray-400 text-white";
    }
};

const calculateProgress = (stages: any[]) => {
    if (!stages || stages.length === 0) return 0;
    const completed = stages.filter(s => s.status === "Concluído").length;
    return Math.round((completed / stages.length) * 100);
};

export default function PublicSchedulePage() {
    const params = useParams();
    const scheduleId = params?.scheduleId as string;
    
    const [scheduleData, setScheduleData] = useState<PublicScheduleData | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        const fetchScheduleData = async () => {
            if (!scheduleId) {
                setError("ID do cronograma não encontrado");
                setIsLoading(false);
                return;
            }

            try {
                const scheduleRef = doc(db, "public", "schedules", scheduleId);
                const scheduleSnap = await getDoc(scheduleRef);

                if (!scheduleSnap.exists()) {
                    setError("Cronograma não encontrado ou expirado");
                    setIsLoading(false);
                    return;
                }

                const data = scheduleSnap.data();
                
                // Verificar se o cronograma expirou
                const now = new Date();
                const expiresAt = data.expiresAt?.toDate();
                if (expiresAt && now > expiresAt) {
                    setError("Este cronograma expirou");
                    setIsLoading(false);
                    return;
                }

                // Converter timestamps para dates
                const processedData: PublicScheduleData = {
                    ...data,
                    deliveryDate: data.deliveryDate?.toDate(),
                    createdAt: data.createdAt?.toDate() || new Date(),
                    expiresAt: expiresAt || new Date(),
                    items: data.items.map((item: any) => ({
                        ...item,
                        productionPlan: item.productionPlan.map((stage: any) => ({
                            ...stage,
                            startDate: stage.startDate?.toDate(),
                            completedDate: stage.completedDate?.toDate(),
                        }))
                    }))
                } as PublicScheduleData;

                setScheduleData(processedData);
            } catch (error) {
                console.error("Error fetching schedule:", error);
                setError("Erro ao carregar cronograma");
            } finally {
                setIsLoading(false);
            }
        };

        fetchScheduleData();
    }, [scheduleId]);

    const handleDownloadPDF = async () => {
        if (!scheduleData) return;

        try {
            const docPdf = new jsPDF();
            const pageWidth = docPdf.internal.pageSize.width;
            let yPos = 20;

            // Header
            docPdf.setFontSize(18).setFont(undefined, 'bold');
            docPdf.text(scheduleData.companyName, 15, yPos);
            docPdf.setFontSize(14).setFont(undefined, 'normal');
            docPdf.text(`Cronograma de Produção - Pedido Nº ${scheduleData.orderNumber}`, pageWidth / 2, yPos + 10, { align: 'center' });
            yPos += 25;

            // Informações do pedido
            docPdf.setFontSize(11).setFont(undefined, 'normal');
            docPdf.text(`Cliente: ${scheduleData.customerName}`, 15, yPos);
            if (scheduleData.projectName) {
                docPdf.text(`Projeto: ${scheduleData.projectName}`, 15, yPos + 5);
                yPos += 5;
            }
            if (scheduleData.internalOS) {
                docPdf.text(`OS Interna: ${scheduleData.internalOS}`, pageWidth - 15, yPos, { align: 'right' });
            }
            yPos += 10;

            if (scheduleData.deliveryDate) {
                docPdf.text(`Data de Entrega: ${format(scheduleData.deliveryDate, 'dd/MM/yyyy')}`, 15, yPos);
                yPos += 5;
            }
            docPdf.text(`Atualizado em: ${format(new Date(), 'dd/MM/yyyy HH:mm')}`, pageWidth - 15, yPos, { align: 'right' });
            yPos += 15;

            // Tabela do cronograma
            const tableBody: any[][] = [];
            scheduleData.items.forEach(item => {
                if (item.productionPlan && item.productionPlan.length > 0) {
                    // Cabeçalho do item
                    tableBody.push([
                        { content: `${item.description} (Qtd: ${item.quantity})`, colSpan: 5, styles: { fontStyle: 'bold', fillColor: '#f0f0f0' } }
                    ]);
                    
                    // Etapas do item
                    item.productionPlan.forEach(stage => {
                        tableBody.push([
                            `  • ${stage.stageName}`,
                            stage.startDate ? format(stage.startDate, 'dd/MM/yy') : 'N/A',
                            stage.completedDate ? format(stage.completedDate, 'dd/MM/yy') : 'N/A',
                            `${stage.durationDays || 0} dia(s)`,
                            stage.status,
                        ]);
                    });
                }
            });

            autoTable(docPdf, {
                startY: yPos,
                head: [['Etapa', 'Início', 'Conclusão', 'Duração', 'Status']],
                body: tableBody,
                styles: { fontSize: 8 },
                headStyles: { fillColor: [37, 99, 235], fontSize: 9, textColor: 255 },
                didParseCell: (data) => {
                    if (data.cell.raw && (data.cell.raw as any).colSpan) {
                        data.cell.styles.halign = 'left';
                    }
                }
            });

            // Footer
            const finalY = (docPdf as any).lastAutoTable.finalY + 10;
            docPdf.setFontSize(8).setFont(undefined, 'italic');
            docPdf.text('Cronograma sujeito a alterações. Documento gerado automaticamente.', pageWidth / 2, finalY, { align: 'center' });

            docPdf.save(`Cronograma_Pedido_${scheduleData.orderNumber}.pdf`);
        } catch (error) {
            console.error("Error generating PDF:", error);
        }
    };

    if (isLoading) {
        return (
            <div className="min-h-screen bg-gray-50 py-8">
                <div className="max-w-4xl mx-auto px-4">
                    <Skeleton className="h-8 w-64 mb-4" />
                    <Skeleton className="h-4 w-48 mb-8" />
                    <div className="space-y-4">
                        <Skeleton className="h-24 w-full" />
                        <Skeleton className="h-32 w-full" />
                        <Skeleton className="h-48 w-full" />
                    </div>
                </div>
            </div>
        );
    }

    if (error) {
        return (
            <div className="min-h-screen bg-gray-50 flex items-center justify-center">
                <Card className="w-full max-w-md mx-4">
                    <CardHeader className="text-center">
                        <AlertTriangle className="h-16 w-16 text-red-500 mx-auto mb-4" />
                        <CardTitle className="text-red-600">Erro</CardTitle>
                    </CardHeader>
                    <CardContent className="text-center">
                        <p className="text-muted-foreground">{error}</p>
                    </CardContent>
                </Card>
            </div>
        );
    }

    if (!scheduleData) return null;

    const overallProgress = scheduleData.items.reduce((acc, item) => 
        acc + calculateProgress(item.productionPlan), 0
    ) / scheduleData.items.length;

    return (
        <div className="min-h-screen bg-gray-50 py-8">
            <div className="max-w-4xl mx-auto px-4">
                {/* Header */}
                <div className="mb-8">
                    <div className="flex items-center gap-3 mb-2">
                        <Building className="h-6 w-6 text-blue-600" />
                        <h1 className="text-2xl font-bold text-gray-900">{scheduleData.companyName}</h1>
                    </div>
                    <h2 className="text-xl text-gray-700">Cronograma de Produção - Pedido Nº {scheduleData.orderNumber}</h2>
                </div>

                {/* Informações do Pedido */}
                <Card className="mb-6">
                    <CardHeader>
                        <CardTitle>Informações do Pedido</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-3">
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div>
                                <p className="text-sm text-muted-foreground">Cliente</p>
                                <p className="font-medium">{scheduleData.customerName}</p>
                            </div>
                            {scheduleData.projectName && (
                                <div>
                                    <p className="text-sm text-muted-foreground">Projeto</p>
                                    <p className="font-medium">{scheduleData.projectName}</p>
                                </div>
                            )}
                            {scheduleData.internalOS && (
                                <div>
                                    <p className="text-sm text-muted-foreground">OS Interna</p>
                                    <p className="font-medium">{scheduleData.internalOS}</p>
                                </div>
                            )}
                            {scheduleData.deliveryDate && (
                                <div>
                                    <p className="text-sm text-muted-foreground">Data de Entrega</p>
                                    <p className="font-medium flex items-center gap-2">
                                        <CalendarDays className="h-4 w-4" />
                                        {format(scheduleData.deliveryDate, 'dd/MM/yyyy')}
                                    </p>
                                </div>
                            )}
                        </div>
                        
                        <div className="pt-4 border-t">
                            <div className="flex items-center justify-between">
                                <div>
                                    <p className="text-sm text-muted-foreground">Progresso Geral</p>
                                    <div className="flex items-center gap-3 mt-1">
                                        <Progress value={overallProgress} className="w-32 h-2" />
                                        <span className="font-bold text-lg">{Math.round(overallProgress)}%</span>
                                    </div>
                                </div>
                                <Button onClick={handleDownloadPDF}>
                                    <Download className="mr-2 h-4 w-4" />
                                    Baixar PDF
                                </Button>
                            </div>
                        </div>
                    </CardContent>
                </Card>

                {/* Cronograma Detalhado */}
                <Card>
                    <CardHeader>
                        <CardTitle>Cronograma de Produção</CardTitle>
                        <CardDescription>
                            Acompanhe o progresso de cada item e etapa de fabricação
                        </CardDescription>
                    </CardHeader>
                    <CardContent>
                        <div className="space-y-6">
                            {scheduleData.items.map((item, itemIndex) => (
                                <div key={itemIndex} className="border rounded-lg p-4">
                                    <div className="flex items-center justify-between mb-4">
                                        <div>
                                            <h4 className="font-medium">{item.description}</h4>
                                            <p className="text-sm text-muted-foreground">
                                                {item.code && `Código: ${item.code} | `}
                                                Quantidade: {item.quantity}
                                            </p>
                                        </div>
                                        <div className="flex items-center gap-2">
                                            <Progress value={calculateProgress(item.productionPlan)} className="w-24 h-2" />
                                            <span className="text-sm font-medium">{calculateProgress(item.productionPlan)}%</span>
                                        </div>
                                    </div>
                                    
                                    {item.productionPlan && item.productionPlan.length > 0 ? (
                                        <Table>
                                            <TableHeader>
                                                <TableRow>
                                                    <TableHead>Etapa</TableHead>
                                                    <TableHead className="text-center">Duração</TableHead>
                                                    <TableHead className="text-center">Início</TableHead>
                                                    <TableHead className="text-center">Conclusão</TableHead>
                                                    <TableHead className="text-center">Status</TableHead>
                                                </TableRow>
                                            </TableHeader>
                                            <TableBody>
                                                {item.productionPlan.map((stage, stageIndex) => (
                                                    <TableRow key={stageIndex}>
                                                        <TableCell className="font-medium">{stage.stageName}</TableCell>
                                                        <TableCell className="text-center">
                                                            {stage.durationDays || 0} dia(s)
                                                        </TableCell>
                                                        <TableCell className="text-center">
                                                            {stage.startDate ? format(stage.startDate, 'dd/MM/yy') : '-'}
                                                        </TableCell>
                                                        <TableCell className="text-center">
                                                            {stage.completedDate ? format(stage.completedDate, 'dd/MM/yy') : '-'}
                                                        </TableCell>
                                                        <TableCell className="text-center">
                                                            <Badge className={getStatusColor(stage.status)}>
                                                                {stage.status === "Concluído" && <CheckCircle className="mr-1 h-3 w-3" />}
                                                                {stage.status === "Em Andamento" && <Clock className="mr-1 h-3 w-3" />}
                                                                {stage.status}
                                                            </Badge>
                                                        </TableCell>
                                                    </TableRow>
                                                ))}
                                            </TableBody>
                                        </Table>
                                    ) : (
                                        <p className="text-center text-muted-foreground py-4">
                                            Nenhuma etapa de produção definida para este item.
                                        </p>
                                    )}
                                </div>
                            ))}
                        </div>
                        
                        <div className="mt-6 pt-4 border-t text-center text-sm text-muted-foreground">
                            <p>Última atualização: {format(new Date(), 'dd/MM/yyyy HH:mm')}</p>
                            <p>Cronograma sujeito a alterações.</p>
                        </div>
                    </CardContent>
                </Card>
            </div>
        </div>
    );
}
