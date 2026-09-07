import { invoke } from "@tauri-apps/api/core";
import { create } from "zustand";
import type { AuthState } from "@/types/auth";

interface SessionStore extends AuthState {
  isLoading: boolean;
  loggingIn: boolean;
  loginError: string | null;
  init: () => Promise<void>;
  login: () => Promise<void>;
  logout: () => Promise<void>;
  getAccessToken: () => Promise<string>;
}

export const useSessionStore = create<SessionStore>((set) => ({
  is_authenticated: false,
  user_id: null,
  isLoading: true,
  loggingIn: false,
  loginError: null,

  init: async () => {
    try {
      const isAuth: boolean = await invoke("cmd_is_authenticated");
      set({ is_authenticated: isAuth, isLoading: false });
    } catch {
      set({ is_authenticated: false, isLoading: false });
    }
  },

  login: async () => {
    set({ loggingIn: true, loginError: null });
    try {
      const result: AuthState = await invoke("cmd_login");
      set({
        is_authenticated: result.is_authenticated,
        user_id: result.user_id,
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
    await invoke("cmd_logout");
    set({ is_authenticated: false, user_id: null, loginError: null });
  },

  getAccessToken: async () => {
    return await invoke("cmd_get_access_token");
  },
}));