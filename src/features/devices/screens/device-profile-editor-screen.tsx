import { FormField } from "@/components/shared/form-field";
import { FormGrid } from "@/components/layout/form-grid";
import { CardHeading } from "@/components/shared/card";
import { Inline } from "@/components/layout/inline";
import { PageGrid } from "@/components/layout/page-grid";
import { Stack } from "@/components/layout/stack";
import { Text } from "@/components/ui/text";
import * as React from "react";
import { SaveIcon, Trash2Icon } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useBeforeUnload, useFetcher } from "react-router";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { PageContainer } from "@/components/layout/page-container";
import { Card, CardHeader, CardTitle } from "@/components/shared/card";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { InlineAlert } from "@/components/shared/inline-alert";
import { PageHeader } from "@/components/shared/page-header";
import { DeviceIcon } from "../components/device-icon";
import { DeviceIconSelect } from "../components/device-icon-select";
import { DraftNumberInput } from "../components/draft-number-input";
import { blankDraft, toDraft, type ProfileDraft } from "../components/profile-draft";
import { ProfileFieldsEditor } from "../components/profile-fields-editor";
import { ProfilePreview } from "../components/profile-preview";
import { ProfileRulesEditor } from "../components/profile-rules-editor";
import { ToneSelect } from "../components/tone-select";
import type { DevicesActionResult } from "../data/devices-loaders";
import { DEVICE_CATEGORIES, deviceProfileInputSchema, type DeviceCategory, type DeviceProfile, type FieldValue } from "../types/devices";
import { evaluateIndicator } from "../types/indicator";

type DeviceProfileEditorScreenProps = {
  /** The profile to edit, or null for a new one. */
  profile: DeviceProfile | null;
  canManage: boolean;
  /** Sample values for the preview to start with (stories). */
  initialSampleValues?: Record<string, FieldValue>;
};

