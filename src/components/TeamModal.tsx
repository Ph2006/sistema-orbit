import React, { useState, useEffect } from 'react';
import { X, Save, User, Mail, Phone, Briefcase, ShieldCheck, ShieldAlert } from 'lucide-react';
import { doc, getDoc } from 'firebase/firestore';
import { db, getCompanyCollection } from '../lib/firebase';
import { TeamMember, AVAILABLE_PERMISSIONS, Permission } from '../types/team';

const TeamModal: React.FC<TeamModalProps> = ({ isOpen, onClose, onSave, member }) => {
  // ... existing code ...

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!formData.name || !formData.email || !formData.role) {
      setError('Por favor, preencha todos os campos obrigatórios');
      return;
    }

    if (!formData.permissions || formData.permissions.length === 0) {
      setError('Selecione pelo menos uma permissão');
      return;
    }

    try {
      setLoading(true);
      setError('');

      // Verificar se o email já está em uso
      if (!member) {
        const teamMembersRef = collection(db, getCompanyCollection('teamMembers'));
        const q = query(teamMembersRef, where('email', '==', formData.email));
        const querySnapshot = await getDocs(q);
        
        if (!querySnapshot.empty) {
          setError('Este email já está em uso por outro membro da equipe');
          setLoading(false);
          return;
        }
      }

      onSave(formData);
      onClose();
    } catch (error) {
      console.error('Error saving team member:', error);
      setError('Erro ao salvar membro da equipe');
    } finally {
      setLoading(false);
    }
  };

  // ... rest of the component code ...
} 