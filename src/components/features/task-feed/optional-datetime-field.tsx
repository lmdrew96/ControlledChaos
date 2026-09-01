"use client";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

interface OptionalDateTimeFieldProps {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  /** Helper copy under the input. Describe what the date MEANS, not how to skip it. */
  hint: string;
  children?: React.ReactNode;
}

/**
 * A datetime-local input that can honestly say it's empty.
 *
 * A `datetime-local` input is never visually blank — it always renders
 * `mm/dd/yyyy --:-- --`, so copy telling you to "leave it empty" describes a
 * state the control can't show. The only tell was the browser's placeholder
 * color, which is an accident of the user agent, not an affordance: it's
 * color-only, it differs per browser, and nothing announces it to a screen
 * reader.
 *
 * So the state gets said out loud — "Not set" when empty, an explicit Clear
 * when it isn't.
 */
export function OptionalDateTimeField({
  id,
  label,
  value,
  onChange,
  hint,
  children,
}: OptionalDateTimeFieldProps) {
  const isSet = Boolean(value);

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-2">
        <Label htmlFor={id}>{label}</Label>
        {isSet ? (
          <button
            type="button"
            onClick={() => onChange("")}
            className="text-xs text-muted-foreground underline-offset-2 transition-colors hover:text-foreground hover:underline"
          >
            Clear
          </button>
        ) : (
          <span className="text-xs text-muted-foreground/70">Not set</span>
        )}
      </div>
      <Input
        id={id}
        type="datetime-local"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className={cn(!isSet && "text-muted-foreground")}
      />
      <p className="text-xs text-muted-foreground">{hint}</p>
      {children}
    </div>
  );
}
