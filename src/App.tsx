import React, { useEffect, useState } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { onAuthStateChanged } from 'firebase/auth';
import { auth } from './lib/firebase';
import { useAuthStore } from './store/authStore';
import LoginForm from './components/LoginForm';
import Dashboard from './components/Dashboard';
import Kanban from './components/Kanban';
import Customers from './components/Customers';
import QualityControl from './components/QualityControl';
import DocumentValidation from './components/DocumentValidation';
import FinancialDashboard from './components/FinancialDashboard';
import Orders from './components/Orders';
import ProductionOrders from './components/ProductionOrders';
import ProductionOrderScan from './components/ProductionOrderScan';
import QRProgressScan from './components/QRProgressScan';
import ItemProductionReport from './components/ItemProductionReport';
import TeamManagement from './components/TeamManagement';
import OccupationRateTab from './components/OccupationRateTab';
import MaterialRequisitions from './components/MaterialRequisitions';
import SupplierPortal from './components/SupplierPortal';
import Quotations from './components/Quotations';
import CompanySettings from './components/CompanySettings';
import PrivateRoute from './components/PrivateRoute';
import PrivateFinancialRoute from './components/PrivateFinancialRoute';
import Sidebar from './components/Sidebar';
import MigrationNotification from './components/MigrationNotification';
import DataMigration from './components/DataMigration';
import BrasmoldCleanup from './components/BrasmoldCleanup';
import MecaldDataRestore from './components/MecaldDataRestore';
import CostCenter from './components/CostCenter';
import AboutSystem from './components/AboutSystem';
import InternalProcedures from './components/InternalProcedures';
import QualityCalibration from './components/QualityCalibration';
import PublicSchedulePage from './components/PublicSchedulePage';

