import React from 'react';
import { Link, useLocation } from 'react-router-dom';
import { LayoutDashboard, Trello, Users, LogOut, ClipboardCheck, DollarSign, Package, UserCog, BarChart, ShoppingBag, Building, FileText, Settings, CircleDollarSign, Trash2, RefreshCw } from 'lucide-react';
import { auth } from '../lib/firebase';
import { useAuthStore } from '../store/authStore';
import { useNavigate } from 'react-router-dom';

const Sidebar: React.FC = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const { user, setUser, teamMember, companyId } = useAuthStore();

  const handleLogout = async () => {
    try {
      await auth.signOut();
      setUser(null);
      navigate('/');
    } catch (error) {
      console.error('Erro ao fazer logout:', error);
    }
  };

  const isActive = (path: string) => location.pathname === path;

  // Check if user has permission to access a module
  const hasPermission = (permissionId: string): boolean => {
    // If no team member data or no permissions specified, grant full access
    if (!teamMember || !teamMember.permissions || teamMember.permissions.length === 0) {
      return true;
    }
    
    // Check if user has the specific permission
    return teamMember.permissions.includes(permissionId);
  };
  
  // Check if company has access to a specific module
  const companyHasAccess = (moduleId: string): boolean => {
    // If Brasmold company, restrict access to certain modules
    if (companyId === 'brasmold') {
      // Restrict Team, Supplier Portal and Material Requisitions for Brasmold
      const restrictedModules = ['team', 'supplier-portal', 'material-requisitions'];
      if (restrictedModules.includes(moduleId)) {
        return false;
      }
    }
    
    // All other modules are accessible
    return true;
  };

  const menuItems = [
    { path: '/dashboard', icon: LayoutDashboard, label: 'Dashboard', permission: 'dashboard', company: 'all' },
    { path: '/quotations', icon: FileText, label: 'Orçamentos', permission: 'quotations', company: 'all' },
    { path: '/orders', icon: Package, label: 'Pedidos', permission: 'orders', company: 'all' },
    { path: '/cost-center', icon: CircleDollarSign, label: 'Centro de Custos', permission: 'financial', company: 'all' },
    { path: '/kanban', icon: Trello, label: 'Kanban', permission: 'kanban', company: 'all' },
    { path: '/occupation', icon: BarChart, label: 'Taxa de Ocupação', permission: 'occupation', company: 'all' },
    { path: '/material-requisitions', icon: ShoppingBag, label: 'Req. de Materiais', permission: 'material-requisitions', company: 'mecald' },
    { path: '/supplier-portal', icon: Building, label: 'Portal do Fornecedor', permission: 'supplier-portal', company: 'mecald' },
    { path: '/customers', icon: Users, label: 'Clientes', permission: 'customers', company: 'all' },
    { path: '/team', icon: UserCog, label: 'Equipe', permission: 'team', company: 'mecald' },
    { path: '/quality', icon: ClipboardCheck, label: 'Controle de Qualidade', permission: 'quality', company: 'all' },
    { path: '/financial', icon: DollarSign, label: 'Controle Financeiro', permission: 'financial', company: 'all' },
    { path: '/settings', icon: Settings, label: 'Configurações', permission: 'dashboard', company: 'all' },
  ];

  // Special admin menu items
  const adminItems = [
    { 
      path: '/restore-mecald', 
      icon: RefreshCw, 
      label: 'Restaurar Mecald', 
      permission: 'dashboard', 
      company: 'all'
    }
  ];

  // Only add Brasmold cleanup for Brasmold
  if (companyId === 'brasmold') {
    adminItems.push({ 
      path: '/clean-brasmold', 
      icon: Trash2, 
      label: 'Limpar Brasmold', 
      permission: 'dashboard', 
      company: 'all'
    });
  }

  return (
    <div className="w-64 min-h-screen bg-gray-800 text-white p-4">
      <div className="mb-8">
        <h1 className="text-xl font-bold">Sistema Orbit</h1>
        {teamMember && (
          <p className="text-sm text-gray-400 mt-2">
            Olá, {teamMember.name.split(' ')[0]}
          </p>
        )}
        {companyId && (
          <p className="text-xs text-gray-500 mt-1">
            Empresa: {companyId === 'mecald' ? 'Mecald' : 'Brasmold'}
          </p>
        )}
      </div>
      
      <nav className="space-y-2">
        {menuItems.map((item) => {
          // Only show menu items the user has permission to access AND company has access to
          const showItem = hasPermission(item.permission) && 
                          (item.company === 'all' || companyId === item.company);
          
          if (!showItem) return null;
          
          return (
            <Link
              key={item.path}
              to={item.path}
              className={`flex items-center space-x-3 px-4 py-3 rounded-lg transition-colors ${
                isActive(item.path)
                  ? 'bg-blue-600 text-white'
                  : 'text-gray-300 hover:bg-gray-700'
              }`}
            >
              <item.icon className="h-5 w-5" />
              <span>{item.label}</span>
            </Link>
          );
        })}

        {/* Admin actions section */}
        <div className="pt-4 mt-4 border-t border-gray-700">
          <p className="px-4 text-xs font-medium text-gray-400 uppercase tracking-wider">
            Administração
          </p>
          
          {adminItems.map((item) => {
            const showItem = hasPermission(item.permission) && 
                            (item.company === 'all' || companyId === item.company);
            
            if (!showItem) return null;
            
            return (
              <Link
                key={item.path}
                to={item.path}
                className={`flex items-center space-x-3 px-4 py-3 rounded-lg transition-colors ${
                  isActive(item.path)
                    ? 'bg-blue-600 text-white'
                    : item.path === '/clean-brasmold'
                      ? 'text-red-300 hover:bg-red-700 hover:text-white'
                      : 'text-gray-300 hover:bg-gray-700'
                }`}
              >
                <item.icon className="h-5 w-5" />
                <span>{item.label}</span>
              </Link>
            );
          })}
        </div>
      </nav>

      <div className="absolute bottom-4 w-52">
        <button
          onClick={handleLogout}
          className="flex items-center space-x-3 px-4 py-3 w-full text-gray-300 hover:bg-gray-700 rounded-lg transition-colors"
        >
          <LogOut className="h-5 w-5" />
          <span>Sair</span>
        </button>
      </div>
    </div>
  );
};

export default Sidebar;