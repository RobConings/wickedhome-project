import * as React from "react";
import { useTranslation } from "react-i18next";
import { useFetcher } from "react-router";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { InlineAlert } from "./inline-alert";
import type { DevicesActionResult } from "../data/devices-loaders";
import { bindingsForProfile, VALUE_SOURCES, type Device, type DeviceProfile, type FieldBindingInput, type ValueSource } from "../types/devices";

/** What a route-provided entity picker gets for one field (the Home Assistant entity browser). */
export type DeviceEntityPickerProps = {
  fieldLabel: string;
  fieldType: DeviceProfile["fields"][number]["type"];
  selectedId: string | null;
  onPick: (entityId: string, attribute: string | null) => void;
  disabled?: boolean;
};

type DeviceBindingsFormProps = {
  device: Device;
  profile: DeviceProfile;
  /** A "Browse…" control per field, composed by the route (Home Assistant's entity browser). */
  renderEntityPicker?: (props: DeviceEntityPickerProps) => React.ReactNode;
};

/**
 * Where each field's value comes from: set by hand, or a Home Assistant entity (and optional attribute).
 * Once saved, the Home Assistant sync takes the entity's current state and follows it live.
 */
export function DeviceBindingsForm({ device, profile, renderEntityPicker }: DeviceBindingsFormProps) {
  const { t } = useTranslation("devices");
  const { t: tCommon } = useTranslation();
  const fetcher = useFetcher<DevicesActionResult>({ key: `device-bindings-${device.id}` });
  const initial = React.useMemo(
    () =>
      bindingsForProfile(profile, device.values).map(
        (binding): FieldBindingInput => ({
          fieldKey: binding.fieldKey,
          source: binding.source,
          haEntityId: binding.haEntityId,
          haAttribute: binding.haAttribute,
        }),
      ),
    [profile, device.values],
  );
  const [bindings, setBindings] = React.useState(initial);
  const dirty = JSON.stringify(bindings) !== JSON.stringify(initial);
  const saving = fetcher.state !== "idle";

  const handled = React.useRef<DevicesActionResult | undefined>(undefined);
  React.useEffect(() => {
    if (fetcher.state !== "idle" || !fetcher.data || handled.current === fetcher.data) return;
    handled.current = fetcher.data;
    if (fetcher.data.ok) toast.success(t("bindings.saved"));
  }, [fetcher.state, fetcher.data, t]);

  const update = (index: number, change: Partial<FieldBindingInput>) =>
    setBindings((current) => current.map((binding, i) => (i === index ? { ...binding, ...change } : binding)));

  return (
    <form
      className="flex flex-col gap-4"
      onSubmit={(event) => {
        event.preventDefault();
        const payload = bindings.map((binding) => ({
          ...binding,
          haEntityId: binding.haEntityId?.trim() || null,
          haAttribute: binding.haAttribute?.trim() || null,
        }));
        void fetcher.submit({ intent: "save-bindings", deviceId: device.id, bindings: payload }, { method: "post", encType: "application/json" });
      }}
    >
      {fetcher.data?.formError && fetcher.state === "idle" && <InlineAlert tone="error">{fetcher.data.formError}</InlineAlert>}
      <fieldset disabled={saving} className="contents">
      <ul className="flex flex-col gap-4">
        {profile.fields.map((field, index) => {
          const binding = bindings[index]!;
          const id = `binding-${device.id}-${field.key}`;
          return (
            <li key={field.key} className="grid gap-2 sm:grid-cols-[10rem_1fr_1fr_10rem] sm:items-end">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor={`${id}-source`}>{field.label}</Label>
                <Select value={binding.source} onValueChange={(source) => update(index, { source: source as ValueSource })}>
                  <SelectTrigger id={`${id}-source`} className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {VALUE_SOURCES.map((source) => (
                      <SelectItem key={source} value={source}>
                        {t(`bindings.sources.${source}`)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor={`${id}-entity`} className="text-xs text-muted-foreground">
                  {t("bindings.entity")}
                </Label>
                <Input
                  id={`${id}-entity`}
                  value={binding.haEntityId ?? ""}
                  onChange={(event) => update(index, { haEntityId: event.target.value })}
                  placeholder="binary_sensor.kitchen_window"
                  disabled={binding.source !== "home_assistant"}
                  autoComplete="off"
                  spellCheck={false}
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor={`${id}-attribute`} className="text-xs text-muted-foreground">
                  {t("bindings.attribute")}
                </Label>
                <Input
                  id={`${id}-attribute`}
                  value={binding.haAttribute ?? ""}
                  onChange={(event) => update(index, { haAttribute: event.target.value })}
                  placeholder={t("bindings.attributePlaceholder")}
                  disabled={binding.source !== "home_assistant"}
                  autoComplete="off"
                  spellCheck={false}
                />
              </div>
              <div className="flex items-center justify-between gap-2 sm:flex-col sm:items-start sm:justify-end">
                <span className="text-xs text-muted-foreground sm:pb-1">{t(`fieldTypes.${field.type}`)}{field.unit ? ` · ${field.unit}` : ""}</span>
                {renderEntityPicker?.({
                  fieldLabel: field.label,
                  fieldType: field.type,
                  selectedId: binding.haEntityId ?? null,
                  disabled: saving,
                  onPick: (entityId, attribute) => update(index, { source: "home_assistant", haEntityId: entityId, haAttribute: attribute }),
                })}
              </div>
            </li>
          );
        })}
      </ul>
      </fieldset>
      <p className="text-xs text-muted-foreground">{t("bindings.hint")}</p>
      <div className="flex justify-end">
        <Button type="submit" loading={saving} disabled={!dirty}>
          {saving ? tCommon("form.saving") : t("bindings.save")}
        </Button>
      </div>
    </form>
  );
}
