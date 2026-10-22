import * as React from "react";
import { Input } from "@/components/ui/input";

type DraftNumberInputProps = Omit<React.ComponentProps<typeof Input>, "value" | "onChange" | "type"> & {
  value: number | null | undefined;
  onChange: (value: number | null) => void;
};

/**
 * A number field that lets people type freely ("18,", "-") and reports a number (or null when empty).
 * Accepts a comma or a dot as decimal separator.
 */
export function DraftNumberInput({ value, onChange, ...props }: DraftNumberInputProps) {
  const [text, setText] = React.useState(value === null || value === undefined ? "" : String(value));
  const [synced, setSynced] = React.useState(value);
  if (value !== synced) {
    // The value changed from outside (undo, another control): show it.
    setSynced(value);
    const parsed = Number(text.replace(",", "."));
    if (!(text !== "" && parsed === value)) setText(value === null || value === undefined ? "" : String(value));
  }
  return (
    <Input
      {...props}
      inputMode="decimal"
      value={text}
      onChange={(event) => {
        const next = event.target.value;
        setText(next);
        if (next.trim() === "") {
          setSynced(null);
          onChange(null);
          return;
        }
        const parsed = Number(next.replace(",", "."));
        if (Number.isFinite(parsed)) {
          setSynced(parsed);
          onChange(parsed);
        }
      }}
    />
  );
}
