import * as React from "react";
import { ArrowLeftIcon, ListTreeIcon } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { InlineAlert } from "./inline-alert";
import { cn } from "@/lib/utils";
import { fetchHaEntities } from "../data/home-assistant-requests";
import type { HaConnectionStatus, HaEntity } from "../types/home-assistant";
import { HaEntityBrowser } from "./ha-entity-browser";

export type HaEntityPickerProps = {
  /** Label of the device field being bound ("Temperature"). */
  fieldLabel: string;
  fieldType: "boolean" | "number" | "text" | "choice";
  /** Currently bound entity, if any. */
  selectedId?: string | null;
  /** The chosen entity and, optionally, the attribute to read instead of the state. */
  onPick: (entityId: string, attribute: string | null) => void;
  disabled?: boolean;
  /** Entities to show instead of loading them (stories). */
  entities?: HaEntity[];
  /** Status to show instead of loading it (stories). */
  status?: HaConnectionStatus;
};

/**
 * "Browse…" next to a device field's entity input: search Home Assistant's entities, pick one, then choose
 * whether to read its state or one of its attributes. Loads the entities when it opens.
 */
export function HaEntityPickerDialog({ fieldLabel, fieldType, selectedId, onPick, disabled, entities: given, status: givenStatus }: HaEntityPickerProps) {
  const { t } = useTranslation("home-assistant");
  const [open, setOpen] = React.useState(false);
  const [entities, setEntities] = React.useState<HaEntity[] | null>(given ?? null);
  const [status, setStatus] = React.useState<HaConnectionStatus | null>(givenStatus ?? null);
  const [failed, setFailed] = React.useState(false);
  const [chosen, setChosen] = React.useState<HaEntity | null>(null);
  const [attribute, setAttribute] = React.useState<string | null>(null);

  const load = React.useCallback(() => {
    setFailed(false);
    fetchHaEntities().then(
      (response) => {
        setEntities(response.entities);
        setStatus(response.status);
      },
      () => setFailed(true),
    );
  }, []);

  const openChange = (next: boolean) => {
    setOpen(next);
    if (next) {
      setChosen(null);
      setAttribute(null);
      if (!given) load();
    }
  };

  const confirm = (entity: HaEntity, value: string | null) => {
    onPick(entity.entityId, value);
    setOpen(false);
  };

  const pick = (entity: HaEntity) => {
    if (entity.attributeKeys.length === 0) confirm(entity, null);
    else {
      setChosen(entity);
      setAttribute(null);
    }
  };

  const unavailable = status && status.state !== "connected";

  return (
    <Dialog open={open} onOpenChange={openChange}>
      <DialogTrigger asChild>
        <Button type="button" variant="outline" size="sm" disabled={disabled}>
          <ListTreeIcon />
          {t("picker.browse")}
        </Button>
      </DialogTrigger>
      <DialogContent className="flex max-h-[90dvh] flex-col gap-4 sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{t("picker.title", { field: fieldLabel })}</DialogTitle>
          <DialogDescription>{chosen ? t("picker.attributeHint") : t(`picker.hint.${fieldType}`)}</DialogDescription>
        </DialogHeader>

        <div className="-mx-1 min-h-0 flex-1 overflow-y-auto px-1">
          {unavailable ? (
            <InlineAlert tone="error">{t(`status.${status.state}`)}: {t("picker.unavailable")}</InlineAlert>
          ) : chosen ? (
            <fieldset className="flex flex-col gap-1" aria-label={t("picker.readWhat")}>
              {[null, ...chosen.attributeKeys].map((key) => (
                <label
                  key={key ?? "__state"}
                  className={cn(
                    "flex min-h-10 cursor-pointer items-center gap-3 rounded-lg border px-3 py-2 text-sm",
                    attribute === key && "border-primary bg-accent",
                  )}
                >
                  <input type="radio" name="ha-attribute" checked={attribute === key} onChange={() => setAttribute(key)} className="size-4 accent-primary" />
                  <span className="flex min-w-0 flex-col">
                    <span className="font-medium">{key === null ? t("picker.state") : key}</span>
                    {key === null && (
                      <span className="text-xs text-muted-foreground">
                        {chosen.state}
                        {chosen.unit ? ` ${chosen.unit}` : ""}
                      </span>
                    )}
                  </span>
                </label>
              ))}
            </fieldset>
          ) : (
            <HaEntityBrowser
              entities={entities ?? []}
              loading={entities === null && !failed}
              error={failed}
              onRetry={load}
              fieldType={fieldType}
              selectedId={selectedId}
              onPick={pick}
              storageKey="ha-entity-picker"
            />
          )}
        </div>

        {chosen && (
          <DialogFooter className="gap-2">
            <Button type="button" variant="ghost" onClick={() => setChosen(null)}>
              <ArrowLeftIcon />
              {t("picker.back")}
            </Button>
            <Button type="button" onClick={() => confirm(chosen, attribute)}>
              {t("picker.use", { entity: chosen.name })}
            </Button>
          </DialogFooter>
        )}
      </DialogContent>
    </Dialog>
  );
}
