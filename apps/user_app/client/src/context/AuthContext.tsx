import {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  type ReactNode,
} from "react";
import {
  login as apiLogin,
  register as apiRegister,
  getMe,
  type Conversations,
  type RegisterData,
} from "../api";
import { disconnectChatSocket } from "../sockets/chatSocket";

interface User {
  id: string;
  displayName: string | null;
}

interface AuthContextValue {
  user: User | null;
  conversations: Conversations | null;
  setConversations: React.Dispatch<React.SetStateAction<Conversations | null>>;
  loading: boolean;
  login: (userName: string, password: string) => Promise<void>;
  register: (data: RegisterData) => Promise<void>;
  logout: () => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [conversations, setConversations] = useState<Conversations | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const token = localStorage.getItem("token");
    if (!token) {
      setLoading(false);
      return;
    }
    getMe()
      .then((me) => {
        setUser({ id: me.id, displayName: me.displayName });
        setConversations(me.conversations);
      })
      .catch(() => {
        localStorage.removeItem("token");
      })
      .finally(() => setLoading(false));
  }, []);

  const login = useCallback(async (userName: string, password: string) => {
    const res = await apiLogin(userName, password);
    localStorage.setItem("token", res.token);
    setUser({ id: res.user.id, displayName: res.user.displayName });
    setConversations(res.conversations);
  }, []);

  const register = useCallback(async (data: RegisterData) => {
    const res = await apiRegister(data);
    localStorage.setItem("token", res.token);
    setUser({ id: res.user.id, displayName: res.user.displayName });
    setConversations(res.conversations);
  }, []);

  const logout = useCallback(() => {
    localStorage.removeItem("token");
    disconnectChatSocket();
    setUser(null);
    setConversations(null);
  }, []);

  return (
    <AuthContext.Provider value={{ user, conversations, setConversations, loading, login, register, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
