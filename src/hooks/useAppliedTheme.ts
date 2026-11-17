import { useEffect } from "react";
import { PREFERENCE_KEYS, readChoicePreference } from "@/lib/preferences";
import { isThemeChoice, resolveTheme } from "@/lib/theme";
import { usePreferencesStore } from "@/store/preferencesStore";

// Keeps the `dark` class of the document in step with the chosen theme and,
// for "system", with the operating system setting while the app is open.
export function useAppliedTheme(): void {
  const values = usePreferencesStore((state) => state.values);
  const load = usePreferencesStore((state) => state.load);
  const choice = readChoicePreference(values, PREFERENCE_KEYS.theme, isThemeChoice, "system");

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    const systemQuery = window.matchMedia("(prefers-color-scheme: dark)");
    const apply = () => {
      const theme = resolveTheme(choice, systemQuery.matches);
      document.documentElement.classList.toggle("dark", theme === "dark");
    };
    apply();
    systemQuery.addEventListener("change", apply);
    return () => systemQuery.removeEventListener("change", apply);
  }, [choice]);
}
