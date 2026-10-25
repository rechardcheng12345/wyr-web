import { cn } from "@/lib/utils";

/**
 * Label + control + optional error.
 * @param {object} props
 * @param {string} props.label
 * @param {string} [props.htmlFor]
 * @param {string} [props.error]
 * @param {string} [props.className]
 * @param {React.ReactNode} props.children
 */
export function FormField({ label, htmlFor, error, className, children }) {
  return (
    <div className={cn("flex flex-col gap-1.5", className)}>
      <label htmlFor={htmlFor} className="text-sm font-medium">
        {label}
      </label>
      {children}
      {error && <p className="text-destructive text-xs">{error}</p>}
    </div>
  );
}

export function Select({ className, children, ...props }) {
  return (
    <select
      className={cn(
        "border-input h-9 w-full rounded-md border bg-transparent px-3 text-base shadow-xs outline-none md:text-sm",
        "focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px]",
        className,
      )}
      {...props}
    >
      {children}
    </select>
  );
}
