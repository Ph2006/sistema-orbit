// Componente Dashboard
  const OrdersDashboard = () => {
    const totalOrders = processedOrders.length;
    const inProgressOrders = processedOrders.filter(o => o.status === 'in-progress').length;
    const completedOrders = processedOrders.filter(o => o.status === 'completed').length;
    const onHoldOrders = processedOrders.filter(o => o.status === 'on-hold').length;
    
    const overdueOrders = processedOrders.filter(order => getDeliveryUrgency(order) === 'overdue').length;
    const todayOrders = processedOrders.filter(order => getDeliveryUrgency(order) === 'today').length;
    const tomorrowOrders = processedOrders.filter(order => getDeliveryUrgency(order) === 'tomorrow').length;
    const criticalOrders = processedOrders.filter(order => getDeliveryUrgency(order) === 'critical').length;
    
    const totalWeight = processedOrders.reduce((sum, order) => sum + calculateOrderWeight(order), 0);
    const stats = useMemo(() => calculateProductionStats(processedOrders), [processedOrders]);
    
    return (
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 mb-6">
        <div className="p-4 border-b border-gray-200">
          <h3 className="text-lg font-semibold flex items-center">
            <BarChart2 className="w-5 h-5 mr-2 text-blue-600" />
            Dashboard de Pedidos
          </h3>
        </div>
        
        <div className="p-4">
          <div className="grid grid-cols-2 lg:grid-cols-5 gap-4 mb-6">
            <div className="bg-gradient-to-r from-blue-50 to-blue-100 p-4 rounded-lg border border-blue-200">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-blue-600 font-medium">Em Processo</p>
                  <h4 className="text-2xl font-bold text-blue-700">{inProgressOrders}</h4>
                  <p className="text-xs text-blue-600">
                    {Math.round((inProgressOrders / (totalOrders || 1)) * 100)}% do total
                  </p>
                </div>
                <div className="bg-blue-200 p-3 rounded-full">
                  <Activity className="w-6 h-6 text-blue-600" />
                </div>
              </div>
            </div>
            
            <div className="bg-gradient-to-r from-green-50 to-green-100 p-4 rounded-lg border border-green-200">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-green-600 font-medium">Concluídos</p>
                  <h4 className="text-2xl font-bold text-green-700">{completedOrders}</h4>
                  <p className="text-xs text-green-600">
                    {Math.round((completedOrders / (totalOrders || 1)) * 100)}% do total
                  </p>
                </div>
                <div className="bg-green-200 p-3 rounded-full">
                  <CheckCircle className="w-6 h-6 text-green-600" />
                </div>
              </div>
            </div>
            
            <div className="bg-gradient-to-r from-red-50 to-red-100 p-4 rounded-lg border border-red-200">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-red-600 font-medium">Atrasados</p>
                  <h4 className="text-2xl font-bold text-red-700">{overdueOrders}</h4>
                  <p className="text-xs text-red-600">
                    {Math.round((overdueOrders / (totalOrders || 1)) * 100)}% do total
                  </p>
                </div>
                <div className="bg-red-200 p-3 rounded-full">
                  <AlertTriangle className="w-6 h-6 text-red-600" />
                </div>
              </div>
            </div>
            
            <div className="bg-gradient-to-r from-purple-50 to-purple-100 p-4 rounded-lg border border-purple-200">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-purple-600 font-medium">Peso Total</p>
                  <h4 className="text-2xl font-bold text-purple-700">
                    {totalWeight.toLocaleString('pt-BR', {maximumFractionDigits: 0})}
                  </h4>
                  <p className="text-xs text-purple-600">kg em produção</p>
                </div>
                <div className="bg-purple-200 p-3 rounded-full">
                  <Package className="w-6 h-6 text-purple-600" />
                </div>
              </div>
            </div>
            
            <div className="bg-gradient-to-r from-indigo-50 to-indigo-100 p-4 rounded-lg border border-indigo-200">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-indigo-600 font-medium">Tempo Médio</p>
                  <h4 className="text-2xl font-bold text-indigo-700">
                    {stats.averageProductionDays}d
                  </h4>
                  <p className="text-xs text-indigo-600">
                    {stats.completedOrdersCount > 0 
                      ? `baseado em ${stats.completedOrdersCount} pedidos`
                      : 'aguardando dados'
                    }
                  </p>
                </div>
                <div className="bg-indigo-200 p-3 rounded-full">
                  <Timer className="w-6 h-6 text-indigo-600" />
                </div>
              </div>
            </div>
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div className="bg-orange-50 p-4 rounded-lg border border-orange-200">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-orange-600 font-medium">Entrega Hoje</p>
                  <h4 className="text-xl font-bold text-orange-700">{todayOrders}</h4>
                </div>
                <Bell className="w-5 h-5 text-orange-600" />
              </div>
            </div>
            
            <div className="bg-yellow-50 p-4 rounded-lg border border-yellow-200">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-yellow-600 font-medium">Entrega Amanhã</p>
                  <h4 className="text-xl font-bold text-yellow-700">{tomorrowOrders}</h4>
                </div>
                <Clock className="w-5 h-5 text-yellow-600" />
              </div>
            </div>
            
            <div className="bg-pink-50 p-4 rounded-lg border border-pink-200">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-pink-600 font-medium">Críticos (≤3 dias)</p>
                  <h4 className="text-xl font-bold text-pink-700">{criticalOrders}</h4>
                </div>
                <Zap className="w-5 h-5 text-pink-600" />
              </div>
            </div>
            
            <div className="bg-gray-50 p-4 rounded-lg border border-gray-200">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-gray-600 font-medium">Em Pausa</p>
                  <h4 className="text-xl font-bold text-gray-700">{onHoldOrders}</h4>
                </div>
                <Timer className="w-5 h-5 text-gray-600" />
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  };

  // Componente Calendar View
  const CalendarView = () => {
    const currentDate = new Date();
    const startOfCurrentMonth = new Date(currentDate.getFullYear(), currentDate.getMonth(), 1);
    const endOfCurrentMonth = new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 0);
    
    const days = [];
    for (let d = new Date(startOfCurrentMonth); d <= endOfCurrentMonth; d.setDate(d.getDate() + 1)) {
      days.push(new Date(d));
    }
    
    const getOrdersForDate = (date: Date) => {
      return processedOrders.filter(order => {
        if (!order.deliveryDate) return false;
        try {
          const orderDate = parseISO(order.deliveryDate);
          return format(orderDate, 'yyyy-MM-dd') === format(date, 'yyyy-MM-dd');
        } catch {
          return false;
        }
      });
    };
    
    return (
      <div className="bg-white rounded-lg shadow-sm border border-gray-200">
        <div className="p-4 border-b border-gray-200">
          <h3 className="text-lg font-semibold flex items-center">
            <CalendarDays className="w-5 h-5 mr-2 text-blue-600" />
            Calendário de Entregas - {format(currentDate, 'MMMM yyyy', { locale: ptBR })}
          </h3>
        </div>
        
        <div className="p-4">
          <div className="grid grid-cols-7 gap-2 mb-4">
            {['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'].map(day => (
              <div key={day} className="text-center text-sm font-medium text-gray-500 py-2">
                {day}
              </div>
            ))}
          </div>
          
          <div className="grid grid-cols-7 gap-2">
            {days.map(day => {
              const ordersForDay = getOrdersForDate(day);
              const isToday = format(day, 'yyyy-MM-dd') === format(currentDate, 'yyyy-MM-dd');
              
              return (
                <div
                  key={day.toISOString()}
                  className={`min-h-[80px] p-2 border rounded-lg ${
                    isToday ? 'bg-blue-50 border-blue-200' : 'bg-gray-50 border-gray-200'
                  }`}
                >
                  <div className={`text-sm font-medium mb-1 ${
                    isToday ? 'text-blue-700' : 'text-gray-700'
                  }`}>
                    {format(day, 'd')}
                  </div>
                  
                  {ordersForDay.map(order => {
                    const urgency = getDeliveryUrgency(order);
                    const urgencyColor = getUrgencyColor(urgency);
                    
                    return (
                      <div
                        key={order.id}
                        className={`text-xs p-1 mb-1 rounded cursor-pointer ${urgencyColor}`}
                        onClick={() => handleViewOrder(order)}
                        title={`${order.customerName || order.customer} - ${order.orderNumber}`}
                      >
                        #{safeField(order, ['orderNumber', 'id']).slice(0, 8)}
                      </div>
                    );
                  })}
                </div>
              );
            })}
          </div>
        </div>
      </div>
    );
  };

  // ============================================================================
  // RENDER
  // ============================================================================

  return (
    <div className="space-y-4 lg:space-y-6 print:m-0 print:p-0">
      {/* Header Responsivo */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 print:hidden">
        <div className="flex-1">
          <h1 className="text-2xl lg:text-3xl font-bold text-gray-900">Gestão de Pedidos</h1>
          <p className="text-gray-600 text-sm lg:text-base">
            Sistema integrado de controle e monitoramento de pedidos
          </p>
          <div className="flex items-center gap-4 mt-2 text-sm text-gray-500">
            <span className="flex items-center gap-1">
              <Package className="w-4 h-4" />
              {processedOrders.length} pedidos
            </span>
            <span className="flex items-center gap-1">
              <AlertTriangle className="w-4 h-4 text-red-500" />
              {processedOrders.filter(order => getDeliveryUrgency(order) === 'overdue').length} atrasados
            </span>
            <span className="flex items-center gap-1">
              <Clock className="w-4 h-4 text-orange-500" />
              {processedOrders.filter(order => ['today', 'tomorrow', 'critical'].includes(getDeliveryUrgency(order))).length} urgentes
            </span>
            <span className="flex items-center gap-1">
              <Package className="w-4 h-4 text-purple-500" />
              {processedOrders.reduce((sum, order) => sum + calculateOrderWeight(order), 0).toLocaleString('pt-BR', {maximumFractionDigits: 0})} kg
            </span>
          </div>
        </div>
        
        <div className="flex flex-wrap gap-2">
          <button
            onClick={() => setShowDashboard(!showDashboard)}
            className={`flex items-center gap-2 px-3 py-2 rounded-lg border transition-all ${
              showDashboard 
                ? 'bg-blue-50 border-blue-200 text-blue-700' 
                : 'bg-white border-gray-300 text-gray-600 hover:bg-gray-50'
            }`}
            title={showDashboard ? "Ocultar Dashboard" : "Mostrar Dashboard"}
          >
            <BarChart2 className="w-4 h-4" />
            <span className="hidden sm:inline">Dashboard</span>
          </button>
          
          <button
            onClick={() => setShowFilters(!showFilters)}
            className={`flex items-center gap-2 px-3 py-2 rounded-lg border transition-all ${
              showFilters 
                ? 'bg-purple-50 border-purple-200 text-purple-700' 
                : 'bg-white border-gray-300 text-gray-600 hover:bg-gray-50'
            }`}
            title="Filtros Avançados"
          >
            <ListFilter className="w-4 h-4" />
            <span className="hidden sm:inline">Filtros</span>
          </button>
          
          <div className="flex bg-white border border-gray-300 rounded-lg">
            <button
              onClick={() => setViewMode('table')}
              className={`flex items-center gap-2 px-3 py-2 rounded-l-lg transition-all ${
                viewMode === 'table' 
                  ? 'bg-gray-100 text-gray-900' 
                  : 'text-gray-600 hover:bg-gray-50'
              }`}
              title="Visualização em Tabela"
            >
              <Layers className="w-4 h-4" />
              <span className="hidden md:inline">Tabela</span>
            </button>
            <button
              onClick={() => setViewMode('calendar')}
              className={`flex items-center gap-2 px-3 py-2 rounded-r-lg transition-all ${
                viewMode === 'calendar' 
                  ? 'bg-gray-100 text-gray-900' 
                  : 'text-gray-600 hover:bg-gray-50'
              }`}
              title="Visualização em Calendário"
            >
              <CalendarDays className="w-4 h-4" />
              <span className="hidden md:inline">Calendário</span>
            </button>
          </div>
          
          <button
            onClick={handleExportToExcel}
            className="flex items-center gap-2 bg-white border border-gray-300 px-3 py-2 rounded-lg hover:bg-gray-50 transition-colors"
            title="Exportar para Excel"
          >
            <Download className="w-4 h-4 text-gray-600" />
            <span className="hidden md:inline">Exportar</span>
          </button>
          
          <button
            onClick={handlePrint}
            className="flex items-center gap-2 bg-white border border-gray-300 px-3 py-2 rounded-lg hover:bg-gray-50 transition-colors"
            title="Imprimir"
          >
            <Printer className="w-4 h-4 text-gray-600" />
            <span className="hidden md:inline">Imprimir</span>
          </button>
          
          <button
            onClick={handleCreateOrder}
            className="flex items-center gap-2 bg-gradient-to-r from-blue-600 to-blue-700 text-white px-4 py-2 rounded-lg hover:from-blue-700 hover:to-blue-800 transition-all shadow-md"
            title="Novo Pedido"
          >
            <Plus className="w-4 h-4" />
            <span>Novo Pedido</span>
          </button>
        </div>
      </div>

      {/* Dashboard (condicional) */}
      {showDashboard && <OrdersDashboard />}

      {/* Filtros Avançados */}
      <div className={`bg-white rounded-lg shadow-sm border border-gray-200 transition-all duration-300 print:hidden ${
        showFilters ? 'block' : 'hidden'
      }`}>
        <div className="p-4 border-b border-gray-200">
          <h3 className="text-lg font-semibold flex items-center">
            <Filter className="w-5 h-5 mr-2 text-purple-600" />
            Filtros Avançados
          </h3>
        </div>
        
        <div className="p-4 space-y-4">
          <div className="w-full">
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Busca Geral
            </label>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
              <input
                type="text"
                placeholder="Buscar por número, cliente, projeto ou OS..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-colors"
              />
            </div>
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Status</label>
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value as 'all' | OrderStatus)}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-colors"
              >
                <option value="all">Todos os status</option>
                <option value="in-progress">Em Processo</option>
                <option value="completed">Concluído</option>
                <option value="on-hold">Em Pausa</option>
                <option value="cancelled">Cancelado</option>
                <option value="shipped">Expedido</option>
                <option value="delayed">Atrasado</option>
              </select>
            </div>
            
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Cliente</label>
              <select
                value={clientFilter}
                onChange={(e) => setClientFilter(e.target.value)}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-colors"
              >
                <option value="all">Todos os clientes</option>
                {clientOptions.slice(1).map((client, index) => (
                  <option key={index} value={client}>
                    {client}
                  </option>
                ))}
              </select>
            </div>
            
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Período</label>
              <select
                value={dateFilter}
                onChange={(e) => setDateFilter(e.target.value)}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-colors"
              >
                {dateOptions.map(option => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </div>
            
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Prioridade</label>
              <select
                value={priorityFilter}
                onChange={(e) => setPriorityFilter(e.target.value)}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-colors"
              >
                <option value="all">Todas as prioridades</option>
                <option value="urgent">Urgente</option>
                <option value="high">Alta</option>
                <option value="medium">Média</option>
                <option value="low">Baixa</option>
              </select>
            </div>
          </div>
          
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Urgência de Entrega
            </label>
            <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-8 gap-2">
              {urgencyOptions.map(option => (
                <button
                  key={option.value}
                  onClick={() => setDeliveryUrgencyFilter(option.value)}
                  className={`px-3 py-2 text-sm rounded-lg border transition-all ${
                    deliveryUrgencyFilter === option.value
                      ? `${option.color} border-current`
                      : 'bg-white text-gray-600 border-gray-300 hover:bg-gray-50'
                  }`}
                >
                  {option.label}
                </button>
              ))}
            </div>
          </div>
          
          <div className="flex flex-wrap gap-2 pt-4 border-t border-gray-200">
            <button
              onClick={() => {
                setSearchTerm('');
                setStatusFilter('all');
                setClientFilter('all');
                setDateFilter('all');
                setPriorityFilter('all');
                setDeliveryUrgencyFilter('all');
              }}
              className="flex items-center gap-2 bg-gray-100 text-gray-700 px-3 py-2 rounded-lg hover:bg-gray-200 transition-colors"
            >
              <RefreshCw className="w-4 h-4" />
              Limpar Filtros
            </button>
            
            <button
              onClick={() => setDeliveryUrgencyFilter('overdue')}
              className="flex items-center gap-2 bg-red-100 text-red-700 px-3 py-2 rounded-lg hover:bg-red-200 transition-colors"
            >
              <AlertTriangle className="w-4 h-4" />
              Ver Atrasados
            </button>
            
            <button
              onClick={() => setDeliveryUrgencyFilter('today')}
              className="flex items-center gap-2 bg-orange-100 text-orange-700 px-3 py-2 rounded-lg hover:bg-orange-200 transition-colors"
            >
              <Clock className="w-4 h-4" />
              Entrega Hoje
            </button>
            
            <button
              onClick={() => setDeliveryUrgencyFilter('critical')}
              className="flex items-center gap-2 bg-pink-100 text-pink-700 px-3 py-2 rounded-lg hover:bg-pink-200 transition-colors"
            >
              <Zap className="w-4 h-4" />
              Críticos
            </button>
          </div>
        </div>
      </div>

      {/* Filtros Rápidos */}
      <div className={`bg-white p-3 rounded-lg shadow-sm border border-gray-200 print:hidden ${
        showFilters ? 'lg:hidden' : ''
      }`}>
        <div className="flex flex-wrap gap-2">
          <div className="flex-1 min-w-[200px]">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
              <input
                type="text"
                placeholder="Buscar pedidos..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-sm"
              />
            </div>
          </div>
          
          <select
            value={deliveryUrgencyFilter}
            onChange={(e) => setDeliveryUrgencyFilter(e.target.value)}
            className="border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-sm"
          >
            <option value="all">Todas urgências</option>
            <option value="overdue">Atrasados</option>
            <option value="today">Hoje</option>
            <option value="critical">Críticos</option>
          </select>
          
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as 'all' | OrderStatus)}
            className="border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-sm"
          >
            <option value="all">Todos status</option>
            <option value="in-progress">Em Processo</option>
            <option value="completed">Concluído</option>
          </select>
        </div>
      </div>

      {/* Mensagem de erro */}
      {error && (
        <ErrorBoundary 
          error={error}
          onRetry={handleRetryConnection}
          onClear={clearError}
        />
      )}

      {/* Conteúdo Principal */}
      {viewMode === 'calendar' ? (
        <CalendarView />
      ) : (
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 print:shadow-none print:border-none">
          {loading ? (
            <LoadingSpinner orders={orders} />
          ) : processedOrders.length === 0 ? (
            <div className="text-center py-16 print:hidden">
              <Package className="w-20 h-20 text-gray-400 mx-auto mb-4" />
              <h3 className="text-xl font-medium text-gray-900 mb-2">
                {searchTerm || statusFilter !== 'all' || clientFilter !== 'all' || dateFilter !== 'all' 
                  ? 'Nenhum pedido encontrado' 
                  : 'Nenhum pedido cadastrado'}
              </h3>
              <p className="text-gray-500 mb-8 max-w-md mx-auto">
                {searchTerm || statusFilter !== 'all' || clientFilter !== 'all' || dateFilter !== 'all' 
                  ? 'Tente ajustar os filtros de busca ou criar um novo pedido'
                  : 'Comece criando seu primeiro pedido para dar início ao controle de produção'
                }
              </p>
              <button
                onClick={handleCreateOrder}
                className="flex items-center gap-2 bg-gradient-to-r from-blue-600 to-blue-700 text-white px-6 py-3 rounded-lg hover:from-blue-700 hover:to-blue-800 transition-all mx-auto shadow-md"
              >
                <Plus className="w-5 h-5" />
                {searchTerm || statusFilter !== 'all' || clientFilter !== 'all' || dateFilter !== 'all' 
                  ? 'Criar Novo Pedido' 
                  : 'Criar Primeiro Pedido'}
              </button>
            </div>
          ) : (
            <div>
              {/* Header da tabela com controles */}
              <div className="p-4 border-b border-gray-200 print:hidden">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                  <div className="flex items-center gap-4">
                    <h3 className="text-lg font-semibold text-gray-900">
                      {processedOrders.length} pedido(s) encontrado(s)
                    </h3>
                    <div className="flex items-center gap-2 text-sm">
                      <span className="text-gray-500">Itens por página:</span>
                      <select
                        value={itemsPerPage}
                        onChange={(e) => {
                          setItemsPerPage(Number(e.target.value));
                          setCurrentPage(1);
                        }}
                        className="border border-gray-300 rounded px-2 py-1 text-sm"
                      >
                        {ITEMS_PER_PAGE_OPTIONS.map(option => (
                          <option key={option} value={option}>{option}</option>
                        ))}
                      </select>
                    </div>
                  </div>
                  
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => setCompactView(!compactView)}
                      className={`flex items-center gap-2 px-3 py-1 rounded text-sm transition-colors ${
                        compactView 
                          ? 'bg-blue-100 text-blue-700' 
                          : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                      }`}
                    >
                      <Grid3X3 className="w-4 h-4" />
                      Vista Compacta
                    </button>
                  </div>
                </div>
              </div>

              {/* Tabela de pedidos */}
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead className="bg-gray-50 border-b border-gray-200 print:bg-white">
                    <tr>
                      <th className="text-left py-3 px-4 font-medium text-gray-700 cursor-pointer hover:bg-gray-100 transition-colors" 
                          onClick={() => handleSort('orderNumber')}>
                        <div className="flex items-center gap-1">
                          Pedido
                          {sortField === 'orderNumber' && (
                            <ArrowUpDown className={`w-4 h-4 transition-transform ${sortOrder === 'desc' ? 'rotate-180' : ''}`} />
                          )}
                        </div>
                      </th>
                      <th className="text-left py-3 px-4 font-medium text-gray-700 cursor-pointer hover:bg-gray-100 transition-colors" 
                          onClick={() => handleSort('customer')}>
                        <div className="flex items-center gap-1">
                          Cliente
                          {sortField === 'customer' && (
                            <ArrowUpDown className={`w-4 h-4 transition-transform ${sortOrder === 'desc' ? 'rotate-180' : ''}`} />
                          )}
                        </div>
                      </th>
                      {!compactView && (
                        <th className="text-left py-3 px-4 font-medium text-gray-700">
                          OS Interna
                        </th>
                      )}
                      <th className="text-left py-3 px-4 font-medium text-gray-700 cursor-pointer hover:bg-gray-100 transition-colors" 
                          onClick={() => handleSort('deliveryDate')}>
                        <div className="flex items-center gap-1">
                          <Target className="w-4 h-4 text-blue-600" />
                          Entrega
                          {sortField === 'deliveryDate' && (
                            <ArrowUpDown className={`w-4 h-4 transition-transform ${sortOrder === 'desc' ? 'rotate-180' : ''}`} />
                          )}
                        </div>
                      </th>
                      <th className="text-left py-3 px-4 font-medium text-gray-700">
                        Status
                      </th>
                      {!compactView && (
                        <>
                          <th className="text-left py-3 px-4 font-medium text-gray-700">
                            Prioridade
                          </th>
                          <th className="text-left py-3 px-4 font-medium text-gray-700">
                            <div className="flex items-center gap-1">
                              <Package className="w-4 h-4 text-purple-600" />
                              Peso (kg)
                            </div>
                          </th>
                        </>
                      )}
                      <th className="text-right py-3 px-4 font-medium text-gray-700 print:hidden">Ações</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200">
                    {paginatedOrders.map((order) => {
                      if (!order) return null;
                      
                      const orderNumber = safeField(order, ['orderNumber', 'id']);
                      const customer = safeField(order, ['customerName', 'customer']);
                      const project = safeField(order, ['project', 'projectName']);
                      const internalOS = safeField(order, ['internalOS', 'internalOrderNumber', 'serviceOrder']);
                      const statusText = getStatusText(order.status);
                      const statusColorClass = getStatusColor(order.status);
                      const urgency = getDeliveryUrgency(order);
                      const urgencyColor = getUrgencyColor(urgency);
                      const urgencyText = getUrgencyText(urgency);
                      const priorityColor = getPriorityColor(order.priority);
                      const isLate = urgency === 'overdue';
                      const orderWeight = calculateOrderWeight(order);
                      
                      return (
                        <tr key={order.id} className="hover:bg-gray-50 transition-colors group">
                          <td className={`py-3 px-4 ${compactView ? 'py-2' : ''}`}>
                            <div className="flex flex-col">
                              <div className="font-medium text-gray-900">
                                #{orderNumber}
                              </div>
                              {project && !compactView && (
                                <div className="text-sm text-gray-500 mt-1">{project}</div>
                              )}
                              {compactView && internalOS && (
                                <div className="text-xs text-gray-400 mt-1">OS: {internalOS}</div>
                              )}
                              {compactView && orderWeight > 0 && (
                                <div className="text-xs text-purple-600 mt-1">
                                  {orderWeight.toLocaleString('pt-BR', {maximumFractionDigits: 1})} kg
                                </div>
                              )}
                            </div>
                          </td>
                          
                          <td className={`py-3 px-4 ${compactView ? 'py-2' : ''}`}>
                            <div className="flex items-center">
                              <User className="w-4 h-4 text-gray-400 mr-2 flex-shrink-0" />
                              <span className="text-gray-900 truncate">{customer || '-'}</span>
                            </div>
                          </td>
                          
                          {!compactView && (
                            <td className="py-3 px-4">
                              <span className="text-gray-600">{internalOS || '-'}</span>
                            </td>
                          )}
                          
                          <td className={`py-3 px-4 ${compactView ? 'py-2' : ''}`}>
                            <div className="flex flex-col gap-1">
                              <div className="flex items-center">
                                <Calendar className={`w-4 h-4 mr-2 flex-shrink-0 ${
                                  isLate ? 'text-red-500' : 'text-gray-400'
                                }`} />
                                <span className={`text-sm ${isLate ? 'text-red-600 font-medium' : 'text-gray-600'}`}>
                                  {formatRelativeDate(order.deliveryDate)}
                                </span>
                              </div>
                              <span className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium border ${urgencyColor}`}>
                                {urgencyText}
                              </span>
                            </div>
                          </td>
                          
                          <td className={`py-3 px-4 ${compactView ? 'py-2' : ''}`}>
                            <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium border ${statusColorClass}`}>
                              {statusText}
                            </span>
                          </td>
                          
                          {!compactView && (
                            <>
                              <td className="py-3 px-4">
                                <span className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium border ${priorityColor}`}>
                                  {order.priority || 'Média'}
                                </span>
                              </td>
                              <td className="py-3 px-4">
                                <div className="flex items-center">
                                  <Package className="w-4 h-4 text-purple-500 mr-2 flex-shrink-0" />
                                  <span className="text-sm font-medium text-purple-700">
                                    {orderWeight.toLocaleString('pt-BR', {maximumFractionDigits: 1})}
                                  </span>
                                </div>
                                {order.items && order.items.length > 0 && (
                                  <div className="text-xs text-gray-500 mt-1">
                                    {order.items.length} {order.items.length === 1 ? 'item' : 'itens'}
                                  </div>
                                )}
                              </td>
                            </>
                          )}
                          
                          <td className={`py-3 px-4 print:hidden ${compactView ? 'py-2' : ''}`}>
                            <div className="flex items-center justify-end gap-1">
                              <button
                                onClick={() => handleViewOrder(order)}
                                className="p-1.5 text-gray-400 hover:text-blue-600 transition-colors rounded-lg hover:bg-blue-50"
                                title="Visualizar"
                              >
                                <Eye className="w-4 h-4" />
                              </button>
                              
                              <button
                                onClick={() => handleEditOrder(order)}
                                className="p-1.5 text-gray-400 hover:text-green-600 transition-colors rounded-lg hover:bg-green-50"
                                title="Editar"
                              >
                                <Edit className="w-4 h-4" />
                              </button>
                              
                              <div className="relative">
                                <button
                                  onClick={() => toggleDropdown(order.id)}
                                  className="p-1.5 text-gray-400 hover:text-gray-600 transition-colors rounded-lg hover:bg-gray-50"
                                  title="Mais ações"
                                >
                                  <MoreHorizontal className="w-4 h-4" />
                                </button>
                                
                                {activeDropdown === order.id && (
                                  <div className="absolute right-0 z-20 mt-2 w-56 bg-white rounded-lg shadow-lg ring-1 ring-black ring-opacity-5 border border-gray-200" data-dropdown>
                                    <div className="py-1" role="menu">
                                      <button
                                        onClick={() => handleNavigateToReport(order.id)}
                                        className="text-left block px-4 py-2 text-sm text-gray-700 hover:bg-gray-50 w-full transition-colors"
                                        title="Relatório de Produção"
                                      >
                                        <span className="flex items-center">
                                          <FileText className="w-4 h-4 mr-3 text-blue-500" />
                                          Relatório de Produção
                                        </span>
                                      </button>
                                      
                                      <button
                                        onClick={() => handleOpenPublicSchedule(order.id)}
                                        className="text-left block px-4 py-2 text-sm text-gray-700 hover:bg-gray-50 w-full transition-colors"
                                        title="Cronograma Público"
                                      >
                                        <span className="flex items-center">
                                          <CalendarDays className="w-4 h-4 mr-3 text-purple-500" />
                                          Cronograma Público
                                        </span>
                                      </button>
                                      
                                      <button
                                        onClick={() => handleCopyPublicLink(order.id)}
                                        className="text-left block px-4 py-2 text-sm text-gray-700 hover:bg-gray-50 w-full transition-colors"
                                        title="Copiar Link Público"
                                      >
                                        <span className="flex items-center">
                                          <MapPin className="w-4 h-4 mr-3 text-green-500" />
                                          Copiar Link Público
                                        </span>
                                      </button>
                                      
                                      <div className="border-t border-gray-100 my-1"></div>
                                      
                                      <button
                                        onClick={() => {
                                          handleDeleteOrder(order);
                                          setActiveDropdown(null);
                                        }}
                                        className="text-left block px-4 py-2 text-sm text-red-600 hover:bg-red-50 w-full transition-colors"
                                        title="Deletar"
                                      >
                                        <span className="flex items-center">
                                          <Trash2 className="w-4 h-4 mr-3" />
                                          Deletar Pedido
                                        </span>
                                      </button>
                                    </div>
                                  </div>
                                )}
                              </div>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              
              {/* Paginação */}
              {totalPages > 1 && (
                <div className="flex items-center justify-between border-t border-gray-200 bg-gray-50 px-4 py-3 sm:px-6 print:hidden">
                  <div className="flex flex-1 justify-between sm:hidden">
                    <button
                      onClick={() => setCurrentPage(prev => Math.max(prev - 1, 1))}
                      disabled={currentPage === 1}
                      className={`relative inline-flex items-center rounded-md px-4 py-2 text-sm font-medium transition-colors ${
                        currentPage === 1
                          ? 'bg-gray-100 text-gray-400 cursor-not-allowed'
                          : 'bg-white text-gray-700 hover:bg-gray-50 border border-gray-300'
                      }`}
                    >
                      <ChevronLeft className="w-4 h-4 mr-1" />
                      Anterior
                    </button>
                    <button
                      onClick={() => setCurrentPage(prev => Math.min(prev + 1, totalPages))}
                      disabled={currentPage === totalPages}
                      className={`relative ml-3 inline-flex items-center rounded-md px-4 py-2 text-sm font-medium transition-colors ${
                        currentPage === totalPages
                          ? 'bg-gray-100 text-gray-400 cursor-not-allowed'
                          : 'bg-white text-gray-700 hover:bg-gray-50 border border-gray-300'
                      }`}
                    >
                      Próximo
                      <ChevronRight className="w-4 h-4 ml-1" />
                    </button>
                  </div>
                  
                  <div className="hidden sm:flex sm:flex-1 sm:items-center sm:justify-between">
                    <div>
                      <p className="text-sm text-gray-700">
                        Mostrando <span className="font-medium">{Math.min((currentPage - 1) * itemsPerPage + 1, processedOrders.length)}</span> a{' '}
                        <span className="font-medium">{Math.min(currentPage * itemsPerPage, processedOrders.length)}</span> de{' '}
                        <span className="font-medium">{processedOrders.length}</span> resultados
                      </p>
                    </div>
                    
                    <div>
                      <nav className="isolate inline-flex -space-x-px rounded-md shadow-sm" aria-label="Pagination">
                        <button
                          onClick={() => setCurrentPage(prev => Math.max(prev - 1, 1))}
                          disabled={currentPage === 1}
                          className={`relative inline-flex items-center rounded-l-md px-2 py-2 transition-colors ${
                            currentPage === 1
                              ? 'bg-gray-100 text-gray-400 cursor-not-allowed'
                              : 'bg-white text-gray-500 hover:bg-gray-50 border border-gray-300'
                          }`}
                        >
                          <span className="sr-only">Anterior</span>
                          <ChevronLeft className="h-5 w-5" aria-hidden="true" />
                        </button>
                        
                        {Array.from({ length: totalPages }, (_, i) => i + 1)
                          .filter(page => 
                            page === 1 || 
                            page === totalPages || 
                            Math.abs(page - currentPage) <= 1
                          )
                          .map((page, index, array) => {
                            if (index > 0 && page > array[index - 1] + 1) {
                              return (
                                <React.Fragment key={`ellipsis-${page}`}>
                                  <span className="relative inline-flex items-center px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300">
                                    ...
                                  </span>
                                  <button
                                    onClick={() => setCurrentPage(page)}
                                    className={`relative inline-flex items-center px-4 py-2 text-sm font-medium transition-colors ${
                                      currentPage === page
                                        ? 'bg-blue-50 text-blue-700 border-blue-500 z-10'
                                        : 'bg-white text-gray-500 hover:bg-gray-50 border border-gray-300'
                                    }`}
                                  >
                                    {page}
                                  </button>
                                </React.Fragment>
                              );
                            }
                            
                            return (
                              <button
                                key={page}
                                onClick={() => setCurrentPage(page)}
                                className={`relative inline-flex items-center px-4 py-2 text-sm font-medium transition-colors ${
                                  currentPage === page
                                    ? 'bg-blue-50 text-blue-700 border-blue-500 z-10'
                                    : 'bg-white text-gray-500 hover:bg-gray-50 border border-gray-300'
                                }`}
                              >
                                {page}
                              </button>
                            );
                          })}
                        
                        <button
                          onClick={() => setCurrentPage(prev => Math.min(prev + 1, totalPages))}
                          disabled={currentPage === totalPages}
                          className={`relative inline-flex items-center rounded-r-md px-2 py-2 transition-colors ${
                            currentPage === totalPages
                              ? 'bg-gray-100 text-gray-400 cursor-not-allowed'
                              : 'bg-white text-gray-500 hover:bg-gray-50 border border-gray-300'
                          }`}
                        >
                          <span className="sr-only">Próximo</span>
                          <ChevronRight className="h-5 w-5" aria-hidden="true" />
                        </button>
                      </nav>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Estatísticas de resumo */}
      {processedOrders.length > 0 && viewMode === 'table' && (
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 print:hidden">
          <div className="p-4">
            <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4 text-center">
              <div className="flex flex-col">
                <span className="text-2xl font-bold text-blue-600">
                  {processedOrders.filter(o => o.status === 'in-progress').length}
                </span>
                <span className="text-sm text-gray-600">Em Processo</span>
              </div>
              
              <div className="flex flex-col">
                <span className="text-2xl font-bold text-green-600">
                  {processedOrders.filter(o => o.status === 'completed').length}
                </span>
                <span className="text-sm text-gray-600">Concluídos</span>
              </div>
              
              <div className="flex flex-col">
                <span className="text-2xl font-bold text-red-600">
                  {processedOrders.filter(order => getDeliveryUrgency(order) === 'overdue').length}
                </span>
                <span className="text-sm text-gray-600">Atrasados</span>
              </div>
              
              <div className="flex flex-col">
                <span className="text-2xl font-bold text-orange-600">
                  {processedOrders.filter(order => ['today', 'tomorrow'].includes(getDeliveryUrgency(order))).length}
                </span>
                <span className="text-sm text-gray-600">Urgentes</span>
              </div>
              
              <div className="flex flex-col">
                <span className="text-2xl font-bold text-purple-600">
                  {processedOrders.reduce((sum, order) => sum + calculateOrderWeight(order), 0).toLocaleString('pt-BR', {maximumFractionDigits: 0})}
                </span>
                <span className="text-sm text-gray-600">kg Total</span>
              </div>
              
              <div className="flex flex-col">
                <span className="text-2xl font-bold text-gray-600">
                  {processedOrders.length}
                </span>
                <span className="text-sm text-gray-600">Total</span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Modal */}
      <OrderModal
        isOpen={isModalOpen}
        onClose={handleModalClose}
        order={selectedOrder}
        mode={modalMode}
      />
    </div>
  );
}import React, { useState, useEffect, useMemo } from 'react';
import { 
  Search, 
  Filter, 
  Plus, 
  Edit, 
  Trash2, 
  Calendar, 
  User, 
  Package, 
  MoreHorizontal,
  FileText,
  Clock,
  CheckCircle,
  AlertCircle,
  Download,
  ArrowUpDown,
  ChevronLeft,
  ChevronRight,
  BarChart2,
  Printer,
  CalendarDays,
  AlertTriangle,
  Target,
  Activity,
  Timer,
  Eye,
  RefreshCw,
  Zap,
  Bell,
  MapPin,
  ListFilter,
  Grid3X3,
  Layers
} from 'lucide-react';
import { useOrderStore } from '../store/orderStore';
import { useAuthStore } from '../store/authStore';
import { format, differenceInDays, isToday, isTomorrow, isYesterday, isThisWeek, isThisMonth, parseISO, startOfDay } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import OrderModal from './OrderModal';
import { useNavigate } from 'react-router-dom';

// ============================================================================
// CONSTANTES
// ============================================================================

const ITEMS_PER_PAGE_OPTIONS = [10, 15, 25, 50];

const URGENCY_COLORS = {
  'overdue': 'bg-red-100 text-red-800 border-red-200',
  'today': 'bg-orange-100 text-orange-800 border-orange-200',
  'tomorrow': 'bg-yellow-100 text-yellow-800 border-yellow-200',
  'critical': 'bg-pink-100 text-pink-800 border-pink-200',
  'urgent': 'bg-purple-100 text-purple-800 border-purple-200',
  'soon': 'bg-blue-100 text-blue-800 border-blue-200',
  'normal': 'bg-green-100 text-green-800 border-green-200',
  'completed': 'bg-gray-100 text-gray-800 border-gray-200',
  'unknown': 'bg-gray-100 text-gray-800 border-gray-200'
};

const URGENCY_TEXTS = {
  'overdue': 'Atrasado',
  'today': 'Entrega Hoje',
  'tomorrow': 'Entrega Amanhã',
  'critical': '≤ 3 dias',
  'urgent': '≤ 7 dias',
  'soon': '≤ 14 dias',
  'normal': '> 14 dias',
  'completed': 'Concluído',
  'unknown': 'Data inválida'
};

const STATUS_COLORS = {
  'completed': 'bg-green-100 text-green-800 border-green-200',
  'in-progress': 'bg-blue-100 text-blue-800 border-blue-200',
  'on-hold': 'bg-yellow-100 text-yellow-800 border-yellow-200',
  'cancelled': 'bg-red-100 text-red-800 border-red-200',
  'shipped': 'bg-purple-100 text-purple-800 border-purple-200',
  'delayed': 'bg-orange-100 text-orange-800 border-orange-200'
};

const STATUS_TEXTS = {
  'in-progress': 'Em Processo',
  'completed': 'Concluído',
  'on-hold': 'Em Pausa',
  'cancelled': 'Cancelado',
  'shipped': 'Expedido',
  'delayed': 'Atrasado'
};

const PRIORITY_COLORS = {
  'urgent': 'bg-red-100 text-red-800 border-red-200',
  'high': 'bg-orange-100 text-orange-800 border-orange-200',
  'medium': 'bg-yellow-100 text-yellow-800 border-yellow-200',
  'low': 'bg-green-100 text-green-800 border-green-200'
};

// ============================================================================
// TIPOS E INTERFACES
// ============================================================================

type OrderStatus = 'in-progress' | 'completed' | 'on-hold' | 'cancelled' | 'delayed' | 'shipped' | string;
type SortField = 'orderNumber' | 'customer' | 'internalOS' | 'startDate' | 'deliveryDate' | 'status' | 'priority' | 'value';
type SortOrder = 'asc' | 'desc';
type ViewMode = 'table' | 'calendar';

interface OrderItem {
  id: string;
  code: string;
  description: string;
  quantity: number;
  unit: string;
  weight: number;
  progress: number;
  overallProgress?: number;
  itemNumber?: number;
  notes?: string;
  priority?: 'low' | 'medium' | 'high' | 'urgent';
  estimatedDays?: number;
  startDate?: string;
  endDate?: string;
  responsible?: string;
}

interface Order {
  id: string;
  customerId?: string;
  customerName?: string;
  customer?: string;
  project?: string;
  projectName?: string;
  orderNumber?: string;
  internalOS?: string;
  internalOrderNumber?: string;
  serviceOrder?: string;
  startDate?: string;
  deliveryDate?: string;
  completionDate?: string;
  status?: OrderStatus;
  observations?: string;
  items?: OrderItem[];
  createdAt?: string;
  updatedAt?: string;
  priority?: 'low' | 'medium' | 'high' | 'urgent';
  value?: number;
  googleDriveLink?: string;
  [key: string]: any;
}

// ============================================================================
// FUNÇÕES UTILITÁRIAS
// ============================================================================

const calculateOrderWeight = (order: Order): number => {
  if (!order.items || !Array.isArray(order.items)) {
    console.debug(`Order ${order.id} has no valid items array`);
    return 0;
  }
  
  return order.items.reduce((total, item) => {
    const weight = typeof item.weight === 'number' && !isNaN(item.weight) && isFinite(item.weight) 
      ? item.weight 
      : 0;
    const quantity = typeof item.quantity === 'number' && !isNaN(item.quantity) && isFinite(item.quantity) 
      ? item.quantity 
      : 1;
    
    const itemTotal = weight * quantity;
    
    if (item.weight && (weight === 0 || quantity === 1)) {
      console.debug(`Weight issue for item ${item.id}:`, {
        originalWeight: item.weight,
        originalQuantity: item.quantity,
        processedWeight: weight,
        processedQuantity: quantity
      });
    }
    
    return total + itemTotal;
  }, 0);
};

const calculateProductionStats = (orders: Order[]) => {
  let totalProductionDays = 0;
  let completedOrdersWithDates = 0;
  
  orders.forEach(order => {
    if (order.status === 'completed' && order.startDate && order.completionDate) {
      try {
        const startDate = parseISO(order.startDate);
        const completionDate = parseISO(order.completionDate);
        const days = Math.ceil((completionDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24));
        if (days > 0) {
          totalProductionDays += days;
          completedOrdersWithDates++;
        }
      } catch (error) {
        console.warn(`Invalid dates for order ${order.id}:`, error);
      }
    }
  });
  
  return {
    averageProductionDays: completedOrdersWithDates > 0 
      ? Math.round(totalProductionDays / completedOrdersWithDates) 
      : 0,
    completedOrdersCount: completedOrdersWithDates
  };
};

const isValidDate = (dateString: string | undefined | null): boolean => {
  if (!dateString) return false;
  try {
    const date = parseISO(dateString);
    return date instanceof Date && !isNaN(date.getTime());
  } catch {
    return false;
  }
};

const getDeliveryUrgency = (order: Order): string => {
  if (!order.deliveryDate || order.status === 'completed' || order.status === 'cancelled') return 'completed';
  
  try {
    const deliveryDate = parseISO(order.deliveryDate);
    const today = startOfDay(new Date());
    const daysUntilDelivery = differenceInDays(deliveryDate, today);
    
    if (daysUntilDelivery < 0) return 'overdue';
    if (daysUntilDelivery === 0) return 'today';
    if (daysUntilDelivery === 1) return 'tomorrow';
    if (daysUntilDelivery <= 3) return 'critical';
    if (daysUntilDelivery <= 7) return 'urgent';
    if (daysUntilDelivery <= 14) return 'soon';
    return 'normal';
  } catch {
    return 'unknown';
  }
};

const getUrgencyColor = (urgency: string): string => {
  return URGENCY_COLORS[urgency] || URGENCY_COLORS['unknown'];
};

const getUrgencyText = (urgency: string): string => {
  return URGENCY_TEXTS[urgency] || URGENCY_TEXTS['unknown'];
};

const getStatusText = (status: string | undefined): string => {
  if (!status) return 'Desconhecido';
  return STATUS_TEXTS[status.toLowerCase()] || status;
};

const getStatusColor = (status: string | undefined): string => {
  if (!status) return 'bg-gray-100 text-gray-800';
  const normalizedStatus = status.toLowerCase();
  return STATUS_COLORS[normalizedStatus] || 'bg-gray-100 text-gray-800 border-gray-200';
};

const getPriorityColor = (priority: string | undefined): string => {
  return PRIORITY_COLORS[priority || 'medium'] || PRIORITY_COLORS.medium;
};

const safeField = (order: Order, fields: string[]): string => {
  for (const field of fields) {
    if (order[field] && typeof order[field] === 'string') {
      return order[field] as string;
    }
  }
  return '';
};

const formatDate = (dateString: string | undefined | null): string => {
  if (!dateString) return '-';
  try {
    return format(parseISO(dateString), 'dd/MM/yyyy', { locale: ptBR });
  } catch (error) {
    console.error("Error formatting date:", dateString, error);
    return '-';
  }
};

const formatRelativeDate = (dateString: string | undefined | null): string => {
  if (!dateString || !isValidDate(dateString)) return '-';
  try {
    const date = parseISO(dateString);
    if (isToday(date)) return 'Hoje';
    if (isTomorrow(date)) return 'Amanhã';
    if (isYesterday(date)) return 'Ontem';
    return format(date, 'dd/MM', { locale: ptBR });
  } catch (error) {
    return formatDate(dateString);
  }
};

const isDateInFilter = (dateStr: string | undefined, filter: string): boolean => {
  if (!dateStr || filter === 'all') return true;
  
  try {
    const date = parseISO(dateStr);
    const today = new Date();
    
    if (filter === 'today') return isToday(date);
    if (filter === 'tomorrow') return isTomorrow(date);
    if (filter === 'week') return isThisWeek(date, { weekStartsOn: 0 });
    if (filter === 'month') return isThisMonth(date);
    if (filter === 'overdue') return date < startOfDay(today);
    
    return true;
  } catch (e) {
    console.error("Error checking date filter:", e);
    return true;
  }
};

// ============================================================================
// COMPONENTES AUXILIARES
// ============================================================================

const ErrorBoundary: React.FC<{ error: string | null; onRetry: () => void; onClear: () => void }> = ({ 
  error, 
  onRetry, 
  onClear 
}) => {
  if (!error) return null;

  const isConnectionError = error.includes('QUIC') || 
                           error.includes('network') || 
                           error.includes('unavailable') ||
                           error.includes('fetch');

  return (
    <div className={`rounded-lg p-4 print:hidden ${
      isConnectionError 
        ? 'bg-yellow-50 border border-yellow-200' 
        : 'bg-red-50 border border-red-200'
    }`}>
      <div className="flex items-start">
        <AlertCircle className={`mr-3 w-5 h-5 flex-shrink-0 ${
          isConnectionError ? 'text-yellow-400' : 'text-red-400'
        }`} />
        <div className="flex-1">
          <h3 className={`text-sm font-medium ${
            isConnectionError ? 'text-yellow-800' : 'text-red-800'
          }`}>
            {isConnectionError ? 'Problema de Conexão' : 'Erro no Sistema'}
          </h3>
          <p className={`text-sm mt-1 ${
            isConnectionError ? 'text-yellow-700' : 'text-red-700'
          }`}>
            {isConnectionError 
              ? 'Verifique sua conexão com a internet e tente novamente.'
              : error
            }
          </p>
          {isConnectionError && (
            <p className="text-xs text-yellow-600 mt-2">
              💡 Os dados podem estar desatualizados. O sistema tentará reconectar automaticamente.
            </p>
          )}
        </div>
        <div className="flex gap-2 ml-4">
          {isConnectionError && (
            <button 
              onClick={onRetry}
              className="text-sm underline transition-colors text-yellow-600 hover:text-yellow-800"
            >
              Tentar novamente
            </button>
          )}
          <button 
            onClick={onClear}
            className={`ml-2 transition-colors ${
              isConnectionError 
                ? 'text-yellow-400 hover:text-yellow-600' 
                : 'text-red-400 hover:text-red-600'
            }`}
          >
            ✕
          </button>
        </div>
      </div>
    </div>
  );
};

const LoadingSpinner: React.FC<{ orders?: Order[] }> = ({ orders = [] }) => (
  <div className="flex items-center justify-center p-12 print:hidden">
    <div className="flex flex-col items-center">
      <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-blue-600 mb-4"></div>
      <span className="text-gray-600 text-lg">Carregando pedidos...</span>
      <span className="text-gray-400 text-sm mt-2">
        {orders.length > 0 ? `${orders.length} pedidos carregados` : 'Conectando ao servidor...'}
      </span>
    </div>
  </div>
);

// ============================================================================
// COMPONENTE PRINCIPAL
// ============================================================================

export default function Orders() {
  const navigate = useNavigate();
  
  const { 
    orders, 
    loading, 
    error, 
    fetchOrders, 
    deleteOrder, 
    setSelectedOrder,
    subscribeToOrders,
    clearError,
    retryConnection
  } = useOrderStore();
  
  const { user } = useAuthStore();
  
  // Estados para pesquisa e filtros
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | OrderStatus>('all');
  const [clientFilter, setClientFilter] = useState<string>('all');
  const [dateFilter, setDateFilter] = useState<string>('all');
  const [priorityFilter, setPriorityFilter] = useState<string>('all');
  const [deliveryUrgencyFilter, setDeliveryUrgencyFilter] = useState<string>('all');
  
  // Estados para ordenação
  const [sortField, setSortField] = useState<SortField>('deliveryDate');
  const [sortOrder, setSortOrder] = useState<SortOrder>('asc');
  
  // Estados para paginação
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(15);
  
  // Estados para modal
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [modalMode, setModalMode] = useState<'create' | 'edit' | 'view'>('create');
  const [selectedOrder, setSelectedOrderState] = useState<Order | null>(null);
  
  // Estados para interface
  const [viewMode, setViewMode] = useState<ViewMode>('table');
  const [showDashboard, setShowDashboard] = useState(true);
  const [showFilters, setShowFilters] = useState(false);
  const [activeDropdown, setActiveDropdown] = useState<string | null>(null);
  const [compactView, setCompactView] = useState(false);

  // ============================================================================
  // EFFECTS
  // ============================================================================

  // Carregar pedidos ao montar o componente
  useEffect(() => {
    if (user) {
      console.log("Orders component: Loading orders");
      fetchOrders();
      
      const unsubscribe = subscribeToOrders();
      return () => {
        try {
          unsubscribe();
        } catch (error) {
          console.error("Error unsubscribing from orders:", error);
        }
      };
    }
  }, [user]);

  // Limpar erro quando componente desmonta
  useEffect(() => {
    return () => clearError();
  }, [clearError]);

  // Tratamento de clique fora do dropdown
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (activeDropdown && !(event.target as Element).closest('[data-dropdown]')) {
        setActiveDropdown(null);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [activeDropdown]);

  // ============================================================================
  // COMPUTED VALUES
  // ============================================================================

  // Opções para filtros
  const clientOptions = useMemo(() => {
    const clients = new Set<string>();
    orders.forEach(order => {
      if (order.customerName) clients.add(order.customerName);
      if (order.customer) clients.add(order.customer);
    });
    return ['all', ...Array.from(clients).sort()];
  }, [orders]);

  const dateOptions = useMemo(() => [
    { value: 'all', label: 'Todas as datas', icon: Calendar },
    { value: 'today', label: 'Hoje', icon: Clock },
    { value: 'tomorrow', label: 'Amanhã', icon: Timer },
    { value: 'week', label: 'Esta semana', icon: CalendarDays },
    { value: 'month', label: 'Este mês', icon: Calendar },
    { value: 'overdue', label: 'Atrasados', icon: AlertTriangle }
  ], []);

  const urgencyOptions = useMemo(() => [
    { value: 'all', label: 'Todas as urgências', color: 'bg-gray-100 text-gray-800' },
    { value: 'overdue', label: 'Atrasados', color: 'bg-red-100 text-red-800' },
    { value: 'today', label: 'Entrega Hoje', color: 'bg-orange-100 text-orange-800' },
    { value: 'tomorrow', label: 'Entrega Amanhã', color: 'bg-yellow-100 text-yellow-800' },
    { value: 'critical', label: 'Crítico (≤ 3 dias)', color: 'bg-pink-100 text-pink-800' },
    { value: 'urgent', label: 'Urgente (≤ 7 dias)', color: 'bg-purple-100 text-purple-800' },
    { value: 'soon', label: 'Em breve (≤ 14 dias)', color: 'bg-blue-100 text-blue-800' },
    { value: 'normal', label: 'Normal (> 14 dias)', color: 'bg-green-100 text-green-800' }
  ], []);

  // Filtrar e ordenar pedidos
  const processedOrders = useMemo(() => {
    return orders
      .filter(order => {
        if (!order) return false;
        
        const orderNumber = safeField(order, ['orderNumber', 'id']);
        const customer = safeField(order, ['customerName', 'customer']);
        const project = safeField(order, ['project', 'projectName']);
        const internalOS = safeField(order, ['internalOS', 'internalOrderNumber', 'serviceOrder']);
        
        const matchesSearch = searchTerm === '' || 
          orderNumber.toLowerCase().includes(searchTerm.toLowerCase()) ||
          customer.toLowerCase().includes(searchTerm.toLowerCase()) ||
          project.toLowerCase().includes(searchTerm.toLowerCase()) ||
          internalOS.toLowerCase().includes(searchTerm.toLowerCase());
        
        const matchesStatus = statusFilter === 'all' || order.status === statusFilter;
        const matchesClient = clientFilter === 'all' || customer === clientFilter;
        const matchesDate = isDateInFilter(order.startDate, dateFilter);
        const matchesPriority = priorityFilter === 'all' || order.priority === priorityFilter;
        
        const urgency = getDeliveryUrgency(order);
        const matchesUrgency = deliveryUrgencyFilter === 'all' || urgency === deliveryUrgencyFilter;
        
        return matchesSearch && matchesStatus && matchesClient && matchesDate && matchesPriority && matchesUrgency;
      })
      .sort((a, b) => {
        if (sortField === 'orderNumber') {
          const aValue = safeField(a, ['orderNumber', 'id']);
          const bValue = safeField(b, ['orderNumber', 'id']);
          return sortOrder === 'asc' ? aValue.localeCompare(bValue) : bValue.localeCompare(aValue);
        }
        
        if (sortField === 'customer') {
          const aValue = safeField(a, ['customerName', 'customer']);
          const bValue = safeField(b, ['customerName', 'customer']);
          return sortOrder === 'asc' ? aValue.localeCompare(bValue) : bValue.localeCompare(aValue);
        }
        
        if (sortField === 'deliveryDate') {
          const aValue = a.deliveryDate ? new Date(a.deliveryDate).getTime() : 0;
          const bValue = b.deliveryDate ? new Date(b.deliveryDate).getTime() : 0;
          return sortOrder === 'asc' ? aValue - bValue : bValue - aValue;
        }
        
        return 0;
      });
  }, [orders, searchTerm, statusFilter, clientFilter, dateFilter, priorityFilter, deliveryUrgencyFilter, sortField, sortOrder]);
  
  // Paginação
  const paginatedOrders = useMemo(() => {
    const startIndex = (currentPage - 1) * itemsPerPage;
    return processedOrders.slice(startIndex, startIndex + itemsPerPage);
  }, [processedOrders, currentPage, itemsPerPage]);
  
  const totalPages = useMemo(() => 
    Math.ceil(processedOrders.length / itemsPerPage),
    [processedOrders, itemsPerPage]
  );

  // ============================================================================
  // HANDLERS
  // ============================================================================

  const handleCreateOrder = () => {
    setSelectedOrderState(null);
    setSelectedOrder(null);
    setModalMode('create');
    setIsModalOpen(true);
  };

  const handleEditOrder = (order: Order) => {
    setSelectedOrderState(order);
    setSelectedOrder(order);
    setModalMode('edit');
    setIsModalOpen(true);
  };

  const handleViewOrder = (order: Order) => {
    setSelectedOrderState(order);
    setSelectedOrder(order);
    setModalMode('view');
    setIsModalOpen(true);
  };

  const handleDeleteOrder = async (order: Order) => {
    if (!order.id) {
      console.error('ID do pedido não encontrado');
      return;
    }

    const confirmDelete = window.confirm(
      `Tem certeza que deseja deletar o pedido #${order.orderNumber || order.id}?`
    );
    
    if (confirmDelete) {
      try {
        await deleteOrder(order.id);
      } catch (error) {
        console.error('Erro ao deletar pedido:', error);
      }
    }
  };

  const handleModalClose = () => {
    setIsModalOpen(false);
    setSelectedOrderState(null);
    setSelectedOrder(null);
    setActiveDropdown(null);
  };

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortOrder('asc');
    }
  };

  const toggleDropdown = (orderId: string) => {
    setActiveDropdown(activeDropdown === orderId ? null : orderId);
  };

  const handleExportToExcel = () => {
    try {
      const exportData = processedOrders.map(order => ({
        'Número do Pedido': safeField(order, ['orderNumber', 'id']),
        'Cliente': safeField(order, ['customerName', 'customer']),
        'Projeto': safeField(order, ['project', 'projectName']),
        'OS Interna': safeField(order, ['internalOS', 'internalOrderNumber', 'serviceOrder']),
        'Data de Início': formatDate(order.startDate),
        'Data de Entrega': formatDate(order.deliveryDate),
        'Status': getStatusText(order.status),
        'Prioridade': order.priority || 'Média',
        'Peso Total (kg)': calculateOrderWeight(order).toFixed(2),
        'Urgência': getUrgencyText(getDeliveryUrgency(order)),
        'Observações': order.observations || ''
      }));

      const headers = Object.keys(exportData[0] || {});
      const csvContent = [
        headers.join(','),
        ...exportData.map(row => 
          headers.map(header => `"${(row as any)[header] || ''}"`).join(',')
        )
      ].join('\n');

      const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
      const link = document.createElement('a');
      const url = URL.createObjectURL(blob);
      link.setAttribute('href', url);
      link.setAttribute('download', `pedidos_${format(new Date(), 'yyyy-MM-dd_HH-mm')}.csv`);
      link.style.visibility = 'hidden';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      
      console.log(`Exported ${exportData.length} orders to CSV`);
    } catch (error) {
      console.error('Error exporting to Excel:', error);
      console.log('Erro ao exportar dados. Tente novamente.');
    }
  };

  const handlePrint = () => {
    window.print();
  };

  const handleRetryConnection = () => {
    clearError();
    retryConnection();
  };

  const handleNavigateToReport = (orderId: string) => {
    try {
      navigate(`/item-report/${orderId}`);
      setActiveDropdown(null);
    } catch (error) {
      console.error('Error navigating to report:', error);
      console.log('Erro ao abrir relatório. Tente novamente.');
    }
  };

  const handleOpenPublicSchedule = (orderId: string) => {
    try {
      const url = `${window.location.origin}/cronograma/${orderId}`;
      const newWindow = window.open(url, '_blank', 'noopener,noreferrer');
      if (!newWindow) {
        navigator.clipboard.writeText(url).then(() => {
          console.log('Pop-up bloqueado. Link copiado para área de transferência.');
        });
      }
      setActiveDropdown(null);
    } catch (error) {
      console.error('Error opening public schedule:', error);
      console.log('Erro ao abrir cronograma público.');
    }
  };

  const handleCopyPublicLink = (orderId: string) => {
    try {
      const url = `${window.location.origin}/cronograma/${orderId}`;
      navigator.clipboard.writeText(url).then(() => {
        console.log('Link copiado para a área de transferência!');
        setActiveDropdown(null);
      });
    } catch (error) {
      console.error('Error copying link:', error);
      console.log('Erro ao copiar link.');
    }
  };

  // ============================================================================
  // COMPONENTES INTERNOS
  // ============================================================================

  // Componente Dashboard
  const OrdersDashboard = () => {
    const totalOrders = processedOrders.length;
    const inProgressOrders = processedOrders.filter(o => o.status === 'in-progress').length;
    const completedOrders = processedOrders.filter(o => o.status === 'completed').length;
    const onHoldOrders = processedOrders.filter(o => o.status === 'on-hold').length;
    
    const overdueOrders = processedOrders.filter(order => getDeliveryUrgency(order) === 'overdue').length;
    const todayOrders = processedOrders.filter(order => getDeliveryUrgency(order) === 'today').length;
    const tomorrowOrders = processedOrders.filter(order => getDe
