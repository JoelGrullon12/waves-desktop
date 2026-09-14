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
  isWebSessionConnected: boolean;
  webLoginPending: boolean;
  webLoginError: string | null;
  init: () => Promise<void>;
  login: () => Promise<void>;
  logout: () => Promise<void>;
  webLogin: () => Promise<void>;
  completeWebLogin: (pasted: string) => Promise<void>;
  webLogout: () => Promise<void>;
  getAccessToken: () => Promise<string | null>;
  getSessionCredentials: () => Promise<SessionCredentials | null>;
  getWebSessionCredentials: () => Promise<SessionCredentials | null>;
}

export const useSessionStore = create<SessionStore>((set) => ({
  is_authenticated: false,
  user_id: null,
  isLoading: true,
  loggingIn: false,
  loginError: null,
  isWebSessionConnected: false,
  webLoginPending: false,
  webLoginError: null,

  init: async () => {
    try {
      const [isAuthenticated, webSessionConnected] = await Promise.all([
        window.api.isAuthenticated(),
        window.api.isWebSessionConnected(),
      ]);
      set({
        is_authenticated: isAuthenticated,
        isWebSessionConnected: webSessionConnected,
        isLoading: false,
      });
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

  webLogin: async () => {
    set({ webLoginPending: true, webLoginError: null });
    try {
      const result = await window.api.webLogin();
      set({
        webLoginPending: result.pending,
        isWebSessionConnected: result.success && !result.pending,
        webLoginError: result.success ? null : (result.error ?? "Connection failed."),
      });
    } catch (error) {
      set({
        webLoginPending: false,
        webLoginError: `Full playback connection failed: ${error}`,
      });
    }
  },

  completeWebLogin: async (pasted: string) => {
    set({ webLoginError: null });
    try {
      const result = await window.api.completeWebLogin(pasted);
      set({
        webLoginPending: result.success ? false : true,
        isWebSessionConnected: result.success,
        webLoginError: result.success ? null : (result.error ?? "Connection failed."),
      });
    } catch (error) {
      set({ webLoginError: `Full playback connection failed: ${error}` });
    }
  },

  webLogout: async () => {
    await window.api.webLogout();
    set({ isWebSessionConnected: false, webLoginPending: false, webLoginError: null });
  },

  getAccessToken: async () => {
    return await window.api.getAccessToken();
  },

  getSessionCredentials: async () => {
    return await window.api.getSessionCredentials();
  },

  getWebSessionCredentials: async () => {
    return await window.api.getWebSessionCredentials();
  },
}));