import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { Stack } from "@/components/layout/stack";
import { FormField } from "@/components/shared/form-field";
import { Textarea } from "@/components/ui/textarea";
import { Text } from "@/components/ui/text";

/** Normal-browser import UI; each retailer owns parsing, validation and storage of its credentials. */
export function RetailerBrowserImport({ id, steps, onImport, disabled, description, readyLabel, privacy, alternative, actions, footer }: {
  id: string;
  steps: readonly string[];
  onImport: (text: string) => void;
  disabled: boolean;
  description?: string;
  readyLabel?: string;
  privacy: string;
  alternative?: ReactNode;
  actions: ReactNode;
  footer?: ReactNode;
}) {
  const { t } = useTranslation("shopping");
  return <Stack gap="3" className="mt-3 min-w-0 text-sm">
    {description && <Text>{description}</Text>}
    <ol className="list-decimal space-y-2 pl-5">{steps.map((step, index) => <li key={index}>{step}</li>)}</ol>
    <FormField htmlFor={id} label={t("xtra.browserData")} description={privacy}>
      <Textarea id={id} value="" autoComplete="off" spellCheck={false} disabled={disabled} placeholder={t("xtra.browserPlaceholder")} className="min-h-20"
        onPaste={(event) => { event.preventDefault(); onImport(event.clipboardData.getData("text/plain")); }}
        onChange={(event) => { if (event.target.value) onImport(event.target.value); }} />
    </FormField>
    {readyLabel && <Text role="status" size="sm" tone="primary">{readyLabel}</Text>}
    {alternative}
    {actions}
    {footer}
  </Stack>;
}
