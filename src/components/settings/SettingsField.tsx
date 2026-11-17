import type { InputHTMLAttributes } from "react";
import { cn } from "@/lib/utils";

export const SETTINGS_INPUT_CLASS =
  "h-8 rounded-md border border-input bg-background px-2 text-sm outline-none focus-visible:border-ring";

// A labelled text input of the Settings forms.
export function SettingsField({
  label,
  className,
  ...inputProps
}: { label: string } & InputHTMLAttributes<HTMLInputElement>) {
  return (
    <label className="flex flex-col gap-1 text-sm">
      <span className="text-muted-foreground">{label}</span>
      <input aria-label={label} className={cn(SETTINGS_INPUT_CLASS, className)} {...inputProps} />
    </label>
  );
}
