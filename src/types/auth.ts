export interface User {
  id: string;
  email: string;
  ip_address: string;
  created_at: string;
}

export interface AuthState {
  user: User | null;
  loading: boolean;
  error: string | null;
}