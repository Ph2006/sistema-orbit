import React, { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { doc, getDoc } from 'firebase/firestore';
import { db, getCompanyCollection } from '../lib/firebase';
import { Order, OrderItem } from '../types/kanban';
import { Download, Calendar, Package, Clock, CheckCircle, AlertCircle, Loader } from 'lucide-react';
import { format, differenceInDays } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { jsPDF } from 'jspdf';
import 'jspdf-autotable';
import { calculateItemProgress } from '../utils/progress';

const PublicSchedulePage: React.FC = () => {
  const { orderId } = useParams<{ orderId: string }>();
  const [order, setOrder] = useState<Order | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<Date>(new Date());

  useEffect(() => {
    loadOrder();
    // Atualizar a cada 30 segundos
    const interval = setInterval(loadOrder, 30000);
    return () => clearInterval(interval);
  }, [orderId]);

  const loadOrder = async () => {
    if (!orderId) return;
    
    try {
      setLoading(true);
      // Tentar carregar de diferentes estruturas de empresa
      const companies = ['mecald', 'brasmold']; // Adicione suas empresas aqui
      
      for (const companyId of companies) {
        try {
          const orderRef = doc(db, `companies/${companyId}/orders`, orderId);
          const orderDoc = await getDoc(orderRef);
          
          if (orderDoc.exists()) {
            const orderData = { id: orderDoc.id, ...orderDoc.data() } as Order;
            setOrder(orderData);
            setLastUpdated(new Date());
            setError(null);
            break;
          }
        } catch (err) {
          continue; // Tentar próxima empresa
        }
      }
      
      if (!order) {
        setError('Pedido não encontrado ou acesso não autorizado.');
      }
    } catch (err) {
      setError('Erro ao carregar cronograma. Tente novamente.');
      console.error('Error loading order:', err);
    } finally {
      setLoading(false);
    }
  };

  const exportClientPDF = () => {
    if (!order) return;

    const doc = new jsPDF({
      orientation: 'portrait',
      unit: 'mm',
      format: 'a4'
    });

    const pageWidth = doc.internal.pageSize.getWidth();
    const pageHeight = doc.internal.pageSize.getHeight();
    const margin = 15;
    let currentY = margin;

    // 🎨 CABEÇALHO ELEGANTE PARA CLIENTE
    doc.setFillColor(52, 152, 219);
    doc.rect(0, 0, pageWidth, 40, 'F');
    
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(24);
    doc.setFont('helvetica', 'bold');
    doc.text('CRONOGRAMA DE PRODUÇÃO', pageWidth / 2, 15, { align: 'center' });
    
    doc.setFontSize(14);
    doc.text(`Pedido #${order.orderNumber}`, pageWidth / 2, 25, { align: 'center' });
    
    if (order.projectName) {
      doc.setFontSize(12);
      doc.text(`Projeto: ${order.projectName}`, pageWidth / 2, 33, { align: 'center' });
    }
    
    currentY = 50;

    // 📊 RESUMO EXECUTIVO
    doc.setTextColor(0, 0, 0);
    doc.setFontSize(16);
    doc.setFont('helvetica', 'bold');
    doc.text('RESUMO DO PROJETO', margin, currentY);
    currentY += 10;

    // Caixa com informações principais
    doc.setFillColor(248, 249, 250);
    doc.rect(margin, currentY, pageWidth - (2 * margin), 35, 'F');
    doc.setDrawColor(52, 152, 219);
    doc.setLineWidth(1);
    doc.rect(margin, currentY, pageWidth - (2 * margin), 35);
    
    currentY += 8;
    doc.setFontSize(11);
    doc.setFont('helvetica', 'normal');
    
    // Informações do cliente
    doc.setFont('helvetica', 'bold');
    doc.text('Cliente:', margin + 5, currentY);
    doc.setFont('helvetica', 'normal');
    doc.text(order.customer, margin + 25, currentY);
    
    currentY += 7;
    
    // Prazo
    doc.setFont('helvetica', 'bold');
    doc.text('Prazo:', margin + 5, currentY);
    doc.setFont('helvetica', 'normal');
    if (daysRemaining < 0) {
      doc.setTextColor(220, 53, 69);
      doc.text(`${Math.abs(daysRemaining)} dias em atraso`, margin + 20, currentY);
    } else if (daysRemaining === 0) {
      doc.setTextColor(255, 193, 7);
      doc.text('Entrega hoje!', margin + 20, currentY);
    } else {
      doc.setTextColor(40, 167, 69);
      doc.text(`${daysRemaining} dias restantes`, margin + 20, currentY);
    }
    doc.setTextColor(0, 0, 0);
    
    currentY += 20;

    // 📈 PROGRESSO VISUAL
    doc.setFontSize(16);
    doc.setFont('helvetica', 'bold');
    doc.text('PROGRESSO POR ETAPA', margin, currentY);
    currentY += 10;

    // Calcular progresso por etapas
    const stageProgress: Record<string, { total: number, completed: number }> = {};
    
    order.items?.forEach(item => {
      if (item.progress) {
        Object.entries(item.progress).forEach(([stage, progress]) => {
          if (!stageProgress[stage]) {
            stageProgress[stage] = { total: 0, completed: 0 };
          }
          stageProgress[stage].total += 100;
          stageProgress[stage].completed += progress || 0;
        });
      }
    });

    // Barras de progresso visuais
    Object.entries(stageProgress).forEach(([stage, data], index) => {
      const progressPercent = data.total > 0 ? Math.round((data.completed / data.total) * 100) : 0;
      const barY = currentY + (index * 18);
      
      // Nome da etapa
      doc.setFontSize(11);
      doc.setFont('helvetica', 'bold');
      doc.text(stage, margin, barY);
      
      // Barra de progresso
      const barX = margin + 70;
      const barWidth = 80;
      const barHeight = 8;
      
      // Fundo da barra
      doc.setFillColor(240, 240, 240);
      doc.rect(barX, barY - 5, barWidth, barHeight, 'F');
      
      // Progresso
      const fillWidth = (barWidth * progressPercent) / 100;
      if (progressPercent === 100) {
        doc.setFillColor(40, 167, 69); // Verde
      } else if (progressPercent >= 70) {
        doc.setFillColor(52, 152, 219); // Azul
      } else if (progressPercent >= 30) {
        doc.setFillColor(255, 193, 7); // Amarelo
      } else {
        doc.setFillColor(220, 53, 69); // Vermelho
      }
      doc.rect(barX, barY - 5, fillWidth, barHeight, 'F');
      
      // Borda
      doc.setDrawColor(200, 200, 200);
      doc.rect(barX, barY - 5, barWidth, barHeight);
      
      // Percentual
      doc.setFontSize(10);
      doc.setFont('helvetica', 'bold');
      doc.text(`${progressPercent}%`, barX + barWidth + 5, barY);
      
      // Status em texto
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(9);
      const statusText = progressPercent === 100 ? '✓ Concluído' : 
                        progressPercent >= 70 ? '⚡ Finalizando' : 
                        progressPercent >= 30 ? '🔨 Em Produção' : '⏳ Aguardando';
      doc.text(statusText, barX + barWidth + 25, barY);
    });
    
    currentY += Object.keys(stageProgress).length * 18 + 15;

    // 📋 TABELA DE ITENS
    doc.setFontSize(16);
    doc.setFont('helvetica', 'bold');
    doc.text('ITENS DO PEDIDO', margin, currentY);
    currentY += 5;

    const tableData = order.items?.map(item => {
      const itemProgress = calculateItemProgress(item.progress) || 0;
      const status = itemProgress === 100 ? '✅ Pronto' : 
                   itemProgress >= 70 ? '🔧 Finalizando' :
                   itemProgress >= 30 ? '⚙️ Produzindo' : '⏳ Aguardando';
      
      return [
        item.itemNumber.toString(),
        item.code,
        item.description.length > 35 ? item.description.substring(0, 35) + '...' : item.description,
        item.quantity.toString(),
        `${itemProgress}%`,
        status
      ];
    }) || [];

    (doc as any).autoTable({
      startY: currentY,
      head: [['Item', 'Código', 'Descrição', 'Qtd', 'Progresso', 'Status']],
      body: tableData,
      theme: 'striped',
      headStyles: {
        fillColor: [52, 152, 219],
        textColor: [255, 255, 255],
        fontStyle: 'bold',
        fontSize: 10
      },
      bodyStyles: {
        fontSize: 9
      },
      columnStyles: {
        0: { cellWidth: 15, halign: 'center' },
        1: { cellWidth: 25 },
        2: { cellWidth: 70 },
        3: { cellWidth: 15, halign: 'center' },
        4: { cellWidth: 20, halign: 'center' },
        5: { cellWidth: 30, halign: 'center' }
      },
      didParseCell: function(data: any) {
        if (data.column.index === 5 && data.section === 'body') {
          const status = data.cell.text[0];
          if (status.includes('Pronto')) {
            data.cell.styles.textColor = [40, 167, 69];
            data.cell.styles.fontStyle = 'bold';
          } else if (status.includes('Finalizando')) {
            data.cell.styles.textColor = [52, 152, 219];
          } else if (status.includes('Produzindo')) {
            data.cell.styles.textColor = [255, 193, 7];
          }
        }
      }
    });

    // 📞 INFORMAÇÕES DE CONTATO
    const finalY = (doc as any).lastAutoTable.finalY + 15;
    if (finalY < pageHeight - 50) {
      doc.setFillColor(248, 249, 250);
      doc.rect(margin, finalY, pageWidth - (2 * margin), 25, 'F');
      doc.setDrawColor(52, 152, 219);
      doc.rect(margin, finalY, pageWidth - (2 * margin), 25);
      
      doc.setFontSize(12);
      doc.setFont('helvetica', 'bold');
      doc.text('DÚVIDAS OU INFORMAÇÕES?', pageWidth / 2, finalY + 8, { align: 'center' });
      
      doc.setFontSize(10);
      doc.setFont('helvetica', 'normal');
      doc.text('Entre em contato conosco para esclarecimentos sobre seu pedido.', pageWidth / 2, finalY + 15, { align: 'center' });
      doc.text('Este cronograma é atualizado automaticamente conforme o progresso da produção.', pageWidth / 2, finalY + 20, { align: 'center' });
    }

    // 📝 RODAPÉ ELEGANTE
    const footerY = pageHeight - 15;
    doc.setDrawColor(52, 152, 219);
    doc.setLineWidth(0.5);
    doc.line(margin, footerY - 5, pageWidth - margin, footerY - 5);
    
    doc.setFontSize(8);
    doc.setTextColor(100, 100, 100);
    doc.text(
      `Cronograma atualizado em ${format(new Date(), 'dd/MM/yyyy HH:mm', { locale: ptBR })}`,
      pageWidth / 2,
      footerY,
      { align: 'center' }
    );

    doc.save(`cronograma-${order.orderNumber}-${format(new Date(), 'ddMMyyyy-HHmm')}.pdf`);
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 to-blue-100 flex items-center justify-center">
        <div className="text-center">
          <Loader className="h-12 w-12 text-blue-600 animate-spin mx-auto mb-4" />
          <h2 className="text-xl font-semibold text-gray-800">Carregando cronograma...</h2>
        </div>
      </div>
    );
  }

  if (error || !order) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-red-50 to-red-100 flex items-center justify-center">
        <div className="text-center max-w-md">
          <AlertCircle className="h-16 w-16 text-red-500 mx-auto mb-4" />
          <h2 className="text-xl font-bold text-gray-800 mb-2">Cronograma não encontrado</h2>
          <p className="text-gray-600">{error}</p>
        </div>
      </div>
    );
  }

  const totalItems = order.items?.length || 0;
  const overallProgress = totalItems > 0 ? Math.round(order.items!.reduce((sum, item) => sum + (calculateItemProgress(item.progress) || 0), 0) / totalItems) : 0;
  const daysRemaining = differenceInDays(new Date(order.deliveryDate), new Date());

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-blue-50">
      {/* 🎨 CABEÇALHO ELEGANTE */}
      <div className="bg-gradient-to-r from-blue-600 to-blue-800 text-white py-12">
        <div className="max-w-6xl mx-auto px-6">
          <div className="flex justify-between items-start">
            <div>
              <h1 className="text-4xl font-bold mb-2">Cronograma de Produção</h1>
              <p className="text-xl text-blue-100">Pedido #{order.orderNumber}</p>
              {order.projectName && (
                <p className="text-lg text-blue-200 mt-1">Projeto: {order.projectName}</p>
              )}
            </div>
            <div className="text-right">
              <button
                onClick={exportClientPDF}
                className="bg-white text-blue-600 px-6 py-3 rounded-lg font-semibold hover:bg-blue-50 transition-colors shadow-lg flex items-center"
              >
                <Download className="h-5 w-5 mr-2" />
                Baixar PDF
              </button>
              <p className="text-xs text-blue-200 mt-2">
                Atualizado: {format(lastUpdated, 'dd/MM/yyyy HH:mm', { locale: ptBR })}
              </p>
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-6xl mx-auto px-6 py-8">
        {/* 📊 RESUMO EXECUTIVO */}
        <div className="bg-white rounded-xl shadow-lg p-8 mb-8">
          <h2 className="text-2xl font-bold text-gray-800 mb-6 flex items-center">
            <Package className="h-6 w-6 mr-3 text-blue-600" />
            Resumo do Projeto
          </h2>
          
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="bg-blue-50 p-6 rounded-lg">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-blue-600 font-medium">Cliente</p>
                  <p className="text-xl font-bold text-gray-800">{order.customer}</p>
                </div>
              </div>
            </div>
            
            <div className="bg-green-50 p-6 rounded-lg">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-green-600 font-medium">Progresso Geral</p>
                  <p className="text-3xl font-bold text-gray-800">{overallProgress}%</p>
                </div>
                <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center">
                  {overallProgress === 100 ? (
                    <CheckCircle className="h-8 w-8 text-green-600" />
                  ) : (
                    <div className={`w-8 h-8 rounded-full border-4 ${
                      overallProgress >= 70 ? 'border-green-600' : 
                      overallProgress >= 30 ? 'border-yellow-500' : 'border-red-500'
                    } border-t-transparent animate-spin`} />
                  )}
                </div>
              </div>
            </div>
            
            <div className={`p-6 rounded-lg ${
              daysRemaining < 0 ? 'bg-red-50' : 
              daysRemaining < 7 ? 'bg-yellow-50' : 'bg-blue-50'
            }`}>
              <div className="flex items-center justify-between">
                <div>
                  <p className={`font-medium ${
                    daysRemaining < 0 ? 'text-red-600' : 
                    daysRemaining < 7 ? 'text-yellow-600' : 'text-blue-600'
                  }`}>
                    {daysRemaining < 0 ? 'Atraso' : 'Prazo'}
                  </p>
                  <p className="text-xl font-bold text-gray-800">
                    {daysRemaining < 0 ? `${Math.abs(daysRemaining)} dias` : 
                     daysRemaining === 0 ? 'Hoje!' : `${daysRemaining} dias`}
                  </p>
                </div>
                <Calendar className={`h-8 w-8 ${
                  daysRemaining < 0 ? 'text-red-600' : 
                  daysRemaining < 7 ? 'text-yellow-600' : 'text-blue-600'
                }`} />
              </div>
            </div>
          </div>

          <div className="mt-6 grid grid-cols-1 md:grid-cols-2 gap-4 text-sm text-gray-600">
            <div>
              <span className="font-medium">Data de Início:</span> {format(new Date(order.startDate), 'dd/MM/yyyy', { locale: ptBR })}
            </div>
            <div>
              <span className="font-medium">Previsão de Entrega:</span> {format(new Date(order.deliveryDate), 'dd/MM/yyyy', { locale: ptBR })}
            </div>
          </div>
        </div>

        {/* 📈 PROGRESSO POR ETAPA */}
        <div className="bg-white rounded-xl shadow-lg p-8 mb-8">
          <h2 className="text-2xl font-bold text-gray-800 mb-6 flex items-center">
            <BarChart className="h-6 w-6 mr-3 text-blue-600" />
            Progresso por Etapa
          </h2>
          
          <div className="space-y-6">
            {(() => {
              const stageProgress: Record<string, { total: number, completed: number }> = {};
              
              order.items?.forEach(item => {
                if (item.progress) {
                  Object.entries(item.progress).forEach(([stage, progress]) => {
                    if (!stageProgress[stage]) {
                      stageProgress[stage] = { total: 0, completed: 0 };
                    }
                    stageProgress[stage].total += 100;
                    stageProgress[stage].completed += progress || 0;
                  });
                }
              });

              return Object.entries(stageProgress).map(([stage, data]) => {
                const progressPercent = data.total > 0 ? Math.round((data.completed / data.total) * 100) : 0;
                
                return (
                  <div key={stage} className="flex items-center space-x-4">
                    <div className="w-32 text-sm font-medium text-gray-700 flex-shrink-0">
                      {stage}
                    </div>
                    <div className="flex-1 bg-gray-200 rounded-full h-4 overflow-hidden">
                      <div 
                        className={`h-full transition-all duration-500 ${
                          progressPercent === 100 ? 'bg-green-500' : 
                          progressPercent >= 70 ? 'bg-blue-500' :
                          progressPercent >= 30 ? 'bg-yellow-500' : 'bg-red-500'
                        }`}
                        style={{ width: `${progressPercent}%` }}
                      />
                    </div>
                    <div className="w-16 text-right">
                      <span className="text-sm font-bold text-gray-800">{progressPercent}%</span>
                    </div>
                    <div className="w-20 text-xs text-gray-500">
                      {progressPercent === 100 ? '✅ Pronto' : 
                       progressPercent >= 70 ? '🔧 Finalizando' :
                       progressPercent >= 30 ? '⚙️ Produzindo' : '⏳ Aguardando'}
                    </div>
                  </div>
                );
              });
            })()}
          </div>
        </div>

        {/* 📋 TABELA DE ITENS */}
        <div className="bg-white rounded-xl shadow-lg p-8">
          <h2 className="text-2xl font-bold text-gray-800 mb-6 flex items-center">
            <Clock className="h-6 w-6 mr-3 text-blue-600" />
            Itens do Pedido
          </h2>
          
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="bg-blue-50 border-b border-blue-200">
                  <th className="text-left py-3 px-4 font-semibold text-blue-800">Item</th>
                  <th className="text-left py-3 px-4 font-semibold text-blue-800">Código</th>
                  <th className="text-left py-3 px-4 font-semibold text-blue-800">Descrição</th>
                  <th className="text-center py-3 px-4 font-semibold text-blue-800">Qtd</th>
                  <th className="text-center py-3 px-4 font-semibold text-blue-800">Progresso</th>
                  <th className="text-center py-3 px-4 font-semibold text-blue-800">Status</th>
                </tr>
              </thead>
              <tbody>
                {order.items?.map((item, index) => {
                  const itemProgress = calculateItemProgress(item.progress) || 0;
                  
                  return (
                    <tr key={item.id} className={`border-b ${index % 2 === 0 ? 'bg-gray-50' : 'bg-white'} hover:bg-blue-50 transition-colors`}>
                      <td className="py-4 px-4 font-medium">{item.itemNumber}</td>
                      <td className="py-4 px-4 text-sm">{item.code}</td>
                      <td className="py-4 px-4 text-sm">{item.description}</td>
                      <td className="py-4 px-4 text-center">{item.quantity}</td>
                      <td className="py-4 px-4">
                        <div className="flex items-center space-x-2">
                          <div className="flex-1 bg-gray-200 rounded-full h-2">
                            <div 
                              className={`h-full rounded-full transition-all ${
                                itemProgress === 100 ? 'bg-green-500' : 
                                itemProgress >= 70 ? 'bg-blue-500' :
                                itemProgress >= 30 ? 'bg-yellow-500' : 'bg-red-500'
                              }`}
                              style={{ width: `${itemProgress}%` }}
                            />
                          </div>
                          <span className="text-xs font-medium w-10 text-right">{itemProgress}%</span>
                        </div>
                      </td>
                      <td className="py-4 px-4 text-center">
                        <span className={`px-2 py-1 text-xs font-medium rounded-full ${
                          itemProgress === 100 ? 'bg-green-100 text-green-800' : 
                          itemProgress >= 70 ? 'bg-blue-100 text-blue-800' :
                          itemProgress >= 30 ? 'bg-yellow-100 text-yellow-800' : 'bg-gray-100 text-gray-800'
                        }`}>
                          {itemProgress === 100 ? 'Concluído' : 
                           itemProgress >= 70 ? 'Quase Pronto' :
                           itemProgress >= 30 ? 'Em Produção' : 'Aguardando'}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>

        {/* 📞 RODAPÉ COM INFORMAÇÕES */}
        <div className="mt-8 bg-gradient-to-r from-blue-600 to-blue-800 text-white rounded-xl p-6 text-center">
          <h3 className="text-lg font-semibold mb-2">Dúvidas sobre seu pedido?</h3>
          <p className="text-blue-100">Entre em contato conosco para esclarecimentos.</p>
          <p className="text-xs text-blue-200 mt-3">
            Este cronograma é atualizado automaticamente conforme o progresso da produção.
          </p>
        </div>
      </div>
    </div>
  );
};

export default PublicSchedulePage;