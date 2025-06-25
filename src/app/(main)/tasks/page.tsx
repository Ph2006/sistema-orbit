
"use client";

import { useState, useEffect } from "react";
import { collection, getDocs, doc, getDoc } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useAuth } from "../layout";
import { format, isToday, isPast, endOfDay } from "date-fns";
import { FileDown, AlertTriangle, CalendarCheck } from "lucide-react";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { Badge } from "@/components/ui/badge";

type Task = {
  orderId: string;
  quotationNumber: number;
  customerName: string;
  itemName: string;
  stageName: string;
  startDate: Date | null;
  dueDate: Date | null;
  status: string;
  responsible: string; 
  isOverdue: boolean;
};

type CompanyData = {
    nomeFantasia?: string;
    logo?: { preview?: string };
    endereco?: string;
    cnpj?: string;
    email?: string;
    celular?: string;
    website?: string;
};

export default function TasksPage() {
  const [todaysTasks, setTodaysTasks] = useState<Task[]>([]);
  const [overdueTasks, setOverdueTasks] = useState<Task[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const { user, loading: authLoading } = useAuth();
  const { toast } = useToast();

  useEffect(() => {
    if (!authLoading && user) {
      fetchTasks();
    }
  }, [user, authLoading]);

  const fetchTasks = async () => {
    setIsLoading(true);
    try {
      const ordersSnapshot = await getDocs(collection(db, "companies", "mecald", "orders"));
      const allTasks: Task[] = [];

      ordersSnapshot.forEach(orderDoc => {
        const orderData = orderDoc.data();
        (orderData.items || []).forEach((item: any) => {
          (item.productionPlan || []).forEach((stage: any) => {
            const completedDate = stage.completedDate?.toDate ? stage.completedDate.toDate() : null;
            const startDate = stage.startDate?.toDate ? stage.startDate.toDate() : null;

            if (stage.status !== 'Concluído') {
                allTasks.push({
                    orderId: orderDoc.id,
                    quotationNumber: orderData.quotationNumber || 0,
                    customerName: orderData.customer?.name || 'N/A',
                    itemName: item.description,
                    stageName: stage.stageName,
                    startDate: startDate,
                    dueDate: completedDate,
                    status: stage.status,
                    responsible: 'Não atribuído',
                    isOverdue: completedDate ? isPast(endOfDay(completedDate)) : false,
                });
            }
          });
        });
      });
      
      const filteredTodaysTasks = allTasks.filter(task => 
        !task.isOverdue && ((task.dueDate && isToday(task.dueDate)) || (task.startDate && isToday(task.startDate)))
      ).sort((a, b) => (a.dueDate?.getTime() || 0) - (b.dueDate?.getTime() || 0));

      const filteredOverdueTasks = allTasks.filter(task => task.isOverdue)
                                       .sort((a, b) => (a.dueDate?.getTime() || 0) - (b.dueDate?.getTime() || 0));
      
      setTodaysTasks(filteredTodaysTasks);
      setOverdueTasks(filteredOverdueTasks);

    } catch (error) {
      console.error("Error fetching tasks: ", error);
      toast({
        variant: "destructive",
        title: "Erro ao buscar tarefas",
        description: "Não foi possível carregar a lista de tarefas.",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleExportPDF = async () => {
    toast({ title: "Gerando relatório PDF..." });
    try {
        const companyRef = doc(db, "companies", "mecald", "settings", "company");
        const docSnap = await getDoc(companyRef);
        const companyData: CompanyData = docSnap.exists() ? docSnap.data() as CompanyData : {};

        const docPdf = new jsPDF();
        const pageWidth = docPdf.internal.pageSize.width;
        let y = 15;

        docPdf.setFontSize(16).setFont(undefined, 'bold');
        docPdf.text(companyData.nomeFantasia || 'Relatório de Tarefas', pageWidth / 2, y, { align: 'center' });
        y += 8;
        docPdf.setFontSize(12).setFont(undefined, 'normal');
        docPdf.text(`Relatório de Tarefas Diárias - ${format(new Date(), 'dd/MM/yyyy')}`, pageWidth / 2, y, { align: 'center' });
        y += 15;

        const tableHead = [['Pedido', 'Cliente', 'Item / Etapa', 'Data Conclusão', 'Responsável']];
        
        if (todaysTasks.length > 0) {
            docPdf.setFontSize(12).setFont(undefined, 'bold').text("Tarefas para Hoje", 15, y);
            y += 7;
            const todaysBody = todaysTasks.map(task => [
                `Nº ${task.quotationNumber}`,
                task.customerName,
                `${task.itemName}\n • ${task.stageName}`,
                task.dueDate ? format(task.dueDate, 'dd/MM/yy') : 'N/A',
                task.responsible
            ]);
            autoTable(docPdf, { startY: y, head: tableHead, body: todaysBody });
            y = (docPdf as any).lastAutoTable.finalY + 10;
        }

        if (overdueTasks.length > 0) {
            docPdf.setFontSize(12).setFont(undefined, 'bold').text("Tarefas Atrasadas", 15, y);
            y += 7;
            const overdueBody = overdueTasks.map(task => [
                `Nº ${task.quotationNumber}`,
                task.customerName,
                `${task.itemName}\n • ${task.stageName}`,
                task.dueDate ? format(task.dueDate, 'dd/MM/yy') : 'N/A',
                task.responsible
            ]);
            autoTable(docPdf, { startY: y, head: tableHead, body: overdueBody, headStyles: { fillColor: [220, 53, 69] } });
        }

        docPdf.save(`Relatorio_Tarefas_${format(new Date(), 'yyyy-MM-dd')}.pdf`);
    } catch (error) {
        console.error("Error generating PDF:", error);
        toast({ variant: "destructive", title: "Erro ao gerar PDF" });
    }
  };

  const renderTable = (tasks: Task[], emptyMessage: string) => {
    if (isLoading) {
        return <Skeleton className="h-48 w-full" />;
    }
    if (tasks.length === 0) {
        return <p className="text-center text-muted-foreground py-10">{emptyMessage}</p>;
    }
    return (
        <Table>
            <TableHeader>
                <TableRow>
                    <TableHead className="w-[100px]">Pedido</TableHead>
                    <TableHead>Cliente</TableHead>
                    <TableHead>Item / Etapa de Fabricação</TableHead>
                    <TableHead className="w-[150px]">Data de Conclusão</TableHead>
                    <TableHead className="w-[150px]">Responsável</TableHead>
                    <TableHead className="w-[120px]">Status</TableHead>
                </TableRow>
            </TableHeader>
            <TableBody>
                {tasks.map((task, index) => (
                    <TableRow key={`${task.orderId}-${task.itemName}-${task.stageName}-${index}`} className={task.isOverdue ? "bg-destructive/10" : ""}>
                        <TableCell className="font-medium">Nº {task.quotationNumber}</TableCell>
                        <TableCell>{task.customerName}</TableCell>
                        <TableCell>
                            <span className="font-medium">{task.itemName}</span>
                            <span className="block text-muted-foreground text-sm">&bull; {task.stageName}</span>
                        </TableCell>
                        <TableCell>{task.dueDate ? format(task.dueDate, 'dd/MM/yyyy') : 'A definir'}</TableCell>
                        <TableCell>{task.responsible}</TableCell>
                        <TableCell>
                            <Badge variant={task.isOverdue ? "destructive" : "secondary"}>{task.status}</Badge>
                        </TableCell>
                    </TableRow>
                ))}
            </TableBody>
        </Table>
    );
  };

  return (
    <div className="flex-1 space-y-4 p-4 md:p-8 pt-6">
      <div className="flex items-center justify-between space-y-2">
        <h1 className="text-3xl font-bold tracking-tight font-headline">Tarefas Diárias</h1>
        <Button onClick={handleExportPDF} disabled={isLoading || (todaysTasks.length === 0 && overdueTasks.length === 0)}>
          <FileDown className="mr-2 h-4 w-4" />
          Exportar Relatório PDF
        </Button>
      </div>

      <Tabs defaultValue="today" className="space-y-4">
        <TabsList>
            <TabsTrigger value="today">
                <CalendarCheck className="mr-2 h-4 w-4" />
                Tarefas de Hoje ({todaysTasks.length})
            </TabsTrigger>
            <TabsTrigger value="overdue">
                <AlertTriangle className="mr-2 h-4 w-4" />
                Tarefas Atrasadas ({overdueTasks.length})
            </TabsTrigger>
        </TabsList>
        
        <TabsContent value="today">
            <Card>
                <CardHeader>
                    <CardTitle>Tarefas Agendadas para Hoje</CardTitle>
                    <CardDescription>Etapas de fabricação com data de início ou conclusão para o dia de hoje.</CardDescription>
                </CardHeader>
                <CardContent>
                    {renderTable(todaysTasks, "Nenhuma tarefa agendada para hoje.")}
                </CardContent>
            </Card>
        </TabsContent>

        <TabsContent value="overdue">
             <Card>
                <CardHeader>
                    <CardTitle>Tarefas com Prazo Expirado</CardTitle>
                    <CardDescription>Etapas de fabricação que não foram concluídas na data prevista.</CardDescription>
                </CardHeader>
                <CardContent>
                    {renderTable(overdueTasks, "Nenhuma tarefa atrasada. Bom trabalho!")}
                </CardContent>
            </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
