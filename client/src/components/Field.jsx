import { cn } from "@/lib/utils";

export function Field({ label, hint, error, className, children }) {
  return (
    <label className={cn("block space-y-1.5", className)}>
      <span className="text-sm font-medium">{label}</span>
      {children}
      {error ? <span className="text-destructive block text-xs">{error}</span> : hint && <span className="text-muted-foreground block text-xs">{hint}</span>}
    </label>
  );
}
