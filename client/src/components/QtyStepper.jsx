import { Minus, Plus } from "lucide-react";
import { cn } from "@/lib/utils";

export function QtyStepper({
  value,
  min = 1,
  max,
  onChange,
  disabled,
  size = "lg",
}
) {
  const set = (n) => onChange(Math.max(min, Math.min(max, Number.isFinite(n) ? Math.trunc(n) : min)));
  const btn = cn(
    "grid place-items-center text-muted-foreground hover:text-foreground disabled:opacity-40 outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50",
    size === "lg" ? "size-11" : "size-8",
  );
  return (
    <div className={cn("inline-flex items-center rounded-md border", disabled && "opacity-50")}>
      <button type="button" className={btn} onClick={() => set(value - 1)} disabled={disabled || value <= min} aria-label="Decrease quantity">
        <Minus className="size-4" />
      </button>
      <input
        type="number"
        inputMode="numeric"
        min={min}
        max={max}
        value={value}
        disabled={disabled}
        onChange={(e) => set(e.target.valueAsNumber)}
        className={cn(
          "w-12 bg-transparent text-center text-sm font-medium outline-none [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none",
          size === "lg" ? "h-11" : "h-8",
        )}
        aria-label="Quantity"
      />
      <button type="button" className={btn} onClick={() => set(value + 1)} disabled={disabled || value >= max} aria-label="Increase quantity">
        <Plus className="size-4" />
      </button>
    </div>
  );
}