function App() {
  // Estado local para controle de carregamento se o store falhar
  const [isInitialized, setIsInitialized] = useState(false);
  
  // Use objeto vazio como fallback para evitar erros de desestruturação
  const authStore = useAuthStore() || {};
  const { setUser, setLoading, companyId } = authStore;

  useEffect(() => {
    console.log("App.tsx useEffect - Inicializando autenticação");
    
    // Verificar se o store foi inicializado corretamente
    if (!setLoading || typeof setLoading !== 'function') {
      console.warn("AuthStore não está disponível ou 'setLoading' não é uma função");
    } else {
      try {
        setLoading(true);
        console.log("setLoading(true) executado com sucesso");
      } catch (error) {
        console.error("Erro ao executar setLoading:", error);
      }
    }
    
    // Configurar listener de autenticação
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      console.log("Auth state changed:", user?.email || "nenhum usuário");
      
      // Tentar atualizar o estado do usuário no store
      if (setUser && typeof setUser === 'function') {
        try {
          setUser(user);
          console.log("setUser executado com sucesso");
        } catch (error) {
          console.error("Erro ao executar setUser:", error);
        }
      } else {
        console.warn("setUser não está disponível ou não é uma função");
      }
      
      // Desativar o estado de carregamento
      if (setLoading && typeof setLoading === 'function') {
        try {
          setLoading(false);
          console.log("setLoading(false) executado com sucesso");
        } catch (error) {
          console.error("Erro ao executar setLoading(false):", error);
        }
      }
      
      // Marcar como inicializado independentemente do resultado
      setIsInitialized(true);
      
      // Log do companyId para depuração
      if (companyId) {
        console.log(`Company ID after auth state change: ${companyId}`);
      } else {
        console.warn("Company ID não está disponível");
      }
    });

    // Limpar listener na desmontagem
    return () => {
      console.log("App.tsx useEffect cleanup - Desvinculando listener");
      unsubscribe();
    };
  }, [setUser, setLoading, companyId]);

  // Mostrar um indicador de carregamento enquanto inicializa
  if (!isInitialized) {
    return (
      <div style={{
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'center',
        height: '100vh',
        fontFamily: 'sans-serif'
      }}>
        <div>
          <h2>Carregando Sistema Orbit...</h2>
          <p>Aguarde enquanto inicializamos o sistema.</p>
        </div>
      </div>
    );
  }

  // Renderizar a interface do usuário normal após inicialização
  return (
    <Router>
      <Routes>
        <Route path="/" element={<LoginForm />} />
        <Route path="/validate/:orderId" element={<DocumentValidation />} />
        <Route path="/scan/:code" element={<ProductionOrderScan />} />
        <Route path="/update/:code" element={<QRProgressScan />} />
        <Route path="/cronograma/:orderId" element={<PublicSchedulePage />} />
        <Route path="/migrate" element={
          <PrivateRoute>
            <DataMigration />
          </PrivateRoute>
        } />
        <Route path="/restore-mecald" element={
          <PrivateRoute>
            <MecaldDataRestore />
          </PrivateRoute>
        } />
        <Route path="/clean-brasmold" element={
          <PrivateRoute>
            <BrasmoldCleanup />
          </PrivateRoute>
        } />
        <Route
          path="/*"
          element={
            <PrivateRoute>
              <div className="flex">
                <Sidebar />
                <div className="flex-1">
                  <MigrationNotification />
                  <Routes>
                    <Route path="/dashboard" element={
                      <PrivateRoute requiredPermission="dashboard">
                        <Dashboard />
                      </PrivateRoute>
                    } />
                    <Route path="/orders" element={
                      <PrivateRoute requiredPermission="orders">
                        <Orders />
                      </PrivateRoute>
                    } />
                    <Route path="/kanban" element={
                      <PrivateRoute requiredPermission="kanban">
                        <Kanban />
                      </PrivateRoute>
                    } />
                    <Route path="/occupation" element={
                      <PrivateRoute requiredPermission="occupation">
                        <OccupationRateTab />
                      </PrivateRoute>
                    } />
                    <Route path="/quotations" element={
                      <PrivateRoute requiredPermission="quotations">
                        <Quotations />
                      </PrivateRoute>
                    } />
                    <Route path="/cost-center" element={
                      <PrivateRoute requiredPermission="financial">
                        <CostCenter />
                      </PrivateRoute>
                    } />
                    <Route path="/customers" element={
                      <PrivateRoute requiredPermission="customers">
                        <Customers />
                      </PrivateRoute>
                    } />
                    <Route path="/team" element={
                      <PrivateRoute requiredPermission="team">
                        <TeamManagement />
                      </PrivateRoute>
                    } />
                    <Route path="/quality" element={
                      <PrivateRoute requiredPermission="quality">
                        <QualityControl />
                      </PrivateRoute>
                    } />
                    <Route path="/procedures" element={
                      <PrivateRoute requiredPermission="quality">
                        <InternalProcedures />
                      </PrivateRoute>
                    } />
                    <Route path="/calibration" element={
                      <PrivateRoute requiredPermission="quality">
                        <QualityCalibration />
                      </PrivateRoute>
                    } />
                    <Route path="/production-orders" element={
                      <PrivateRoute>
                        <ProductionOrders />
                      </PrivateRoute>
                    } />
                    <Route path="/item-report/:orderId" element={
                      <PrivateRoute>
                        <ItemProductionReport />
                      </PrivateRoute>
                    } />
                    <Route path="/material-requisitions" element={
                      <PrivateRoute requiredPermission="material-requisitions">
                        <MaterialRequisitions />
                      </PrivateRoute>
                    } />
                    <Route path="/supplier-portal" element={
                      <PrivateRoute requiredPermission="supplier-portal">
                        <SupplierPortal />
                      </PrivateRoute>
                    } />
                    <Route path="/settings" element={
                      <PrivateRoute requiredPermission="dashboard">
                        <CompanySettings />
                      </PrivateRoute>
                    } />
                    <Route
                      path="/financial"
                      element={
                        <PrivateRoute requiredPermission="financial">
                          <PrivateFinancialRoute>
                            <FinancialDashboard />
                          </PrivateFinancialRoute>
                        </PrivateRoute>
                      }
                    />
                    <Route path="/about-system" element={
                      <PrivateRoute requiredPermission="dashboard">
                        <AboutSystem />
                      </PrivateRoute>
                    } />
                    <Route path="*" element={<Navigate to="/dashboard" replace />} />
                  </Routes>
                </div>
              </div>
            </PrivateRoute>
          }
        />
      </Routes>
    </Router>
  );
}

export default App;