/** Edit a profile's fields and indicator rules, with a live preview against sample values. */
export function DeviceProfileEditorScreen({ profile, canManage, initialSampleValues = {} }: DeviceProfileEditorScreenProps) {
  const { t } = useTranslation("devices");
  const { t: tCommon } = useTranslation();
  const initial = React.useMemo(() => (profile ? toDraft(profile) : blankDraft(t("editor.fields.defaultField"))), [profile, t]);
  const [draft, setDraft] = React.useState<ProfileDraft>(initial);
  const [saved, setSaved] = React.useState<ProfileDraft>(initial);
  const [samples, setSamples] = React.useState<Record<string, FieldValue>>(initialSampleValues);
  const [issues, setIssues] = React.useState<string[]>([]);
  const fetcher = useFetcher<DevicesActionResult>({ key: `profile-editor-${profile?.id ?? "new"}` });
  const remove = useFetcher<DevicesActionResult>({ key: `profile-delete-${profile?.id ?? "new"}` });
  const saving = fetcher.state !== "idle";
  const dirty = draft !== saved;
  const readOnly = !canManage;

  useBeforeUnload(
    React.useCallback(
      (event: BeforeUnloadEvent) => {
        if (dirty) event.preventDefault();
      },
      [dirty],
    ),
  );

  const handled = React.useRef<DevicesActionResult | undefined>(undefined);
  const submitted = React.useRef<ProfileDraft | null>(null);
  React.useEffect(() => {
    const result = fetcher.data;
    if (fetcher.state !== "idle" || !result || handled.current === result) return;
    handled.current = result;
    if (result.ok) {
      if (submitted.current) setSaved(submitted.current);
      toast.success(t("editor.saved"));
    } else {
      toast.error(result.formError ?? t("editor.invalid"));
    }
  }, [fetcher.state, fetcher.data, t]);

  const result = React.useMemo(() => evaluateIndicator(draft, samples), [draft, samples]);

  function save() {
    const parsed = deviceProfileInputSchema.safeParse(draft);
    if (!parsed.success) {
      setIssues(parsed.error.issues.slice(0, 5).map((issue) => `${describePath(issue.path, draft, t)}: ${issue.message}`));
      return;
    }
    setIssues([]);
    submitted.current = draft;
    void fetcher.submit({ intent: "save", profile: parsed.data }, { method: "post", encType: "application/json" });
  }

  return (
    <PageContainer className="max-w-7xl">
      <PageHeader
        backTo="/devices/profiles"
        title={
          <span className="flex items-center gap-3">
            <span className="grid size-10 shrink-0 place-items-center rounded-lg bg-section-soft text-section">
              <DeviceIcon icon={draft.icon} className="size-5" />
            </span>
            {draft.name || (profile ? profile.name : t("editor.newTitle"))}
          </span>
        }
        description={profile ? t("profiles.deviceCount", { count: profile.deviceCount }) : t("editor.newDescription")}
        actions={
          canManage && (
            <Inline gap="sm" align="center" wrap>
              <span className="text-sm text-muted-foreground" aria-live="polite">
                {saving ? tCommon("form.saving") : dirty ? t("editor.unsaved") : ""}
              </span>
              {profile && (
                <ConfirmDialog
                  trigger={
                    <Button variant="outline" disabled={profile.deviceCount > 0} title={profile.deviceCount > 0 ? t("profiles.delete.inUse") : undefined}>
                      <Trash2Icon />
                      {tCommon("actions.delete")}
                    </Button>
                  }
                  title={t("profiles.delete.title", { name: profile.name })}
                  description={t("profiles.delete.description")}
                  confirmLabel={tCommon("actions.delete")}
                  cancelLabel={tCommon("actions.cancel")}
                  destructive
                  onConfirm={() => remove.submit({ intent: "delete" }, { method: "post", encType: "application/json" })}
                />
              )}
              <Button onClick={save} loading={saving} disabled={!dirty && Boolean(profile)}>
                <SaveIcon />
                {saving ? tCommon("form.saving") : tCommon("actions.save")}
              </Button>
            </Inline>
          )
        }
      />

      {readOnly && <InlineAlert>{t("editor.readOnly")}</InlineAlert>}
      {issues.length > 0 && (
        <InlineAlert tone="error">
          <span className="flex flex-col gap-1">
            <span className="font-medium">{t("editor.invalid")}</span>
            {issues.map((issue) => (
              <span key={issue}>{issue}</span>
            ))}
          </span>
        </InlineAlert>
      )}
      {remove.data?.formError && <InlineAlert tone="error">{remove.data.formError}</InlineAlert>}

      <PageGrid gap="lg" className="lg:grid-cols-[minmax(0,1fr)_22rem]">
        <fieldset disabled={saving} aria-busy={saving || undefined} className="flex min-w-0 flex-col gap-6">
          <Card>
            <CardHeader>
              <CardTitle>{t("editor.general")}</CardTitle>
            </CardHeader>
            <FormGrid>
              <FormField htmlFor="profile-name" label={<>{t("fields.name")}</>} className="sm:col-span-2">
                <Input
                  id="profile-name"
                  value={draft.name}
                  maxLength={60}
                  placeholder={t("editor.namePlaceholder")}
                  disabled={readOnly}
                  onChange={(event) => setDraft({ ...draft, name: event.target.value })}
                />
              </FormField>
              <Stack gap="1.5">
                <Label htmlFor="profile-icon">{t("editor.icon")}</Label>
                <DeviceIconSelect id="profile-icon" value={draft.icon} disabled={readOnly} onChange={(icon) => icon && setDraft({ ...draft, icon })} />
              </Stack>
              <Stack gap="1.5">
                <Label htmlFor="profile-category">{t("editor.category")}</Label>
                <Select value={draft.category} disabled={readOnly} onValueChange={(category) => setDraft({ ...draft, category: category as DeviceCategory })}>
                  <SelectTrigger id="profile-category" className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {DEVICE_CATEGORIES.map((category) => (
                      <SelectItem key={category} value={category}>
                        {t(`categories.${category}`)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Stack>
              <FormField htmlFor="profile-stale" label={<>{t("editor.staleAfter")}</>} description={<>{t("editor.staleHint")}</>}>
                <DraftNumberInput
                  id="profile-stale"
                  value={draft.staleAfterMinutes}
                  placeholder={t("editor.staleNever")}
                  disabled={readOnly}
                  onChange={(value) => setDraft({ ...draft, staleAfterMinutes: value === null ? null : Math.max(1, Math.round(value)) })}
                />
              </FormField>
            </FormGrid>
          </Card>

          <Card>
            <CardHeader>
              <CardHeading title={<>{t("editor.fields.title")}</>} description={<>{t("editor.fields.description")}</>} />
            </CardHeader>
            <ProfileFieldsEditor draft={draft} onChange={setDraft} disabled={readOnly} />
          </Card>

          <Card>
            <CardHeader>
              <CardHeading title={<>{t("editor.rules.title")}</>} description={<>{t("editor.rules.description")}</>} />
            </CardHeader>
            <ProfileRulesEditor draft={draft} onChange={setDraft} matchedRuleId={result.ruleId} disabled={readOnly} />
            <PageGrid gap="md" className="border-t pt-4 sm:grid-cols-[10rem_1fr]">
              <Stack gap="1.5">
                <Label htmlFor="profile-fallback-tone">{t("editor.fallbackTone")}</Label>
                <ToneSelect id="profile-fallback-tone" value={draft.fallbackTone} disabled={readOnly} onChange={(fallbackTone) => setDraft({ ...draft, fallbackTone })} />
              </Stack>
              <FormField htmlFor="profile-fallback-label" label={<>{t("editor.fallbackLabel")}</>}>
                <Input
                  id="profile-fallback-label"
                  value={draft.fallbackLabel ?? ""}
                  maxLength={60}
                  placeholder={t("state.unknown")}
                  disabled={readOnly}
                  onChange={(event) => setDraft({ ...draft, fallbackLabel: event.target.value || null })}
                />
              </FormField>
              <Text size="xs" tone="muted" className="sm:col-span-2">{t("editor.fallbackHint")}</Text>
            </PageGrid>
          </Card>
        </fieldset>

        <Card className="h-fit lg:sticky lg:top-6">
          <CardHeader>
            <CardHeading title={<>{t("editor.preview.title")}</>} description={<>{t("editor.preview.description")}</>} />
          </CardHeader>
          <ProfilePreview draft={draft} values={samples} onValuesChange={setSamples} result={result} />
        </Card>
      </PageGrid>
    </PageContainer>
  );
}

/** "Rule 2 · Value" instead of "rules.1.value". */
function describePath(path: PropertyKey[], draft: ProfileDraft, t: (key: string, options?: Record<string, unknown>) => string): string {
  const [section, index, key] = path;
  if (section === "fields" && typeof index === "number") return `${t("editor.fields.title")} · ${draft.fields[index]?.label || index + 1}${key ? ` (${String(key)})` : ""}`;
  if (section === "rules" && typeof index === "number") return `${t("editor.rules.ruleNumber", { number: index + 1 })}${key ? ` (${String(key)})` : ""}`;
  return String(section ?? "");
}
