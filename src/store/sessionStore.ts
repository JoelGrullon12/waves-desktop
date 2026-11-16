import { create } from "zustand";
import type { AuthState } from "@/types/auth";

interface SessionStore extends AuthState {
  isLoading: boolean;
  loggingIn: boolean;
  loginError: string | null;
  credentialsConfigured: boolean;
  isWebSessionConnected: boolean;
  webLoginPending: boolean;
  webLoginError: string | null;
  init: () => Promise<void>;
  saveCredentials: (clientId: string, clientSecret: string) => Promise<void>;
  login: () => Promise<void>;
  logout: () => Promise<void>;
  webLogin: () => Promise<void>;
  webLogout: () => Promise<void>;
}

export const useSessionStore = create<SessionStore>((set) => ({
  is_authenticated: false,
  user_id: null,
  isLoading: true,
  loggingIn: false,
  loginError: null,
  credentialsConfigured: false,
  isWebSessionConnected: false,
  webLoginPending: false,
  webLoginError: null,

  init: async () => {
    try {
      const [credentialsStatus, isAuthenticated, webSessionConnected] = await Promise.all([
        window.api.getCredentialsStatus(),
        window.api.isAuthenticated(),
        window.api.isWebSessionConnected(),
      ]);
      set({
        credentialsConfigured: credentialsStatus.configured,
        is_authenticated: isAuthenticated,
        isWebSessionConnected: webSessionConnected,
        isLoading: false,
      });
    } catch {
      set({ is_authenticated: false, isLoading: false });
    }
  },

  saveCredentials: async (clientId, clientSecret) => {
    set({ loginError: null });
    try {
      const result = await window.api.saveCredentials(clientId, clientSecret);
      set({
        credentialsConfigured: result.success,
        loginError: result.success ? null : (result.error ?? "Could not save the credentials."),
      });
    } catch (error) {
      set({ loginError: `Could not save the credentials: ${error}` });
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
        webLoginPending: false,
        isWebSessionConnected: result.success,
        webLoginError: result.success ? null : (result.error ?? "Connection failed."),
      });
    } catch (error) {
      set({
        webLoginPending: false,
        webLoginError: `Full playback connection failed: ${error}`,
      });
    }
  },

  webLogout: async () => {
    await window.api.webLogout();
    set({ isWebSessionConnected: false, webLoginPending: false, webLoginError: null });
  },
}));