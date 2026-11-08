import type { ComponentProps } from "react";
import { XIcon } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { EntityPicker, type EntityPickerItem } from "./entity-picker";

type Props = Omit<ComponentProps<typeof EntityPicker>, "items" | "value" | "onChange" | "defaultValue" | "clearable"> & {
  items: EntityPickerItem[];
  value: readonly string[];
  onChange: (values: string[]) => void;
};

/** Add from the familiar picker and remove from generous selected rows; no checkbox matrix. */
export function EntityMultiPicker({ items, value, onChange, name, disabled, ...props }: Props) {
  const { t } = useTranslation();
  const selected = new Set(value);
  return <div className="flex min-w-0 flex-col gap-2">
    {name && <input type="hidden" name={name} value={value.join(",")} />}
    <EntityPicker {...props} disabled={disabled} items={items.filter((item) => !selected.has(item.id))} value={null}
      onChange={(id) => { if (id) onChange([...new Set([...value, id])]); }} />
    {value.length > 0 && <ul className="grid min-w-0 gap-2 sm:grid-cols-2">
      {value.map((id) => {
        const item = items.find((candidate) => candidate.id === id);
        return <li key={id} className="flex min-h-12 min-w-0 items-center gap-2 rounded-xl border bg-card py-1 pr-1 pl-3">
          {item?.leading}<span className="min-w-0 flex-1 break-words text-sm font-medium">{item?.label ?? t("picker.unavailable")}</span>
          <Button type="button" variant="ghost" size="icon" className="size-11 shrink-0" disabled={disabled}
            aria-label={t("picker.removeSelection", { name: item?.label ?? t("picker.unavailable") })}
            onClick={() => onChange(value.filter((value) => value !== id))}><XIcon /></Button>
        </li>;
      })}
    </ul>}
  </div>;
}
