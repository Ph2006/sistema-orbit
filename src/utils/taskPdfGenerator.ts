// src/utils/taskPdfGenerator.ts
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';

interface TaskPdfOptions {
  tasks: any[];
  companyData: any;
  periodStart: Date;
  periodEnd: Date;
  title?: string;
}

export const generateTasksPDF = async ({
  tasks,
  companyData,
  periodStart,
  periodEnd,
  title = 'PROGRAMAÇÃO DE TAREFAS'
}: TaskPdfOptions) => {
  const doc = new jsPDF();
  const pageWidth = doc.internal.pageSize.width;
  let yPos = 15;

  // Header com logo e dados da empresa
  if (companyData.logo?.preview) {
    try {
      doc.addImage(companyData.logo.preview, 'PNG', 15, yPos, 40, 20, undefined, 'FAST');
    } catch (e) {
      console.warn("Erro ao adicionar logo:", e);
    }
  }

  let textX = 65;
  let textY = yPos;
  doc.setFontSize(18).setFont('helvetica', 'bold');
  doc.text(companyData.nomeFantasia || 'Sua Empresa', textX, textY);
  textY += 6;
  
  doc.setFontSize(9).setFont('helvetica', 'normal');
  if (companyData.endereco) {
    const addressLines = doc.splitTextToSize(companyData.endereco, pageWidth - textX - 15);
    doc.text(addressLines, textX, textY);
    textY += (addressLines.length * 4);
  }
  if (companyData.cnpj) {
    doc.text(`CNPJ: ${companyData.cnpj}`, textX, textY);
    textY += 4;
  }

  yPos = 55;

  // Título do documento
  doc.setFontSize(16).setFont('helvetica', 'bold');
  doc.text(title, pageWidth / 2, yPos, { align: 'center' });
  yPos += 10;
  
  doc.setFontSize(12).setFont('helvetica', 'normal');
  doc.text(
    `Período: ${format(periodStart, "dd/MM/yyyy", { locale: ptBR })} a ${format(periodEnd, "dd/MM/yyyy", { locale: ptBR })}`,
    pageWidth / 2, yPos, { align: 'center' }
  );
  yPos += 20;

  // Estatísticas resumidas
  const totalTasks = tasks.length;
  const completedTasks = tasks.filter(t => t.status === 'concluida').length;
  const inProgressTasks = tasks.filter(t => t.status === 'em_andamento').length;
  const pendingTasks = tasks.filter(t => t.status === 'pendente').length;
  const overdueTasks = tasks.filter(t => t.status !== 'concluida' && new Date() > new Date(t.endDate)).length;

  doc.setFontSize(12).setFont('helvetica', 'bold');
  doc.text('RESUMO DO PERÍODO:', 15, yPos);
  yPos += 8;

  doc.setFontSize(10).setFont('helvetica', 'normal');
  const summaryText = `Total: ${totalTasks} | Concluídas: ${completedTasks} | Em Andamento: ${inProgressTasks} | Pendentes: ${pendingTasks} | Atrasadas: ${overdueTasks}`;
  doc.text(summaryText, 15, yPos);
  yPos += 15;

  // Tabela de tarefas
  const tableData = tasks.map(task => [
    task.title.length > 35 ? task.title.substring(0, 35) + '...' : task.title,
    task.assignedTo?.resourceName || 'N/A',
    task.supervisor?.memberName || 'N/A',
    format(new Date(task.startDate), 'dd/MM', { locale: ptBR }),
    format(new Date(task.endDate), 'dd/MM', { locale: ptBR }),
    task.priority === 'baixa' ? 'Baixa' :
    task.priority === 'media' ? 'Média' :
    task.priority === 'alta' ? 'Alta' : 'Urgente',
    task.status === 'pendente' ? 'Pendente' :
    task.status === 'em_andamento' ? 'Em Andamento' :
    task.status === 'concluida' ? 'Concluída' : 'Cancelada',
    `${task.estimatedHours}h`,
    '________________', // Campo para assinatura
  ]);

  autoTable(doc, {
    startY: yPos,
    head: [['Tarefa', 'Recurso', 'Supervisor', 'Início', 'Fim', 'Prioridade', 'Status', 'Horas', 'Assinatura']],
    body: tableData,
    styles: { 
      fontSize: 8, 
      cellPadding: 2,
      overflow: 'linebreak'
    },
    headStyles: { 
      fillColor: [37, 99, 235], 
      fontSize: 9, 
      textColor: 255,
      fontStyle: 'bold'
    },
    columnStyles: {
      0: { cellWidth: 40 }, // Tarefa
      1: { cellWidth: 25 }, // Recurso
      2: { cellWidth: 25 }, // Supervisor
      3: { cellWidth: 15, halign: 'center' }, // Início
      4: { cellWidth: 15, halign: 'center' }, // Fim
      5: { cellWidth: 18, halign: 'center' }, // Prioridade
      6: { cellWidth: 20, halign: 'center' }, // Status
      7: { cellWidth: 15, halign: 'center' }, // Horas
      8: { cellWidth: 30, halign: 'center' }, // Assinatura
    },
    didParseCell: (data) => {
      // Colorir linhas baseado no status
      if (data.section === 'body') {
        const status = tableData[data.row.index][6];
        switch (status) {
          case 'Concluída':
            data.row.styles.fillColor = [220, 252, 231]; // Verde claro
            break;
          case 'Em Andamento':
            data.row.styles.fillColor = [219, 234, 254]; // Azul claro
            break;
          case 'Pendente':
            data.row.styles.fillColor = [254, 249, 195]; // Amarelo claro
            break;
          case 'Cancelada':
            data.row.styles.fillColor = [254, 226, 226]; // Vermelho claro
            break;
        }
      }
    }
  });

  // Seção de observações
  const finalY = (doc as any).lastAutoTable.finalY + 15;
  doc.setFontSize(12).setFont('helvetica', 'bold');
  doc.text('OBSERVAÇÕES GERAIS:', 15, finalY);
  
  // Linhas para observações manuscritas
  for (let i = 0; i < 5; i++) {
    const lineY = finalY + 15 + (i * 8);
    doc.line(15, lineY, pageWidth - 15, lineY);
  }

  // Rodapé
  const pageHeight = doc.internal.pageSize.height;
  doc.setFontSize(8).setFont('helvetica', 'italic');
  doc.text(
    `Documento gerado em ${format(new Date(), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}`,
    pageWidth / 2,
    pageHeight - 15,
    { align: 'center' }
  );

  return doc;
};
