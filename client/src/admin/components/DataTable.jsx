import { Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * @param {object} props
 * @param {{ key: string, header: string, render?: (row: object) => React.ReactNode, align?: "left" | "right", className?: string }[]} props.columns
 *   `render` defaults to `row[key]`.
 * @param {object[]} props.rows
 * @param {(row: object) => string | number} [props.rowKey] Defaults to `row.id`.
 * @param {(row: object) => string | undefined} [props.rowClassName] Extra classes per row, e.g. a low-stock highlight.
 * @param {boolean} [props.isLoading]
 * @param {string} [props.emptyMessage]
 */
export function DataTable({ columns, rows, rowKey = (r) => r.id, rowClassName, isLoading, emptyMessage = "No records found." }) {
  return (
    <div className="bg-card overflow-hidden rounded-xl border shadow-xs">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-muted/60 text-muted-foreground text-left text-xs font-semibold tracking-wide uppercase">
            <tr>
              {columns.map((c) => (
                <th key={c.key} className={cn("px-4 py-3 whitespace-nowrap", c.align === "right" && "text-right", c.className)}>
                  {c.header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y">
            {isLoading ? (
              <tr>
                <td colSpan={columns.length} className="px-4 py-12 text-center">
                  <Loader2 className="text-muted-foreground mx-auto size-6 animate-spin" />
                </td>
              </tr>
            ) : rows.length === 0 ? (
              <tr>
                <td colSpan={columns.length} className="text-muted-foreground px-4 py-12 text-center">
                  {emptyMessage}
                </td>
              </tr>
            ) : (
              rows.map((row) => (
                <tr key={rowKey(row)} className={cn("hover:bg-muted/40 transition-colors", rowClassName?.(row))}>
                  {columns.map((c) => (
                    <td key={c.key} className={cn("px-4 py-3", c.align === "right" && "text-right tabular-nums", c.className)}>
                      {c.render ? c.render(row) : row[c.key]}
                    </td>
                  ))}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
