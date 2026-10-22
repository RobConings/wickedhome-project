import * as React from "react";
import { CheckIcon } from "lucide-react";
import { HabitantAvatar, type Habitant } from "@/features/household";
import { cn } from "@/lib/utils";

type AssigneePickerProps = {
  habitants: Habitant[];
  /** Form field name; one hidden input per selected habitant, in the order they were picked. */
  name: string;
  defaultValue?: string[];
  /** Accessible name of the group. */
  label: string;
  /** Id of the group, for `aria-describedby` and outer labels. */
  id?: string;
  onChange?: (ids: string[]) => void;
  className?: string;
};

/**
 * Who does it, as avatar chips: a household has a handful of habitants, so all are shown at once. The
 * order of picking is kept, because it is the rotation order (with numbers once several are picked).
 */
export function AssigneePicker({ habitants, name, defaultValue = [], label, id, onChange, className }: AssigneePickerProps) {
  const [selected, setSelected] = React.useState<string[]>(defaultValue);

  function toggle(habitantId: string) {
    const next = selected.includes(habitantId) ? selected.filter((value) => value !== habitantId) : [...selected, habitantId];
    setSelected(next);
    onChange?.(next);
  }

  return (
    <div id={id} role="group" aria-label={label} className={cn("flex flex-wrap gap-2", className)}>
      {selected.map((habitantId) => (
        <input key={habitantId} type="hidden" name={name} value={habitantId} />
      ))}
      {habitants.map((habitant) => {
        const position = selected.indexOf(habitant.id);
        const active = position >= 0;
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
                <span className="absolute -right-1 -bottom-1 grid size-3.5 place-items-center rounded-full bg-primary text-[0.6rem] leading-none font-semibold text-primary-foreground">
                  {selected.length > 1 ? position + 1 : <CheckIcon className="size-2.5" aria-hidden="true" />}
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
