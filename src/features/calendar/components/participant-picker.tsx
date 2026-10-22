import * as React from "react";
import { CheckIcon } from "lucide-react";
import { HabitantAvatar, type Habitant } from "@/features/household";
import { cn } from "@/lib/utils";

type ParticipantPickerProps = {
  habitants: Habitant[];
  /** Form field name; one hidden input per selected habitant, in the order they were picked. */
  name: string;
  defaultValue?: string[];
  /** Accessible name of the group. */
  label: string;
  onChange?: (ids: string[]) => void;
  className?: string;
};

/**
 * Toggle who takes part, as avatar chips. A household has a handful of habitants, so all are shown at
 * once instead of in a search picker. The order of picking is kept: the first one colours the event.
 */
export function ParticipantPicker({ habitants, name, defaultValue = [], label, onChange, className }: ParticipantPickerProps) {
  const [selected, setSelected] = React.useState<string[]>(defaultValue);

  function toggle(id: string) {
    const next = selected.includes(id) ? selected.filter((value) => value !== id) : [...selected, id];
    setSelected(next);
    onChange?.(next);
  }

  return (
    <div role="group" aria-label={label} className={cn("flex flex-wrap gap-2", className)}>
      {selected.map((id) => (
        <input key={id} type="hidden" name={name} value={id} />
      ))}
      {habitants.map((habitant) => {
        const active = selected.includes(habitant.id);
        return (
          <button
            key={habitant.id}
            type="button"
            aria-pressed={active}
            onClick={() => toggle(habitant.id)}
            className={cn(
              "flex h-9 items-center gap-2 rounded-full border py-1 pr-3 pl-1 text-sm transition-colors outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50",
              active ? "border-transparent bg-accent font-medium text-accent-foreground" : "bg-background hover:bg-accent/50",
            )}
            style={active ? { boxShadow: `inset 0 0 0 2px ${habitant.color}` } : undefined}
          >
            <span className="relative">
              <HabitantAvatar habitant={habitant} size="sm" className="ring-0" />
              {active && (
                <span className="absolute -right-1 -bottom-1 grid size-3.5 place-items-center rounded-full bg-primary text-primary-foreground">
                  <CheckIcon className="size-2.5" aria-hidden="true" />
                </span>
              )}
            </span>
            {habitant.name}
          </button>
        );
      })}
    </div>
  );
}
