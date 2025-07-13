"use client";

import { createContext, useContext, useEffect, useState } from "react";
import { onAuthStateChanged, User } from "firebase/auth";
import { auth } from "@/lib/firebase";
import { OrbitLogo } from "@/components/logo";

const StandaloneAuthContext = createContext<{
  user: User | null;
  loading: boolean;
}>({
  user: null,
  loading: true,
});

export const useStandaloneAuth = () => useContext(StandaloneAuthContext);

function StandaloneAuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser);
      setLoading(false);
    });
    
    return () => unsubscribe();
  }, []);

  return (
    <StandaloneAuthContext.Provider value={{ user, loading }}>
      {children}
    </StandaloneAuthContext.Provider>
  );
}

function LoadingScreen() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 flex items-center justify-center">
      <div className="text-center space-y-4">
        <OrbitLogo className="w-16 h-16 mx-auto animate-pulse text-blue-600" />
        <p className="text-muted-foreground">Carregando Sistema OrbIT...</p>
      </div>
    </div>
  );
}

export default function StandaloneLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted) {
    return <LoadingScreen />;
  }

  return (
    <StandaloneAuthProvider>
      <StandaloneContent>{children}</StandaloneContent>
    </StandaloneAuthProvider>
  );
}

function StandaloneContent({ children }: { children: React.ReactNode }) {
  const { loading } = useStandaloneAuth();

  if (loading) {
    return <LoadingScreen />;
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100">
      {children}
    </div>
  );
}
