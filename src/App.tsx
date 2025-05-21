import React, { useEffect } from 'react';
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

function App() {
  const { setUser, setLoading } = useAuthStore();

  useEffect(() => {
    setLoading(true);
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      setUser(user);
      setLoading(false);
    });

    return () => unsubscribe();
  }, [setUser, setLoading]);

  return (
    <Router>
      <Routes>
        <Route path="/" element={<LoginForm />} />
        <Route path="/validate/:orderId" element={<DocumentValidation />} />
        <Route path="/scan/:code" element={<ProductionOrderScan />} />
        <Route path="/update/:code" element={<QRProgressScan />} />
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