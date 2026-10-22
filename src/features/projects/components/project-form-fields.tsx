import { CheckIcon } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { PROJECT_ICONS, PROJECT_TAG_SUGGESTIONS } from "../types/projects";
import { PROJECT_ICON_COMPONENTS } from "./project-icons";
import { ColorDot } from "@/components/shared/color-dot";

/*
 * The custom controls of the project form (plugged into `GeneralFormDialog` as `custom` fields). Each posts one
 * plain form value under `name`, so the shared form validates them with the schema like any other field.
 */

type ControlProps<T> = {
  id: string;
  name: string;
  value: T;
  onChange: (value: T) => void;
  disabled?: boolean;
};

/** A grid of icons in the project's colour; tap one to choose it. */
export function ProjectIconPicker({ id, name, value, onChange, color, disabled }: ControlProps<string> & { color: string }) {
  const { t } = useTranslation("projects");
  return (
    <div id={id} role="radiogroup" aria-label={t("fields.icon")} className="grid grid-cols-8 gap-1.5">
      <input type="hidden" name={name} value={value} />
      {PROJECT_ICONS.map((icon) => {
        const Icon = PROJECT_ICON_COMPONENTS[icon];
        const selected = value === icon;
        return (
          <button
            key={icon}
            type="button"
            role="radio"
            aria-checked={selected}
            aria-label={t(`icons.${icon}`)}
            title={t(`icons.${icon}`)}
            disabled={disabled}
            onClick={() => onChange(icon)}
            className={cn(
              "grid aspect-square min-h-10 place-items-center rounded-lg border outline-none transition-colors focus-visible:ring-[3px] focus-visible:ring-ring/50 [&_svg]:size-5",
              selected ? "border-transparent text-white" : "bg-card text-muted-foreground hover:bg-accent",
            )}
            style={selected ? { backgroundColor: color } : undefined}
          >
            <Icon aria-hidden="true" />
          </button>
        );
      })}
    </div>
  );
}

/** A free text tag with suggestions (renovation, holiday, trip…) and the household's own tags as chips. */
export function ProjectTagField({ id, name, value, onChange, ownTags = [], disabled }: ControlProps<string> & { ownTags?: string[] }) {
  const { t } = useTranslation("projects");
  const suggestions = [...new Set([...ownTags, ...PROJECT_TAG_SUGGESTIONS.map((key) => t(`tags.${key}`))])].slice(0, 12);
  return (
    <div className="flex flex-col gap-2">
      <Input
        id={id}
        name={name}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        maxLength={40}
        autoComplete="off"
        placeholder={t("placeholders.tag")}
        disabled={disabled}
        className="text-base sm:text-sm"
      />
      <div className="flex flex-wrap gap-1.5">
        {suggestions.map((tag) => (
          <button
            key={tag}
            type="button"
            disabled={disabled}
            onClick={() => onChange(tag)}
            aria-pressed={value === tag}
            className={cn(
              "min-h-8 rounded-full border px-3 text-xs font-medium transition-colors outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50",
              value === tag ? "border-primary bg-primary text-primary-foreground" : "bg-card hover:bg-accent",
            )}
          >
            {tag}
          </button>
        ))}
      </div>
    </div>
  );
}

type PlaceOption = { id: string; name: string; color: string; icon: string | null };

/** The rooms and zones of the project: tap to add or remove. Posts the ids comma-separated. */
export function ProjectPlacesField({ id, name, value, onChange, places, disabled }: ControlProps<string[]> & { places: PlaceOption[] }) {
  const { t } = useTranslation("projects");
  const toggle = (placeId: string) => onChange(value.includes(placeId) ? value.filter((idValue) => idValue !== placeId) : [...value, placeId]);
  if (places.length === 0) return <p className="text-sm text-muted-foreground">{t("form.noPlaces")}</p>;
  return (
    <div id={id} className="flex flex-wrap gap-1.5" role="group" aria-label={t("fields.places")}>
      <input type="hidden" name={name} value={value.join(",")} />
      {places.map((place) => {
        const selected = value.includes(place.id);
        return (
          <button
            key={place.id}
            type="button"
            disabled={disabled}
            aria-pressed={selected}
            onClick={() => toggle(place.id)}
            className={cn(
              "flex min-h-9 items-center gap-1.5 rounded-full border px-3 text-sm transition-colors outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50",
              selected ? "border-primary bg-accent font-medium" : "bg-card hover:bg-accent",
            )}
          >
            {selected ? (
              <CheckIcon className="size-3.5 text-primary" aria-hidden="true" />
            ) : place.icon ? (
              <span aria-hidden="true">{place.icon}</span>
            ) : (
              <ColorDot color={place.color} className="size-2.5 rounded-full" />
            )}
            {place.name}
          </button>
        );
      })}
    </div>
  );
}
