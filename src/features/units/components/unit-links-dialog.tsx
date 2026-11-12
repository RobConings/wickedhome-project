import { Text } from "@/components/ui/text";
import { Stack } from "@/components/layout/stack";
import { Inline } from "@/components/layout/inline";
import * as React from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Card } from "@/components/shared/card";
import { FormField } from "@/components/shared/form-field";
import { currentLocale } from "@/lib/i18n";
import { linkedUnits, unitOverview } from "@/types/unit-overview";
import type { UnitDefinition } from "@/types/units";

export function UnitLinksDialog({ initialUnit, units, usedUnits, onClose, onReturnFocus }: { initialUnit: string; units: UnitDefinition[]; usedUnits?: string[]; onClose: () => void; onReturnFocus: () => void }) {
  const { t } = useTranslation("units");
  const id = React.useId();
  const [name, setName] = React.useState(initialUnit);
  const [selected, setSelected] = React.useState(initialUnit);
  const result = React.useMemo(() => selected.trim() ? linkedUnits(selected, units, usedUnits) : null, [selected, units, usedUnits]);
  const numbers = new Intl.NumberFormat(currentLocale() === "nl" ? "nl-BE" : "en-BE", { maximumSignificantDigits: 10 });
  const links = result?.links.slice().sort((a, b) => Number(b.direct) - Number(a.direct) || a.unit.name.localeCompare(b.unit.name, currentLocale())) ?? [];

  return <Dialog open onOpenChange={(open) => { if (!open) onClose(); }}>
    <DialogContent className="max-h-[calc(100dvh-2rem)] overflow-y-auto sm:max-w-2xl" onCloseAutoFocus={(event) => { event.preventDefault(); onReturnFocus(); }}>
      <DialogHeader><DialogTitle>{t("links.title")}</DialogTitle><DialogDescription>{t("links.description")}</DialogDescription></DialogHeader>
      <form className="flex flex-wrap items-end gap-3" onSubmit={(event) => { event.preventDefault(); setSelected(name); }}>
        <FormField htmlFor={`${id}-unit`} label={t("links.unit")} className="min-w-0 flex-[1_1_12rem]">
          <Input id={`${id}-unit`} value={name} onChange={(event) => setName(event.target.value)} list={`${id}-names`} placeholder={t("links.placeholder")} autoComplete="off" autoFocus />
        </FormField>
        <datalist id={`${id}-names`}>{unitOverview(units, usedUnits).flatMap((unit) => [unit.name, ...unit.aliases]).map((name) => <option key={name} value={name} />)}</datalist>
        <Button type="submit">{t("links.show")}</Button>
      </form>
      {!selected.trim() ? <Text size="sm" tone="muted">{t("links.choose")}</Text> : !result ? <Text size="sm" tone="muted" role="status">{t("links.unknown", { name: selected })}</Text> : <Stack gap="3"  aria-live="polite">
        <Text weight="semibold">{t("links.summary", { name: result.unit.name, count: links.length })}</Text>
        {units.some((unit) => unit.isTerminal) && <Text size="sm" tone="muted">{t("links.terminalHelp")}</Text>}
        {result.unit.aliases.length > 0 && <Text size="sm" tone="muted" className="break-words">{t("aliasesSummary", { names: result.unit.aliases.join(", ") })}</Text>}
        {links.length ? <Card className="gap-0 divide-y px-4 py-1" role="list" aria-label={t("links.results")}>
          {links.map((link) => <Stack gap="xs" key={link.unit.name} role="listitem" className="py-3">
            <Inline gap="none" align="baseline" justify="between" wrap className="gap-x-3 gap-y-1"><Text size="sm" weight="medium" className="break-words tabular-nums">1 {result.unit.name} = {numbers.format(link.factor)} {link.unit.name}</Text><span className="text-xs text-muted-foreground">{t(link.direct ? "links.direct" : "links.indirect")}</span></Inline>
            <Text size="xs" tone="muted" className="break-words">{link.path.join(" → ")}</Text>
          </Stack>)}
        </Card> : <Text size="sm" tone="muted">{t(result.unit.source === "used" ? "links.unconfigured" : result.unit.needsDefinition ? "links.undefined" : "links.none")}</Text>}
      </Stack>}
    </DialogContent>
  </Dialog>;
}
