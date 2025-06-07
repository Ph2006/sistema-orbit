import React, { useEffect, useState } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { onAuthStateChanged } from 'firebase/auth';
import { auth } from './lib/firebase';
import { useAuthStore } from './store/authStore';
import LoginForm from './components/LoginForm';
import Dashboard from './components/Dashboard';
// ... resto das importações ...

function App() {
  // Estado local para backup caso o store não esteja pronto
  const [localLoading, setLocalLoading] = useState(true);
  const { setUser, setLoading, companyId } = useAuthStore();

  useEffect(() => {
    console.log("App.tsx useEffect - Iniciando autenticação");
    
    // Verificar se setLoading é uma função antes de chamar
    if (typeof setLoading === 'function') {
      try {
        setLoading(true);
        console.log("setLoading(true) executado com sucesso");
      } catch (error) {
        console.error("Erro ao executar setLoading(true):", error);
        // Fallback para o estado local
        setLocalLoading(true);
      }
    } else {
      console.error("setLoading não é uma função:", setLoading);
      // Fallback para o estado local
      setLocalLoading(true);
    }
    
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      console.log("onAuthStateChanged - Usuário:", user?.email);
      
      // Verificar se setUser é uma função antes de chamar
      if (typeof setUser === 'function') {
        try {
          setUser(user);
          console.log("setUser() executado com sucesso");
        } catch (error) {
          console.error("Erro ao executar setUser():", error);
        }
      } else {
        console.error("setUser não é uma função:", setUser);
      }
      
      // Verificar se setLoading é uma função antes de chamar
      if (typeof setLoading === 'function') {
        try {
          setLoading(false);
          console.log("setLoading(false) executado com sucesso");
        } catch (error) {
          console.error("Erro ao executar setLoading(false):", error);
          // Fallback para o estado local
          setLocalLoading(false);
        }
      } else {
        console.error("setLoading não é uma função:", setLoading);
        // Fallback para o estado local
        setLocalLoading(false);
      }
      
      console.log(`Company ID after auth state change: ${companyId}`);
    });

    return () => {
      console.log("App.tsx useEffect cleanup - Desvinculando listener");
      unsubscribe();
    };
  }, [setUser, setLoading, companyId]);

  return (
    <Router>
      {/* Resto do código permanece igual */}
      <Routes>
        {/* Rotas existentes */}
      </Routes>
    </Router>
  );
}

export default App;
