import React, { useState, useEffect } from 'react';
import { Download, Lock, Eye, EyeOff, TrendingUp, TrendingDown, DollarSign } from "lucide-react";

interface FinancialData {
  quotations: {
    id: string;
    osNumber: string;
    totalValue: number;
    taxDiscount: number;
    finalValue: number;
    date: string;
  }[];
  costs: {
    id: string;
    osNumber: string;
    description: string;
    value: number;
    category: string;
    date: string;
  }[];
}

export default function FinancePage() {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [selectedOS, setSelectedOS] = useState('');
  const [activeTab, setActiveTab] = useState('overview');
  const [financialData, setFinancialData] = useState<FinancialData>({
    quotations: [],
    costs: []
  });

  // Dados fictícios para demonstração
  useEffect(() => {
    setFinancialData({
      quotations: [
        {
          id: '1',
          osNumber: 'OS-2024-001',
          totalValue: 15000,
          taxDiscount: 2250, // 15% de impostos
          finalValue: 12750,
          date: '2024-01-15'
        },
        {
          id: '2',
          osNumber: 'OS-2024-002',
          totalValue: 28000,
          taxDiscount: 4200, // 15% de impostos
          finalValue: 23800,
          date: '2024-01-20'
        },
        {
          id: '3',
          osNumber: 'OS-2024-003',
          totalValue: 45000,
          taxDiscount: 6750, // 15% de impostos
          finalValue: 38250,
          date: '2024-01-25'
        }
      ],
      costs: [
        {
          id: '1',
          osNumber: 'OS-2024-001',
          description: 'Material de soldagem',
          value: 1200,
          category: 'Material',
          date: '2024-01-16'
        },
        {
          id: '2',
          osNumber: 'OS-2024-001',
          description: 'Mão de obra especializada',
          value: 3500,
          category: 'Mão de obra',
          date: '2024-01-17'
        },
        {
          id: '3',
          osNumber: 'OS-2024-002',
          description: 'Peças de reposição',
          value: 2800,
          category: 'Material',
          date: '2024-01-21'
        },
        {
          id: '4',
          osNumber: 'OS-2024-002',
          description: 'Transporte',
          value: 450,
          category: 'Logística',
          date: '2024-01-22'
        },
        {
          id: '5',
          osNumber: 'OS-2024-003',
          description: 'Equipamentos especiais',
          value: 8900,
          category: 'Equipamento',
          date: '2024-01-26'
        }
      ]
    });
  }, []);

  const handleAuthentication = () => {
    if (password === 'OP4484210640') {
      setIsAuthenticated(true);
      setError('');
    } else {
      setError('Senha incorreta. Tente novamente.');
    }
  };

  const getUniqueOS = () => {
    const osNumbers = [...new Set([
      ...financialData.quotations.map(q => q.osNumber),
      ...financialData.costs.map(c => c.osNumber)
    ])];
    return osNumbers;
  };

  const getFinancialSummary = (osNumber: string) => {
    const quotation = financialData.quotations.find(q => q.osNumber === osNumber);
    const costs = financialData.costs.filter(c => c.osNumber === osNumber);
    
    const revenue = quotation?.finalValue || 0;
    const totalCosts = costs.reduce((sum, cost) => sum + cost.value, 0);
    const grossProfit = revenue - totalCosts;
    const profitMargin = revenue > 0 ? (grossProfit / revenue) * 100 : 0;

    return {
      revenue,
      totalCosts,
      grossProfit,
      profitMargin,
      taxDiscount: quotation?.taxDiscount || 0,
      totalValue: quotation?.totalValue || 0
    };
  };

  const exportDetailedReport = (osNumber: string) => {
    const summary = getFinancialSummary(osNumber);
    const quotation = financialData.quotations.find(q => q.osNumber === osNumber);
    const costs = financialData.costs.filter(c => c.osNumber === osNumber);

    const reportData = {
      osNumber,
      data: new Date().toLocaleDateString('pt-BR'),
      receitas: {
        valorBruto: summary.totalValue,
        descontoImpostos: summary.taxDiscount,
        valorLiquido: summary.revenue
      },
      despesas: costs.map(cost => ({
        descricao: cost.description,
        categoria: cost.category,
        valor: cost.value,
        data: new Date(cost.date).toLocaleDateString('pt-BR')
      })),
      totalDespesas: summary.totalCosts,
      indicadores: {
        lucroLiquido: summary.grossProfit,
        margemLucro: summary.profitMargin.toFixed(2) + '%',
        roi: summary.totalCosts > 0 ? ((summary.grossProfit / summary.totalCosts) * 100).toFixed(2) + '%' : 'N/A'
      }
    };

    const blob = new Blob([JSON.stringify(reportData, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `relatorio-financeiro-${osNumber}-${new Date().toISOString().split('T')[0]}.json`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const getBadgeColor = (profitMargin: number) => {
    if (profitMargin >= 20) return 'bg-green-100 text-green-800';
    if (profitMargin >= 10) return 'bg-yellow-100 text-yellow-800';
    return 'bg-red-100 text-red-800';
  };

  if (!isAuthenticated) {
    return (
      <div className="flex-1 space-y-4 p-4 md:p-8 pt-6">
        <div className="flex items-center justify-between space-y-2">
          <h1 className="text-3xl font-bold tracking-tight font-headline">Financeiro</h1>
        </div>
        
        <div className="max-w-md mx-auto bg-white rounded-lg shadow-md">
          <div className="p-6 text-center">
            <div className="mx-auto mb-4 w-12 h-12 bg-yellow-100 rounded-full flex items-center justify-center">
              <Lock className="w-6 h-6 text-yellow-600" />
            </div>
            <h2 className="text-xl font-bold mb-2">Acesso Restrito</h2>
            <p className="text-gray-600 mb-6">
              Esta área requer autenticação. Digite a senha para continuar.
            </p>
            
            <div className="space-y-4">
              <div className="text-left">
                <label htmlFor="password" className="block text-sm font-medium text-gray-700 mb-2">
                  Senha de Acesso
                </label>
                <div className="relative">
                  <input
                    id="password"
                    type={showPassword ? "text" : "password"}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    onKeyPress={(e) => e.key === 'Enter' && handleAuthentication()}
                    placeholder="Digite a senha"
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  />
                  <button
                    type="button"
                    className="absolute right-2 top-2 p-1 text-gray-400 hover:text-gray-600"
                    onClick={() => setShowPassword(!showPassword)}
                  >
                    {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
              </div>
              
              {error && (
                <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded">
                  {error}
                </div>
              )}
              
              <button 
                onClick={handleAuthentication}
                className="w-full bg-blue-600 text-white py-2 px-4 rounded-md hover:bg-blue-700 focus:ring-2 focus:ring-blue-500"
              >
                Acessar Sistema Financeiro
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 space-y-4 p-4 md:p-8 pt-6">
      <div className="flex items-center justify-between space-y-2">
        <h1 className="text-3xl font-bold tracking-tight font-headline">Financeiro</h1>
        <button
          onClick={() => setIsAuthenticated(false)}
          className="flex items-center px-4 py-2 border border-gray-300 rounded-md text-gray-700 bg-white hover:bg-gray-50"
        >
          <Lock className="w-4 h-4 mr-2" />
          Sair
        </button>
      </div>

      <div className="space-y-4">
        {/* Seleção de OS */}
        <div className="bg-white rounded-lg shadow-md">
          <div className="p-6">
            <h2 className="text-xl font-bold mb-2">Seleção de Ordem de Serviço</h2>
            <p className="text-gray-600 mb-4">
              Escolha uma OS para visualizar os detalhes financeiros
            </p>
            
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {getUniqueOS().map((osNumber) => {
                const summary = getFinancialSummary(osNumber);
                return (
                  <div 
                    key={osNumber}
                    className={`bg-white border-2 rounded-lg p-4 cursor-pointer transition-all ${
                      selectedOS === osNumber ? 'border-blue-500 ring-2 ring-blue-200' : 'border-gray-200 hover:border-gray-300'
                    }`}
                    onClick={() => setSelectedOS(osNumber)}
                  >
                    <div className="space-y-2">
                      <h3 className="font-semibold text-lg">{osNumber}</h3>
                      <div className="flex justify-between text-sm">
                        <span>Receita:</span>
                        <span className="text-green-600 font-medium">R$ {summary.revenue.toLocaleString('pt-BR')}</span>
                      </div>
                      <div className="flex justify-between text-sm">
                        <span>Custos:</span>
                        <span className="text-red-600 font-medium">R$ {summary.totalCosts.toLocaleString('pt-BR')}</span>
                      </div>
                      <div className="flex justify-between text-sm font-semibold">
                        <span>Lucro:</span>
                        <span className={summary.grossProfit >= 0 ? 'text-green-600' : 'text-red-600'}>
                          R$ {summary.grossProfit.toLocaleString('pt-BR')}
                        </span>
                      </div>
                      <div className="flex justify-center">
                        <span className={`px-3 py-1 rounded-full text-xs font-medium ${getBadgeColor(summary.profitMargin)}`}>
                          {summary.profitMargin.toFixed(1)}% margem
                        </span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {selectedOS && (
          <div className="space-y-4">
            {/* Tabs */}
            <div className="bg-white rounded-lg shadow-md">
              <div className="border-b border-gray-200">
                <nav className="flex space-x-8 px-6">
                  {[
                    { id: 'overview', label: 'Visão Geral' },
                    { id: 'revenue', label: 'Receitas' },
                    { id: 'expenses', label: 'Despesas' },
                    { id: 'indicators', label: 'Indicadores' }
                  ].map((tab) => (
                    <button
                      key={tab.id}
                      onClick={() => setActiveTab(tab.id)}
                      className={`py-4 px-1 border-b-2 font-medium text-sm ${
                        activeTab === tab.id
                          ? 'border-blue-500 text-blue-600'
                          : 'border-transparent text-gray-500 hover:text-gray-700'
                      }`}
                    >
                      {tab.label}
                    </button>
                  ))}
                </nav>
              </div>

              <div className="p-6">
                {activeTab === 'overview' && (
                  <div className="space-y-6">
                    {(() => {
                      const summary = getFinancialSummary(selectedOS);
                      return (
                        <>
                          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                            <div className="bg-white border border-gray-200 rounded-lg p-4">
                              <div className="flex items-center justify-between mb-2">
                                <h3 className="text-sm font-medium text-gray-600">Receita Líquida</h3>
                                <DollarSign className="h-4 w-4 text-gray-400" />
                              </div>
                              <div className="text-2xl font-bold text-green-600">
                                R$ {summary.revenue.toLocaleString('pt-BR')}
                              </div>
                              <p className="text-xs text-gray-500">
                                Após impostos: R$ {summary.taxDiscount.toLocaleString('pt-BR')}
                              </p>
                            </div>

                            <div className="bg-white border border-gray-200 rounded-lg p-4">
                              <div className="flex items-center justify-between mb-2">
                                <h3 className="text-sm font-medium text-gray-600">Total de Custos</h3>
                                <TrendingDown className="h-4 w-4 text-gray-400" />
                              </div>
                              <div className="text-2xl font-bold text-red-600">
                                R$ {summary.totalCosts.toLocaleString('pt-BR')}
                              </div>
                              <p className="text-xs text-gray-500">
                                Custos operacionais
                              </p>
                            </div>

                            <div className="bg-white border border-gray-200 rounded-lg p-4">
                              <div className="flex items-center justify-between mb-2">
                                <h3 className="text-sm font-medium text-gray-600">Lucro Líquido</h3>
                                <TrendingUp className="h-4 w-4 text-gray-400" />
                              </div>
                              <div className={`text-2xl font-bold ${summary.grossProfit >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                                R$ {summary.grossProfit.toLocaleString('pt-BR')}
                              </div>
                              <p className="text-xs text-gray-500">
                                Margem: {summary.profitMargin.toFixed(1)}%
                              </p>
                            </div>
                          </div>
                          
                          <div className="bg-white border border-gray-200 rounded-lg p-6">
                            <h3 className="text-xl font-bold mb-2">Exportar Relatório Detalhado</h3>
                            <p className="text-gray-600 mb-4">
                              Gere um relatório completo com todas as receitas, despesas e indicadores para {selectedOS}
                            </p>
                            <button 
                              onClick={() => exportDetailedReport(selectedOS)}
                              className="flex items-center px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700"
                            >
                              <Download className="w-4 h-4 mr-2" />
                              Exportar Relatório Detalhado
                            </button>
                          </div>
                        </>
                      );
                    })()}
                  </div>
                )}

                {activeTab === 'revenue' && (
                  <div>
                    {(() => {
                      const quotation = financialData.quotations.find(q => q.osNumber === selectedOS);
                      return quotation ? (
                        <div className="space-y-4">
                          <h3 className="text-xl font-bold">Detalhamento de Receitas - {selectedOS}</h3>
                          
                          <div className="grid grid-cols-2 gap-4">
                            <div>
                              <label className="block text-sm font-medium text-gray-700 mb-1">
                                Valor Bruto do Orçamento
                              </label>
                              <div className="text-lg font-semibold">
                                R$ {quotation.totalValue.toLocaleString('pt-BR')}
                              </div>
                            </div>
                            <div>
                              <label className="block text-sm font-medium text-gray-700 mb-1">
                                Data do Orçamento
                              </label>
                              <div className="text-lg">
                                {new Date(quotation.date).toLocaleDateString('pt-BR')}
                              </div>
                            </div>
                          </div>
                          
                          <div className="border-t pt-4">
                            <div className="flex justify-between items-center mb-2">
                              <span>Valor Bruto:</span>
                              <span className="font-semibold">R$ {quotation.totalValue.toLocaleString('pt-BR')}</span>
                            </div>
                            <div className="flex justify-between items-center mb-2 text-red-600">
                              <span>(-) Impostos:</span>
                              <span className="font-semibold">R$ {quotation.taxDiscount.toLocaleString('pt-BR')}</span>
                            </div>
                            <div className="flex justify-between items-center text-lg font-bold border-t pt-2">
                              <span>Valor Líquido:</span>
                              <span className="text-green-600">R$ {quotation.finalValue.toLocaleString('pt-BR')}</span>
                            </div>
                          </div>
                        </div>
                      ) : (
                        <div className="text-center py-8">
                          <p>Nenhuma receita encontrada para esta OS.</p>
                        </div>
                      );
                    })()}
                  </div>
                )}

                {activeTab === 'expenses' && (
                  <div>
                    {(() => {
                      const costs = financialData.costs.filter(c => c.osNumber === selectedOS);
                      return (
                        <div className="space-y-4">
                          <h3 className="text-xl font-bold">Detalhamento de Despesas - {selectedOS}</h3>
                          
                          {costs.length > 0 ? (
                            <div className="space-y-4">
                              {costs.map((cost) => (
                                <div key={cost.id} className="flex justify-between items-center p-3 border border-gray-200 rounded-lg">
                                  <div className="flex-1">
                                    <div className="font-semibold">{cost.description}</div>
                                    <div className="text-sm text-gray-500">
                                      {cost.category} • {new Date(cost.date).toLocaleDateString('pt-BR')}
                                    </div>
                                  </div>
                                  <div className="text-right">
                                    <div className="font-semibold text-red-600">
                                      R$ {cost.value.toLocaleString('pt-BR')}
                                    </div>
                                  </div>
                                </div>
                              ))}
                              
                              <div className="border-t pt-4">
                                <div className="flex justify-between items-center text-lg font-bold">
                                  <span>Total de Despesas:</span>
                                  <span className="text-red-600">
                                    R$ {costs.reduce((sum, cost) => sum + cost.value, 0).toLocaleString('pt-BR')}
                                  </span>
                                </div>
                              </div>
                            </div>
                          ) : (
                            <div className="text-center py-8">
                              <p>Nenhuma despesa encontrada para esta OS.</p>
                            </div>
                          )}
                        </div>
                      );
                    })()}
                  </div>
                )}

                {activeTab === 'indicators' && (
                  <div>
                    {(() => {
                      const summary = getFinancialSummary(selectedOS);
                      const roi = summary.totalCosts > 0 ? (summary.grossProfit / summary.totalCosts) * 100 : 0;
                      
                      return (
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                          <div className="bg-white border border-gray-200 rounded-lg p-6">
                            <h3 className="text-xl font-bold mb-4">Indicadores de Rentabilidade</h3>
                            <div className="space-y-4">
                              <div className="flex justify-between items-center">
                                <span>Margem de Lucro:</span>
                                <span className={`px-3 py-1 rounded-full text-xs font-medium ${getBadgeColor(summary.profitMargin)}`}>
                                  {summary.profitMargin.toFixed(1)}%
                                </span>
                              </div>
                              <div className="flex justify-between items-center">
                                <span>ROI (Retorno sobre Investimento):</span>
                                <span className={`px-3 py-1 rounded-full text-xs font-medium ${getBadgeColor(roi)}`}>
                                  {roi.toFixed(1)}%
                                </span>
                              </div>
                              <div className="flex justify-between items-center">
                                <span>Eficiência de Custos:</span>
                                <span className="px-3 py-1 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
                                  {summary.revenue > 0 ? ((summary.totalCosts / summary.revenue) * 100).toFixed(1) : 0}%
                                </span>
                              </div>
                            </div>
                          </div>

                          <div className="bg-white border border-gray-200 rounded-lg p-6">
                            <h3 className="text-xl font-bold mb-4">Análise Fiscal</h3>
                            <div className="space-y-4">
                              <div className="flex justify-between">
                                <span>Carga Tributária:</span>
                                <span className="font-semibold">
                                  {summary.totalValue > 0 ? ((summary.taxDiscount / summary.totalValue) * 100).toFixed(1) : 0}%
                                </span>
                              </div>
                              <div className="flex justify-between">
                                <span>Valor de Impostos:</span>
                                <span className="font-semibold text-red-600">
                                  R$ {summary.taxDiscount.toLocaleString('pt-BR')}
                                </span>
                              </div>
                              <div className="flex justify-between">
                                <span>Receita Líquida após Impostos:</span>
                                <span className="font-semibold text-green-600">
                                  R$ {summary.revenue.toLocaleString('pt-BR')}
                                </span>
                              </div>
                            </div>
                          </div>
                        </div>
                      );
                    })()}
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
