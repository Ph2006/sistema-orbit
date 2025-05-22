import React, { useState, useEffect } from 'react';
import { Navigate, useLocation, useNavigate } from 'react-router-dom';
import { Lock, Mail, Orbit, Building, AlertCircle, UserPlus, RefreshCw } from 'lucide-react';
import { signInWithEmailAndPassword, AuthError, sendPasswordResetEmail, createUserWithEmailAndPassword } from 'firebase/auth';
import { auth, db } from '../lib/firebase';
import { useAuthStore } from '../store/authStore';
import { collection, getDocs, setDoc, doc, query, where, getDoc } from 'firebase/firestore';

const LoginForm: React.FC = () => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [company, setCompany] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [step, setStep] = useState<'company' | 'credentials'>('company');
  const [isSignUp, setIsSignUp] = useState(false);
  const [isResettingPassword, setIsResettingPassword] = useState(false);
  const navigate = useNavigate();
  const location = useLocation();
  const { user, loading, setCompanyId } = useAuthStore();

  useEffect(() => {
    if (user && !loading) {
      const from = (location.state as any)?.from?.pathname || '/dashboard';
      navigate(from, { replace: true });
    }
  }, [user, loading, navigate, location]);

  const getErrorMessage = (error: AuthError) => {
    switch (error.code) {
      case 'auth/invalid-credential':
        return 'Credenciais inválidas. Verifique se digitou corretamente seu email e senha. Se estiver tendo dificuldades, utilize a opção "Esqueceu a senha?" abaixo.';
      case 'auth/wrong-password':
        return 'Senha incorreta. Verifique sua senha ou utilize a opção "Esqueceu a senha?" para redefinir.';
      case 'auth/user-not-found':
        return 'Email não encontrado. Verifique se digitou corretamente ou crie uma nova conta se for seu primeiro acesso.';
      case 'auth/invalid-email':
        return 'Email inválido. Por favor, verifique o formato do email.';
      case 'auth/user-disabled':
        return 'Esta conta foi desativada. Entre em contato com o suporte.';
      case 'auth/too-many-requests':
        return 'Muitas tentativas de login. Por favor, aguarde alguns minutos ou utilize a opção "Esqueceu a senha?" para redefinir sua senha.';
      case 'auth/network-request-failed':
        return 'Erro de conexão. Verifique sua internet e tente novamente.';
      case 'auth/email-already-in-use':
        return 'Este email já está cadastrado. Tente fazer login ou recupere sua senha se não se lembrar dela.';
      case 'auth/weak-password':
        return 'A senha é muito fraca. Use pelo menos 6 caracteres.';
      default:
        console.error('Código do erro:', error.code);
        return `Erro ao fazer login (${error.code}). Por favor, tente novamente ou contate o suporte.`;
    }
  };

  const handleCompanySubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!company.trim()) {
      setError('Por favor, informe o nome da empresa.');
      return;
    }

    // Special handling for Mecald - works on both localhost and production
    if (company.toLowerCase() === 'mecald' || 
        company.toLowerCase() === 'mecânica ld' ||
        company.toLowerCase() === 'mecanica ld') {
      // Set companyId to 'mecald'
      setCompanyId('mecald');
      localStorage.setItem('companyId', 'mecald');
      console.log('Company set to Mecald');
      // Move to credentials step
      setStep('credentials');
      setError('');
      return;
    }

    // Special handling for Brasmold - ensure access works the same way
    if (company.toLowerCase() === 'brasmold' || 
        company.toLowerCase().includes('brasmold')) {
      setCompanyId('brasmold');
      localStorage.setItem('companyId', 'brasmold');
      console.log('Company set to Brasmold');
      setStep('credentials');
      setError('');
      return;
    }

    // Check if company exists in the system
    try {
      const companiesRef = collection(db, 'companies');
      const q = query(companiesRef, where('name', '==', company.trim()));
      const querySnapshot = await getDocs(q);
      
      if (querySnapshot.empty) {
        // Create a new company if it doesn't exist
        const newCompanyId = crypto.randomUUID();
        await setDoc(doc(db, 'companies', newCompanyId), {
          name: company.trim(),
          createdAt: new Date().toISOString(),
        });
        setCompanyId(newCompanyId); // Store in auth state
        localStorage.setItem('companyId', newCompanyId); // Also store in localStorage
        console.log(`New company created with ID: ${newCompanyId}`);
      } else {
        // Use existing company
        const companyId = querySnapshot.docs[0].id;
        setCompanyId(companyId);
        localStorage.setItem('companyId', companyId); // Also store in localStorage
        console.log(`Using existing company with ID: ${companyId}`);
      }

      // Move to credentials step
      setStep('credentials');
      setError('');
    } catch (err) {
      console.error('Erro ao verificar empresa:', err);
      setError('Erro ao verificar empresa. Por favor, tente novamente.');
    }
  };

  const handleCredentialsSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSuccess('');

    if (!email.trim() || !password.trim()) {
      setError('Por favor, preencha todos os campos.');
      return;
    }

    // Email validation
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email.trim())) {
      setError('Por favor, insira um email válido.');
      return;
    }

    // Password validation
    if (password.length < 6) {
      setError('A senha deve ter pelo menos 6 caracteres.');
      return;
    }

    try {
      // Verify company ID is in local storage and auth store
      const companyId = localStorage.getItem('companyId');
      if (!companyId) {
        setError('Erro com a seleção da empresa. Por favor, tente novamente.');
        setStep('company');
        return;
      }

      if (isSignUp) {
        // Creating a new user
        await createUserWithEmailAndPassword(auth, email.trim(), password);
        setSuccess('Conta criada com sucesso! Você será redirecionado em instantes.');
      } else {
        // Logging in an existing user
        const userCredential = await signInWithEmailAndPassword(auth, email.trim(), password);
        const user = userCredential.user;

        // *** NOVO: Obter companyId do documento do usuário no Firestore ***
        if (user) {
          try {
            const userDocRef = doc(db, 'users', user.uid);
            const userDocSnap = await getDoc(userDocRef);

            if (userDocSnap.exists()) {
              const userData = userDocSnap.data();
              const userCompanyId = userData?.companyId;

              if (userCompanyId) {
                // Definir o companyId no estado global e localStorage
                setCompanyId(userCompanyId);
                localStorage.setItem('companyId', userCompanyId);
                console.log(`Company ID fetched from user doc: ${userCompanyId}`);
              } else {
                // Lidar com o caso em que o companyId não está no documento do usuário
                setError('Company ID not found in user profile. Contact support.');
                // Opcional: forçar logout ou impedir acesso
                await auth.signOut();
                setCompanyId(null);
                localStorage.removeItem('companyId');
                return; // Interrompe o login
              }
            } else {
              // Lidar com o caso em que o documento do usuário não existe na coleção 'users'
              setError('User profile not found. Contact support.');
              // Opcional: forçar logout ou impedir acesso
              await auth.signOut();
              setCompanyId(null);
              localStorage.removeItem('companyId');
              return; // Interrompe o login
            }
          } catch (firestoreError) {
            console.error('Error fetching user company ID from Firestore:', firestoreError);
            setError('Failed to load user profile data. Contact support.');
            // Opcional: forçar logout ou impedir acesso
            await auth.signOut();
            setCompanyId(null);
            localStorage.removeItem('companyId');
            return; // Interrompe o login
          }
        }
      }
    } catch (err) {
      console.error('Erro de autenticação:', err);
      
      // Make sure we can safely cast the error and access its code
      const authError = err as AuthError;
      const errorCode = authError?.code || 'unknown-error';
      
      if (errorCode === 'auth/invalid-credential' && !isSignUp) {
        setError('Credenciais inválidas. Verifique cuidadosamente seu email e senha. Se você esqueceu sua senha, utilize a opção "Esqueceu a senha?" abaixo para redefinir.');
      } else if (errorCode === 'auth/user-not-found' && !isSignUp) {
        setError('Email não encontrado. Se você é novo no sistema, utilize a opção "Criar nova conta" abaixo.');
      } else {
        // Use the general error message function for other error types
        setError(getErrorMessage(authError));
      }
    }
  };

  const handlePasswordReset = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSuccess('');

    if (!email.trim()) {
      setError('Por favor, informe seu email para recuperar a senha.');
      return;
    }

    try {
      await sendPasswordResetEmail(auth, email.trim());
      setSuccess('Email de recuperação enviado. Verifique sua caixa de entrada.');
      setIsResettingPassword(false);
    } catch (err) {
      console.error('Erro ao enviar email de recuperação:', err);
      const authError = err as AuthError;
      setError(getErrorMessage(authError));
    }
  };

  const toggleSignUpMode = () => {
    setIsSignUp(!isSignUp);
    setError('');
    setSuccess('');
  };

  const togglePasswordReset = () => {
    setIsResettingPassword(!isResettingPassword);
    setError('');
    setSuccess('');
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-100">
        <div className="text-xl font-medium text-gray-600">Carregando...</div>
      </div>
    );
  }

  if (user) {
    return <Navigate to="/dashboard" replace />;
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-100">
      <div className="bg-white p-8 rounded-lg shadow-md w-full max-w-md">
        <div className="flex flex-col items-center mb-8">
          <Orbit className="h-16 w-16 text-blue-600 mb-2" />
          <h1 className="text-2xl font-bold text-gray-800">Orbit Sistemas</h1>
        </div>
        
        <h2 className="text-xl font-semibold text-center text-gray-700 mb-8">
          Sistema de Monitoramento de Produção
        </h2>
        
        {error && (
          <div className="mb-6 p-4 bg-red-50 border-l-4 border-red-500 text-red-700">
            <div className="flex items-center">
              <AlertCircle className="h-5 w-5 mr-2" />
              <p className="font-medium">Erro</p>
            </div>
            <p className="text-sm mt-1">{error}</p>
          </div>
        )}

        {success && (
          <div className="mb-6 p-4 bg-green-50 border-l-4 border-green-500 text-green-700">
            <p className="font-medium">Sucesso</p>
            <p className="text-sm">{success}</p>
          </div>
        )}
        
        {step === 'company' ? (
          <form onSubmit={handleCompanySubmit} className="space-y-6">
            <div>
              <label className="block text-sm font-medium text-gray-700">
                Empresa
              </label>
              <div className="mt-1 relative">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                  <Building className="h-5 w-5 text-gray-400" />
                </div>
                <input
                  type="text"
                  value={company}
                  onChange={(e) => setCompany(e.target.value)}
                  className="pl-10 block w-full rounded-md border border-gray-300 shadow-sm focus:border-blue-500 focus:ring focus:ring-blue-200 focus:ring-opacity-50"
                  placeholder="Nome da Empresa"
                  required
                />
              </div>
              <p className="mt-2 text-sm text-gray-600">
                Informe sua empresa para acessar os dados corretos.
              </p>
            </div>

            <button
              type="submit"
              className="w-full flex justify-center py-2 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
            >
              Continuar
            </button>
          </form>
        ) : isResettingPassword ? (
          <form onSubmit={handlePasswordReset} className="space-y-6">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Email para recuperação de senha
              </label>
              <div className="mt-1 relative">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                  <Mail className="h-5 w-5 text-gray-400" />
                </div>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="pl-10 block w-full rounded-md border-gray-300 focus:ring-blue-500 focus:border-blue-500"
                  placeholder="seu@email.com"
                  required
                />
              </div>
              <p className="mt-2 text-sm text-gray-600">
                Você receberá um email com instruções para criar uma nova senha.
              </p>
            </div>

            <div className="flex items-center justify-between">
              <button
                type="button"
                onClick={togglePasswordReset}
                className="text-sm font-medium text-blue-600 hover:text-blue-500"
              >
                Voltar para o login
              </button>
              <div className="text-sm">
                <span className="font-medium text-gray-700">
                  Empresa: {company}
                </span>
              </div>
            </div>

            <button
              type="submit"
              className="w-full flex justify-center py-2 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
            >
              Enviar instruções
            </button>
          </form>
        ) : (
          <form onSubmit={handleCredentialsSubmit} className="space-y-6">
            <div>
              <label className="block text-sm font-medium text-gray-700">
                Email
              </label>
              <div className="mt-1 relative">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                  <Mail className="h-5 w-5 text-gray-400" />
                </div>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="pl-10 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring focus:ring-blue-200 focus:ring-opacity-50"
                  placeholder="seu@email.com"
                  required
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700">
                Senha
              </label>
              <div className="mt-1 relative">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                  <Lock className="h-5 w-5 text-gray-400" />
                </div>
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="pl-10 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring focus:ring-blue-200 focus:ring-opacity-50"
                  placeholder="••••••••"
                  required
                  minLength={6}
                />
              </div>
              <div className="text-right mt-1">
                <button
                  type="button"
                  onClick={togglePasswordReset}
                  className="text-xs font-medium text-blue-600 hover:text-blue-500"
                >
                  Esqueceu a senha?
                </button>
              </div>
            </div>

            <div className="flex items-center justify-between">
              <div className="text-sm">
                <span className="font-medium text-gray-700">
                  Empresa: {company}
                </span>
              </div>
              <button
                type="button"
                onClick={() => setStep('company')}
                className="text-sm font-medium text-blue-600 hover:text-blue-500"
              >
                Alterar
              </button>
            </div>

            <button
              type="submit"
              className="w-full flex justify-center py-2 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
            >
              {isSignUp ? 'Cadastrar' : 'Entrar'}
            </button>

            <div className="mt-4 text-center">
              <button
                type="button"
                onClick={toggleSignUpMode}
                className="inline-flex items-center text-sm font-medium text-blue-600 hover:text-blue-500"
              >
                {isSignUp ? (
                  <>
                    Já tem uma conta? Faça login
                  </>
                ) : (
                  <>
                    <UserPlus className="h-4 w-4 mr-1" />
                    Criar nova conta
                  </>
                )}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
};

export default LoginForm;