const BASE = "/api";

function getToken(): string | null {
  return localStorage.getItem("token");
}

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const token = getToken();
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...((options.headers as Record<string, string>) ?? {}),
  };
  if (token) {
    headers["Authorization"] = `Bearer ${token}`;
  }

  const res = await fetch(`${BASE}${path}`, { ...options, headers });

  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error ?? `Request failed (${res.status})`);
  }

  return res.json() as Promise<T>;
}

// ─── Auth ────────────────────────────────────────────────────────────────────

export interface LoginResponse {
  token: string;
  employee: { id: string; displayName: string | null; employeeIdentity: Record<string, unknown> | null };
}

export function login(empId: string, password: string) {
  return request<LoginResponse>("/auth/login", {
    method: "POST",
    body: JSON.stringify({ empId, password }),
  });
}

export function getMe() {
  return request<{ id: string; displayName: string | null }>("/auth/me");
}

// ─── Sessions ────────────────────────────────────────────────────────────────

export interface Session {
  id: string;
  threadId: string;
  empId: string;
  title: string | null;
  createdAt: string;
  updatedAt: string;
}

export function getSessions() {
  return request<Session[]>("/sessions");
}

export function createSession(title?: string) {
  return request<Session>("/sessions", {
    method: "POST",
    body: JSON.stringify({ title }),
  });
}

// ─── Chat ────────────────────────────────────────────────────────────────────

export interface ChatResponse {
  threadId: string;
  reply: string;
  systemPrompt: string | null;
}

export function sendMessage(threadId: string, message: string) {
  return request<ChatResponse>("/chat", {
    method: "POST",
    body: JSON.stringify({ threadId, message }),
  });
}
