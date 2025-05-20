import React, { useState, useEffect } from 'react';
import { Plus, Edit, Trash2, Search, Users, Mail, Phone, Briefcase, ShieldCheck, ShieldAlert, ChevronDown } from 'lucide-react';
import { collection, getDocs, addDoc, updateDoc, deleteDoc, doc, query, orderBy, getDoc } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { TeamMember, AVAILABLE_PERMISSIONS, Permission } from '../types/team';

interface TeamMemberModalProps {
  member: TeamMember | null;
  onClose: () => void;
  onSave: (member: TeamMember) => Promise<void>;
}

const TeamMemberModal: React.FC<TeamMemberModalProps> = ({ member, onClose, onSave }) => {
  const [formData, setFormData] = useState<TeamMember>({
    id: member?.id || '',
    name: member?.name || '',
    email: member?.email || '',
    phone: member?.phone || '',
    role: member?.role || '',
    department: member?.department || '',
    skills: member?.skills || [],
    isActive: member?.isActive ?? true,
    createdAt: member?.createdAt || new Date().toISOString(),
    permissions: member?.permissions || []
  });

  const [newSkill, setNewSkill] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showPermissions, setShowPermissions] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isSubmitting) return;

    if (!formData.name || !formData.email) {
      alert('Nome e email são campos obrigatórios.');
      return;
    }

    try {
      setIsSubmitting(true);
      await onSave(formData);
      onClose();
    } catch (error) {
      console.error('Error saving team member:', error);
      alert('Erro ao salvar membro da equipe. Por favor, tente novamente.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleAddSkill = () => {
    if (!newSkill.trim()) return;
    
    if (!formData.skills.includes(newSkill.trim())) {
      setFormData({
        ...formData,
        skills: [...formData.skills, newSkill.trim()]
      });
    }
    
    setNewSkill('');
  };

  const handleRemoveSkill = (skill: string) => {
    setFormData({
      ...formData,
      skills: formData.skills.filter(s => s !== skill)
    });
  };

  const handleTogglePermission = (permissionId: string) => {
    const permissions = [...(formData.permissions || [])];
    
    if (permissions.includes(permissionId)) {
      // Remove permission
      setFormData({
        ...formData,
        permissions: permissions.filter(p => p !== permissionId)
      });
    } else {
      // Add permission
      setFormData({
        ...formData,
        permissions: [...permissions, permissionId]
      });
    }
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg p-6 max-w-xl w-full max-h-[90vh] overflow-y-auto">
        <div className="flex justify-between items-center mb-6">
          <h2 className="text-2xl font-bold">
            {member ? 'Editar Membro' : 'Novo Membro'}
          </h2>
          <button onClick={onClose}>
            <X className="h-6 w-6" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Nome Completo*
              </label>
              <input
                type="text"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                className="w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring focus:ring-blue-200"
                required
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Email*
              </label>
              <input
                type="email"
                value={formData.email}
                onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                className="w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring focus:ring-blue-200"
                required
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Telefone
              </label>
              <input
                type="tel"
                value={formData.phone}
                onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                className="w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring focus:ring-blue-200"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Cargo
              </label>
              <input
                type="text"
                value={formData.role}
                onChange={(e) => setFormData({ ...formData, role: e.target.value })}
                className="w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring focus:ring-blue-200"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Departamento
              </label>
              <select
                value={formData.department}
                onChange={(e) => setFormData({ ...formData, department: e.target.value })}
                className="w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring focus:ring-blue-200"
              >
                <option value="">Selecione um departamento</option>
                <option value="Produção">Produção</option>
                <option value="Engenharia">Engenharia</option>
                <option value="Qualidade">Qualidade</option>
                <option value="Manutenção">Manutenção</option>
                <option value="Administração">Administração</option>
                <option value="Logística">Logística</option>
                <option value="Compras">Compras</option>
                <option value="Vendas">Vendas</option>
              </select>
            </div>
            <div>
              <div className="flex items-center h-10 mt-5">
                <input
                  type="checkbox"
                  id="isActive"
                  checked={formData.isActive}
                  onChange={(e) => setFormData({ ...formData, isActive: e.target.checked })}
                  className="h-4 w-4 text-blue-600 rounded focus:ring-blue-500"
                />
                <label htmlFor="isActive" className="ml-2 text-sm text-gray-700">
                  Ativo
                </label>
              </div>
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700">
              Habilidades
            </label>
            <div className="flex gap-2 mb-2">
              <input
                type="text"
                value={newSkill}
                onChange={(e) => setNewSkill(e.target.value)}
                className="flex-1 rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring focus:ring-blue-200"
                placeholder="Ex: Solda, Montagem, Usinagem..."
              />
              <button
                type="button"
                onClick={handleAddSkill}
                className="px-3 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700"
              >
                <Plus className="h-5 w-5" />
              </button>
            </div>

            <div className="flex flex-wrap gap-2">
              {formData.skills.map((skill) => (
                <div key={skill} className="flex items-center bg-gray-100 px-3 py-1 rounded-full">
                  <span className="text-sm">{skill}</span>
                  <button
                    type="button"
                    onClick={() => handleRemoveSkill(skill)}
                    className="ml-2 text-gray-500 hover:text-red-500"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>
              ))}
              {formData.skills.length === 0 && (
                <p className="text-sm text-gray-500 py-1">Nenhuma habilidade adicionada</p>
              )}
            </div>
          </div>

          {/* Permissions section */}
          <div className="border-t pt-4 mt-4">
            <button
              type="button"
              className="flex items-center text-blue-600 hover:text-blue-800 mb-4"
              onClick={() => setShowPermissions(!showPermissions)}
            >
              <ShieldCheck className="h-5 w-5 mr-2" />
              Permissões de Acesso
              <ChevronDown className={`ml-2 h-4 w-4 transition-transform ${showPermissions ? 'rotate-180' : ''}`} />
            </button>
            
            {showPermissions && (
              <div className="bg-gray-50 p-4 rounded-lg border border-gray-200 mt-2">
                <p className="text-sm text-gray-600 mb-4">
                  Selecione quais módulos este usuário poderá acessar no sistema:
                </p>
                
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {AVAILABLE_PERMISSIONS.map(permission => (
                    <div key={permission.id} className="flex items-start">
                      <input
                        type="checkbox"
                        id={`permission-${permission.id}`}
                        checked={formData.permissions?.includes(permission.id) || false}
                        onChange={() => handleTogglePermission(permission.id)}
                        className="h-4 w-4 mt-1 text-blue-600 rounded focus:ring-blue-500"
                      />
                      <label htmlFor={`permission-${permission.id}`} className="ml-2 text-sm">
                        <div className="font-medium text-gray-700">{permission.module}</div>
                        <div className="text-gray-500">{permission.description}</div>
                      </label>
                    </div>
                  ))}
                </div>
                
                {formData.permissions?.length === 0 && (
                  <div className="mt-2 p-3 bg-yellow-50 rounded-lg">
                    <div className="flex">
                      <div className="flex-shrink-0">
                        <ShieldAlert className="h-5 w-5 text-yellow-400" />
                      </div>
                      <div className="ml-3">
                        <p className="text-sm text-yellow-700">
                          Atenção! Este usuário não terá acesso a nenhum módulo do sistema.
                        </p>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>

          <div className="flex justify-end space-x-4 mt-6">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 border border-gray-300 rounded-md hover:bg-gray-50"
              disabled={isSubmitting}
            >
              Cancelar
            </button>
            <button
              type="submit"
              className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700"
              disabled={isSubmitting}
            >
              {isSubmitting ? 'Salvando...' : 'Salvar'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

const TeamManagement: React.FC = () => {
  const [members, setMembers] = useState<TeamMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selectedMember, setSelectedMember] = useState<TeamMember | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [departmentFilter, setDepartmentFilter] = useState<string>('');

  useEffect(() => {
    loadTeamMembers();
  }, []);

  const loadTeamMembers = async () => {
    try {
      setLoading(true);
      const querySnapshot = await getDocs(
        query(collection(db, 'teamMembers'), orderBy('name', 'asc'))
      );
      const membersData = querySnapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      })) as TeamMember[];
      
      setMembers(membersData);
    } catch (error) {
      console.error('Error loading team members:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleAddMember = () => {
    setSelectedMember(null);
    setIsModalOpen(true);
  };

  const handleEditMember = (member: TeamMember) => {
    // Deep copy to avoid reference issues
    setSelectedMember(JSON.parse(JSON.stringify(member)));
    setIsModalOpen(true);
  };

  const handleDeleteMember = async (memberId: string) => {
    if (isDeleting) return;
    
    if (window.confirm('Tem certeza que deseja excluir este membro da equipe?')) {
      try {
        setIsDeleting(true);
        
        // Check if the document exists before attempting to delete
        const memberRef = doc(db, 'teamMembers', memberId);
        const memberDoc = await getDoc(memberRef);
        
        if (!memberDoc.exists()) {
          // Handle the case where the document doesn't exist more gracefully
          setMembers(prev => prev.filter(member => member.id !== memberId));
          alert('Membro não encontrado ou já foi excluído. A lista foi atualizada.');
          setIsDeleting(false);
          return;
        }
        
        // Perform the deletion
        await deleteDoc(memberRef);
        alert('Membro excluído com sucesso!');
        await loadTeamMembers();
      } catch (error) {
        console.error('Error deleting team member:', error);
        alert('Erro ao excluir membro da equipe');
      } finally {
        setIsDeleting(false);
      }
    }
  };

  const handleSaveMember = async (member: TeamMember): Promise<void> => {
    try {
      if (member.id) {
        // Check if the document exists before updating
        const memberRef = doc(db, 'teamMembers', member.id);
        const memberDoc = await getDoc(memberRef);
        
        if (!memberDoc.exists()) {
          throw new Error('Membro não encontrado');
        }
        
        await updateDoc(memberRef, {
          name: member.name,
          email: member.email,
          phone: member.phone,
          role: member.role,
          department: member.department,
          skills: member.skills,
          isActive: member.isActive,
          permissions: member.permissions || []
        });
      } else {
        await addDoc(collection(db, 'teamMembers'), {
          name: member.name,
          email: member.email,
          phone: member.phone,
          role: member.role,
          department: member.department,
          skills: member.skills,
          isActive: member.isActive,
          createdAt: new Date().toISOString(),
          permissions: member.permissions || []
        });
      }
      
      await loadTeamMembers();
    } catch (error) {
      console.error('Error saving team member:', error);
      throw error;
    }
  };

  // Filter members based on search term and department filter
  const filteredMembers = members.filter(member => {
    const matchesSearch = searchTerm === '' || 
                     member.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
                     member.email.toLowerCase().includes(searchTerm.toLowerCase()) ||
                     member.role.toLowerCase().includes(searchTerm.toLowerCase());
    
    const matchesDepartment = !departmentFilter || member.department === departmentFilter;
    
    return matchesSearch && matchesDepartment;
  });

  // Get all unique departments for filter
  const departments = [...new Set(members.map(m => m.department).filter(Boolean))];

  // Get permissions list for a member
  const getMemberPermissions = (member: TeamMember) => {
    if (!member.permissions || member.permissions.length === 0) {
      return "Acesso completo";
    }
    
    return AVAILABLE_PERMISSIONS
      .filter(p => member.permissions?.includes(p.id))
      .map(p => p.module)
      .join(', ');
  };

  return (
    <div className="p-6">
      <div className="flex justify-between items-center mb-6">
        <h2 className="text-2xl font-bold">Gerenciamento de Equipe</h2>
        <button
          onClick={handleAddMember}
          disabled={isDeleting}
          className="flex items-center px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
        >
          <Plus className="h-5 w-5 mr-2" />
          Novo Membro
        </button>
      </div>

      <div className="mb-6 p-4 bg-blue-50 rounded-lg border-l-4 border-blue-500">
        <div className="flex">
          <ShieldCheck className="h-6 w-6 text-blue-500 mr-3" />
          <div>
            <h3 className="font-medium text-blue-800">Controle de Acesso</h3>
            <p className="text-sm text-blue-700 mt-1">
              Gerencie os membros da sua equipe e defina quais módulos do sistema cada um pode acessar.
              Os membros com permissões restritas só terão acesso às funcionalidades específicas que você autorizar.
            </p>
          </div>
        </div>
      </div>

      {/* Search and Filter */}
      <div className="mb-6 grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-gray-400" />
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Buscar por nome, email ou cargo..."
            className="pl-10 w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring focus:ring-blue-200"
          />
        </div>
        
        <div>
          <select
            value={departmentFilter}
            onChange={(e) => setDepartmentFilter(e.target.value)}
            className="w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring focus:ring-blue-200"
          >
            <option value="">Todos os departamentos</option>
            {departments.map(department => (
              <option key={department} value={department}>{department}</option>
            ))}
          </select>
        </div>
        
        {(searchTerm || departmentFilter) && (
          <div className="flex items-center">
            <button
              onClick={() => {
                setSearchTerm('');
                setDepartmentFilter('');
              }}
              className="text-sm text-blue-600 hover:text-blue-800"
            >
              Limpar filtros
            </button>
          </div>
        )}
      </div>

      {/* Team Members Table */}
      <div className="bg-white rounded-lg shadow overflow-hidden">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Membro
                </th>
                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Contato
                </th>
                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Cargo/Departamento
                </th>
                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Permissões de Acesso
                </th>
                <th scope="col" className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Status
                </th>
                <th scope="col" className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Ações
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {loading ? (
                <tr>
                  <td colSpan={6} className="px-6 py-4 text-center">
                    <div className="inline-block animate-spin rounded-full h-5 w-5 border-b-2 border-blue-600"></div>
                    <p className="mt-2 text-sm text-gray-500">Carregando membros da equipe...</p>
                  </td>
                </tr>
              ) : filteredMembers.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-6 py-4 text-center text-gray-500">
                    Nenhum membro encontrado.
                  </td>
                </tr>
              ) : (
                filteredMembers.map((member) => (
                  <tr key={member.id} className={!member.isActive ? 'bg-gray-50' : ''}>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="font-medium text-gray-900">{member.name}</div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="text-sm">
                        <div className="flex items-center text-gray-500">
                          <Mail className="h-4 w-4 mr-1 flex-shrink-0" /> {member.email}
                        </div>
                        {member.phone && (
                          <div className="flex items-center text-gray-500 mt-1">
                            <Phone className="h-4 w-4 mr-1 flex-shrink-0" /> {member.phone}
                          </div>
                        )}
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="text-sm">
                        {member.role && <div className="font-medium">{member.role}</div>}
                        {member.department && (
                          <div className="flex items-center text-gray-500 mt-1">
                            <Briefcase className="h-4 w-4 mr-1 flex-shrink-0" />
                            {member.department}
                          </div>
                        )}
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <div className="text-sm">
                        {!member.permissions || member.permissions.length === 0 ? (
                          <span className="px-2 py-1 text-xs bg-blue-100 text-blue-800 rounded-full">Acesso completo</span>
                        ) : (
                          <div>
                            <span className="px-2 py-1 text-xs bg-yellow-100 text-yellow-800 rounded-full">
                              Acesso restrito
                            </span>
                            <div className="mt-1 text-xs text-gray-500 truncate max-w-xs">
                              {getMemberPermissions(member)}
                            </div>
                          </div>
                        )}
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-center">
                      <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                        member.isActive ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-800'
                      }`}>
                        {member.isActive ? 'Ativo' : 'Inativo'}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                      <button 
                        onClick={() => handleEditMember(member)}
                        disabled={isDeleting}
                        className="text-blue-600 hover:text-blue-900 inline-block mr-3"
                      >
                        <Edit className="h-5 w-5" />
                      </button>
                      <button 
                        onClick={() => handleDeleteMember(member.id)}
                        disabled={isDeleting}
                        className="text-red-600 hover:text-red-900 inline-block"
                      >
                        <Trash2 className="h-5 w-5" />
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {isModalOpen && (
        <TeamMemberModal
          member={selectedMember}
          onClose={() => {
            setIsModalOpen(false);
            setSelectedMember(null);
          }}
          onSave={handleSaveMember}
        />
      )}
    </div>
  );
};

const X = (props: any) => (
  <svg
    {...props}
    xmlns="http://www.w3.org/2000/svg"
    width="24"
    height="24"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <path d="M18 6 6 18" />
    <path d="m6 6 12 12" />
  </svg>
);

export default TeamManagement;