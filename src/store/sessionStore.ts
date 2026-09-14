import { create } from "zustand";
import type { AuthState } from "@/types/auth";

export interface SessionCredentials {
  access_token: string;
  user_id: string | null;
  client_id: string;
}

interface SessionStore extends AuthState {
  isLoading: boolean;
  loggingIn: boolean;
  loginError: string | null;
  init: () => Promise<void>;
  login: () => Promise<void>;
  logout: () => Promise<void>;
  getAccessToken: () => Promise<string | null>;
  getSessionCredentials: () => Promise<SessionCredentials | null>;
}

export const useSessionStore = create<SessionStore>((set) => ({
  is_authenticated: false,
  user_id: null,
  isLoading: true,
  loggingIn: false,
  loginError: null,

  init: async () => {
    try {
      const isAuthenticated = await window.api.isAuthenticated();
      set({ is_authenticated: isAuthenticated, isLoading: false });
    } catch {
      set({ is_authenticated: false, isLoading: false });
    }
  },

  login: async () => {
    set({ loggingIn: true, loginError: null });
    try {
      const result = await window.api.login();
      set({
        is_authenticated: result.isAuthenticated,
        user_id: result.userId,
        loggingIn: false,
      });
    } catch (error) {
      set({
        loggingIn: false,
        loginError: `Login failed: ${error}`,
      });
    }
  },

  logout: async () => {
    await window.api.logout();
    set({ is_authenticated: false, user_id: null, loginError: null });
  },

  getAccessToken: async () => {
    return await window.api.getAccessToken();
  },

  getSessionCredentials: async () => {
    return await window.api.getSessionCredentials();
  },
}));