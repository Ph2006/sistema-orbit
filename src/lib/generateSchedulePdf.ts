"use client";

import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { format } from "date-fns";
import { collection, getDocs, query, where } from "firebase/firestore";
import { db } from "@/lib/firebase";
import {
  type Order,
  type CompanyData,
  calculateOrderProgress,
  calculateItemProgress,
} from "@/lib/orders-shared";

export async function buildSchedulePdf(order: Order, companyData: CompanyData): Promise<jsPDF> {
  const docPdf = new jsPDF();
  const pageWidth = docPdf.internal.pageSize.width;
  let yPos = 15;

  // Header com logo e informaÃ§Ãµes da empresa
  if (companyData.logo?.preview) {
      try {
          docPdf.addImage(companyData.logo.preview, 'PNG', 15, yPos, 40, 20, undefined, 'FAST');
      } catch (e) {
          console.error("Error adding logo to PDF:", e);
      }
  }

  // InformaÃ§Ãµes da empresa ao lado da logo
  let companyInfoX = 65;
  let companyInfoY = yPos + 5;
  docPdf.setFontSize(16).setFont('helvetica', 'bold');
  docPdf.text(companyData.nomeFantasia || 'Sua Empresa', companyInfoX, companyInfoY);
  companyInfoY += 6;
  
  docPdf.setFontSize(8).setFont('helvetica', 'normal');
  if (companyData.endereco) {
      const addressLines = docPdf.splitTextToSize(companyData.endereco, pageWidth - companyInfoX - 15);
      docPdf.text(addressLines, companyInfoX, companyInfoY);
      companyInfoY += (addressLines.length * 3);
  }
  if (companyData.cnpj) {
      docPdf.text(`CNPJ: ${companyData.cnpj}`, companyInfoX, companyInfoY);
      companyInfoY += 4;
  }
  if (companyData.email) {
      docPdf.text(`Email: ${companyData.email}`, companyInfoX, companyInfoY);
      companyInfoY += 4;
  }
  if (companyData.celular) {
      docPdf.text(`Telefone: ${companyData.celular}`, companyInfoX, companyInfoY);
  }

  yPos = 45;

  // TÃ­tulo do documento
  docPdf.setFontSize(16).setFont('helvetica', 'bold');
  docPdf.text('CRONOGRAMA DE PRODUÃ‡ÃƒO', pageWidth / 2, yPos, { align: 'center' });
  yPos += 15;

  // Dois cartÃµes independentes impedem que nomes longos de clientes
  // invadam a Ã¡rea reservada Ã s datas e ao status do cronograma.
  const leftColumnX = 15;
  const columnsGap = 6;
  const leftColumnWidth = 112;
  const rightColumnX = leftColumnX + leftColumnWidth + columnsGap;
  const rightColumnWidth = pageWidth - rightColumnX - 15;
  const cardTop = yPos;
  const cardPadding = 4;
  const clientLines = docPdf.splitTextToSize(
      order.customer?.name || 'Cliente nÃ£o informado',
      leftColumnWidth - (cardPadding * 2)
  );
  const projectLines = order.projectName
      ? docPdf.splitTextToSize(order.projectName, leftColumnWidth - (cardPadding * 2))
      : [];
  const leftCardHeight = 15 + (clientLines.length * 4) + (projectLines.length ? 5 + projectLines.length * 4 : 0);
  const rightCardHeight = order.deliveryDate ? 32 : 27;
  const cardHeight = Math.max(36, leftCardHeight, rightCardHeight);

  docPdf.setFillColor(248, 250, 252);
  docPdf.setDrawColor(203, 213, 225);
  docPdf.setLineWidth(0.25);
  docPdf.roundedRect(leftColumnX, cardTop, leftColumnWidth, cardHeight, 2, 2, 'FD');
  docPdf.roundedRect(rightColumnX, cardTop, rightColumnWidth, cardHeight, 2, 2, 'FD');

  let leftColumnY = cardTop + 6;
  docPdf.setTextColor(30, 64, 175).setFontSize(9).setFont('helvetica', 'bold');
  docPdf.text('DADOS DO PEDIDO', leftColumnX + cardPadding, leftColumnY);
  leftColumnY += 6;
  docPdf.setTextColor(15, 23, 42).setFontSize(8.5);
  docPdf.text(`Pedido NÂº: ${order.quotationNumber}`, leftColumnX + cardPadding, leftColumnY);
  leftColumnY += 5;
  docPdf.text('Cliente:', leftColumnX + cardPadding, leftColumnY);
  leftColumnY += 4;
  docPdf.setFont('helvetica', 'normal');
  docPdf.text(clientLines, leftColumnX + cardPadding, leftColumnY);
  leftColumnY += clientLines.length * 4;
  if (projectLines.length) {
      leftColumnY += 1;
      docPdf.setFont('helvetica', 'bold');
      docPdf.text('Projeto:', leftColumnX + cardPadding, leftColumnY);
      leftColumnY += 4;
      docPdf.setFont('helvetica', 'normal');
      docPdf.text(projectLines, leftColumnX + cardPadding, leftColumnY);
  }

  let rightColumnY = cardTop + 6;
  docPdf.setTextColor(30, 64, 175).setFontSize(9).setFont('helvetica', 'bold');
  docPdf.text('CONTROLE DO CRONOGRAMA', rightColumnX + cardPadding, rightColumnY);
  rightColumnY += 6;
  docPdf.setTextColor(15, 23, 42).setFontSize(8.5).setFont('helvetica', 'normal');
  const rightColumnLines = [
      `OS Interna: ${order.internalOS || 'N/A'}`,
      `EmissÃ£o: ${format(new Date(), "dd/MM/yyyy")}`,
      ...(order.deliveryDate ? [`Entrega: ${format(order.deliveryDate, "dd/MM/yyyy")}`] : []),
      `Status: ${order.status}`,
  ];
  rightColumnLines.forEach(line => {
      docPdf.text(docPdf.splitTextToSize(line, rightColumnWidth - (cardPadding * 2)), rightColumnX + cardPadding, rightColumnY);
      rightColumnY += 5;
  });

  docPdf.setTextColor(0, 0, 0);
  yPos = cardTop + cardHeight + 10;

  // Progresso geral do pedido
  const orderProgress = calculateOrderProgress(order);
  
  // TÃ­tulo do progresso geral
  docPdf.setFontSize(10).setFont('helvetica', 'bold');
  docPdf.text('PROGRESSO GERAL DO PEDIDO:', 15, yPos);
  yPos += 8;
  
  // Barra de progresso geral
  const progressBarWidth = 120;
  const progressBarHeight = 8;
  const progressBarX = 15;
  
  // Fundo da barra (cinza claro)
  docPdf.setFillColor(230, 230, 230);
  docPdf.rect(progressBarX, yPos, progressBarWidth, progressBarHeight, 'F');
  
  // Barra de progresso colorida
  const progressWidth = (orderProgress / 100) * progressBarWidth;
  if (orderProgress < 30) {
      docPdf.setFillColor(239, 68, 68); // Vermelho
  } else if (orderProgress < 70) {
      docPdf.setFillColor(245, 158, 11); // Amarelo
  } else {
      docPdf.setFillColor(34, 197, 94); // Verde
  }
  docPdf.rect(progressBarX, yPos, progressWidth, progressBarHeight, 'F');
  
  // Borda da barra
  docPdf.setDrawColor(0, 0, 0);
  docPdf.setLineWidth(0.1);
  docPdf.rect(progressBarX, yPos, progressBarWidth, progressBarHeight, 'S');
  
  // Texto da porcentagem
  docPdf.setFontSize(9).setFont('helvetica', 'normal');
  docPdf.setTextColor(0, 0, 0);
  docPdf.text(`${orderProgress.toFixed(1)}%`, progressBarX + progressBarWidth + 5, yPos + 6);
  
  yPos += progressBarHeight + 15;

  // Tabela do cronograma
  const tableBody: any[][] = [];
  order.items.forEach(item => {
      if (item.productionPlan && item.productionPlan.length > 0) {
          // CabeÃ§alho do item com cÃ³digo, descriÃ§Ã£o e quantidade na mesma linha
          const itemHeader = `Item: ${item.code ? `[${item.code}] ` : ''}${item.description} (Qtd: ${item.quantity})`;
          const itemProgress = calculateItemProgress(item);
          const progressColor: [number, number, number] = itemProgress < 30
              ? [220, 38, 38]
              : itemProgress < 70
                  ? [217, 119, 6]
                  : [22, 163, 74];
          const progressBackground: [number, number, number] = itemProgress < 30
              ? [254, 226, 226]
              : itemProgress < 70
                  ? [254, 243, 199]
                  : [220, 252, 231];

          tableBody.push([{
              content: itemHeader, 
              colSpan: 5, 
              styles: { 
                  fontStyle: 'bold', 
                  fillColor: [30, 64, 175],
                  textColor: [255, 255, 255],
                  fontSize: 9.5,
                  cellPadding: { top: 3, right: 3, bottom: 3, left: 3 }
              },
              itemRowType: 'header'
          }]);
          
          // Linha com barra de progresso do item
          tableBody.push([{
              content: `Progresso do item: ${itemProgress.toFixed(1)}%`,
              colSpan: 5, 
              styles: { 
                  fontSize: 8.5,
                  fontStyle: 'bold',
                  fillColor: progressBackground,
                  textColor: progressColor,
                  cellPadding: { top: 2.5, right: 3, bottom: 2.5, left: 3 }
              },
              itemRowType: 'progress',
              itemProgress,
              progressColor
          }]);
          
          // Etapas do item
          item.productionPlan.forEach(stage => {
              tableBody.push([
                  `  â€¢ ${stage.stageName}`,
                  stage.startDate ? format(new Date(stage.startDate), 'dd/MM/yy') : 'N/A',
                  stage.completedDate ? format(new Date(stage.completedDate), 'dd/MM/yy') : 'N/A',
                  `${stage.durationDays || 0} dia(s)`,
                  stage.status,
              ]);
          });
          
          // Linha em branco para separar itens
          tableBody.push([{ content: '', colSpan: 5, styles: { minCellHeight: 3 } }]);
      }
  });
  
  autoTable(docPdf, {
      startY: yPos,
      head: [['Etapa', 'InÃ­cio Previsto', 'Fim Previsto', 'DuraÃ§Ã£o', 'Status']],
      body: tableBody,
      styles: { 
          fontSize: 8,
          cellPadding: 2
      },
      headStyles: { 
          fillColor: [37, 99, 235], 
          fontSize: 9, 
          textColor: 255,
          fontStyle: 'bold'
      },
      columnStyles: {
          0: { cellWidth: 60 }, // Etapa
          1: { cellWidth: 25, halign: 'center' }, // InÃ­cio
          2: { cellWidth: 25, halign: 'center' }, // Fim
          3: { cellWidth: 20, halign: 'center' }, // DuraÃ§Ã£o
          4: { cellWidth: 25, halign: 'center' }, // Status
      },
      didParseCell: (data) => {
          if (data.cell.raw && (data.cell.raw as any).colSpan) {
              data.cell.styles.halign = 'left';
          }
      },
      didDrawCell: (data) => {
          const rawCell = data.cell.raw as any;
          if (rawCell?.itemRowType === 'progress') {
              const progress = Number(rawCell.itemProgress) || 0;
              const color = rawCell.progressColor as [number, number, number];
              const barX = data.cell.x + 48;
              const barY = data.cell.y + (data.cell.height - 4) / 2;
              const barWidth = Math.max(20, data.cell.width - 53);
              const barHeight = 4;

              docPdf.setFillColor(226, 232, 240);
              docPdf.roundedRect(barX, barY, barWidth, barHeight, 1, 1, 'F');
              const fillWidth = Math.min(barWidth, Math.max(0, (progress / 100) * barWidth));
              if (fillWidth > 0) {
                  docPdf.setFillColor(color[0], color[1], color[2]);
                  docPdf.roundedRect(barX, barY, fillWidth, barHeight, 1, 1, 'F');
              }
          }
      },
      margin: { left: 15, right: 15 }
  });

  // HistÃ³rico completo de chamados de engenharia da OS.
  const ticketsSnapshot = await getDocs(query(
      collection(db, "companies", "mecald", "engineeringTickets"),
      where("orderId", "==", order.id)
  ));
  const ticketsData = ticketsSnapshot.docs.map(ticketDoc => {
      const data = ticketDoc.data();
      const toDate = (value: any): Date | null => {
          if (!value) return null;
          if (typeof value.toDate === 'function') return value.toDate();
          const parsed = new Date(value);
          return Number.isNaN(parsed.getTime()) ? null : parsed;
      };
      const status = String(data.status || 'Aberto');
      const createdDate = toDate(data.createdDate);
      const resolvedDate = toDate(
          data.resolvedDate
          || data.resolvedAt
          || data.closedAt
          || (status === 'Resolvido' ? data.updatedAt : null)
      );
      const isResolved = status === 'Resolvido';
      const endReference = isResolved && resolvedDate ? resolvedDate : new Date();
      const daysOpen = createdDate
          ? Math.max(0, Math.ceil((endReference.getTime() - createdDate.getTime()) / (1000 * 60 * 60 * 24)))
          : 0;

      return {
          ticketNumber: data.ticketNumber || ticketDoc.id.slice(0, 8).toUpperCase(),
          title: String(data.title || '-'),
          status,
          priority: String(data.priority || 'MÃ©dia'),
          createdDate,
          resolvedDate,
          isResolved,
          daysOpen,
      };
  }).sort((a, b) => (b.createdDate?.getTime() || 0) - (a.createdDate?.getTime() || 0));

  if (ticketsData.length > 0) {
      const pageHeight = docPdf.internal.pageSize.height;
      const currentY = (docPdf as any).lastAutoTable.finalY + 12;
      if (currentY + 30 > pageHeight - 20) {
          docPdf.addPage();
          yPos = 15;
      } else {
          yPos = currentY;
      }

      docPdf.setFontSize(12).setFont('helvetica', 'bold');
      docPdf.text('HISTÃ“RICO DE CHAMADOS DE ENGENHARIA', 15, yPos);
      yPos += 3;

      const openCount = ticketsData.filter(ticket => !ticket.isResolved).length;
      docPdf.setFontSize(9).setFont('helvetica', 'normal');
      docPdf.text(`${ticketsData.length} chamado(s) no total, ${openCount} ainda em aberto.`, 15, yPos + 4);

      autoTable(docPdf, {
          startY: yPos + 8,
          head: [['NÂº', 'TÃ­tulo', 'Status', 'Prioridade', 'Aberto em', 'Resolvido em', 'Dias em aberto']],
          body: ticketsData.map(ticket => [
              ticket.ticketNumber,
              ticket.title.length > 35 ? `${ticket.title.substring(0, 35)}...` : ticket.title,
              ticket.status,
              ticket.priority,
              ticket.createdDate ? format(ticket.createdDate, 'dd/MM/yy') : '-',
              ticket.resolvedDate ? format(ticket.resolvedDate, 'dd/MM/yy') : '-',
              `${ticket.daysOpen} dia(s)`,
          ]),
          styles: { fontSize: 8, cellPadding: 2 },
          headStyles: { fillColor: [37, 99, 235], fontSize: 8.5, textColor: 255 },
          didParseCell: data => {
              if (data.section !== 'body') return;
              const ticket = ticketsData[data.row.index];
              if (data.column.index === 2) {
                  data.cell.styles.textColor = ticket.isResolved ? [21, 128, 61] : [185, 28, 28];
                  data.cell.styles.fontStyle = 'bold';
              }
              if (data.column.index === 6 && !ticket.isResolved && ticket.daysOpen > 5) {
                  data.cell.styles.textColor = [185, 28, 28];
                  data.cell.styles.fontStyle = 'bold';
              }
          },
          margin: { left: 15, right: 15 },
      });
  }

  // RodapÃ© com informaÃ§Ãµes adicionais
  const finalY = (docPdf as any).lastAutoTable.finalY;
  const pageHeight = docPdf.internal.pageSize.height;
  
  if (finalY + 30 < pageHeight - 20) {
      yPos = finalY + 15;
      docPdf.setFontSize(8).setFont('helvetica', 'italic');
      docPdf.text(
          `Documento gerado automaticamente em ${format(new Date(), "dd/MM/yyyy 'Ã s' HH:mm")}`,
          pageWidth / 2,
          yPos,
          { align: 'center' }
      );
  }

  return docPdf;
}

export async function downloadSchedulePdf(order: Order, companyData: CompanyData) {
  const docPdf = await buildSchedulePdf(order, companyData);
  docPdf.save(`Cronograma_Pedido_${order.quotationNumber}_${format(new Date(), 'yyyyMMdd')}.pdf`);
}

