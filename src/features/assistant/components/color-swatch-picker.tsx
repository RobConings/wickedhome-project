import { CheckIcon } from "lucide-react";
import { cn } from "@/lib/utils";

type ColorSwatchPickerProps = {
  /** Form field name; the picker submits with native forms. */
  name: string;
  colors: readonly string[];
  defaultValue?: string;
  /** Accessible name of the group. */
  label: string;
  /** Called with the chosen colour, for live previews. */
  onChange?: (color: string) => void;
  className?: string;
};

/** Pick one colour from a fixed palette. Built on radio inputs, so keyboard and forms work natively. */
export function ColorSwatchPicker({ name, colors, defaultValue, label, onChange, className }: ColorSwatchPickerProps) {
  return (
    <div role="radiogroup" aria-label={label} className={cn("flex flex-wrap gap-2", className)}>
      {colors.map((color) => (
        <label key={color} className="relative cursor-pointer">
          <input
            type="radio"
            name={name}
            value={color}
            defaultChecked={color === defaultValue}
            onChange={() => onChange?.(color)}
            className="peer sr-only"
            aria-label={color}
          />
          <span
            className="grid size-8 place-items-center rounded-full ring-offset-2 ring-offset-background transition-shadow peer-checked:ring-2 peer-checked:ring-foreground peer-focus-visible:ring-2 peer-focus-visible:ring-ring [&>svg]:opacity-0 peer-checked:[&>svg]:opacity-100"
            style={{ backgroundColor: color }}
          >
            <CheckIcon className="size-4 text-white drop-shadow" aria-hidden="true" />
          </span>
        </label>
      ))}
    </div>
  );
}
