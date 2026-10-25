import { Card, CardContent } from "@/components/ui/card";

/**
 * @param {object} props
 * @param {string} props.label
 * @param {React.ReactNode} props.value
 * @param {React.ComponentType} [props.icon] A lucide-react icon component.
 * @param {string} [props.hint] Small text under the value.
 */
export function StatCard({ label, value, icon: Icon, hint }) {
  return (
    <Card>
      <CardContent className="flex items-start justify-between gap-4 p-5">
        <div className="min-w-0">
          <p className="text-muted-foreground text-sm font-medium">{label}</p>
          <p className="mt-2 truncate text-2xl font-bold tabular-nums">{value}</p>
          {hint && <p className="text-muted-foreground mt-1 text-xs">{hint}</p>}
        </div>
        {Icon && (
          <div className="bg-accent text-primary rounded-lg p-2">
            <Icon className="size-5" />
          </div>
        )}
      </CardContent>
    </Card>
  );
}
