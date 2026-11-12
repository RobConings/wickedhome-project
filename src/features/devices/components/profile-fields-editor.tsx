import { FormField } from "@/components/shared/form-field";
import { Stack } from "@/components/layout/stack";
import { PageGrid } from "@/components/layout/page-grid";
import { Inline } from "@/components/layout/inline";
import { ArrowDownIcon, ArrowUpIcon, PlusIcon, Trash2Icon, XIcon } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { FIELD_TYPES, type DeviceField, type FieldType } from "../types/devices";
import { addField, moveItem, removeField, updateField, type ProfileDraft } from "./profile-draft";

type ProfileFieldsEditorProps = {
  draft: ProfileDraft;
  onChange: (draft: ProfileDraft) => void;
  disabled?: boolean;
};

/** The fields of a profile: add, reorder, rename, change type, options, and which one is primary. */
export function ProfileFieldsEditor({ draft, onChange, disabled }: ProfileFieldsEditorProps) {
  const { t } = useTranslation("devices");
  const set = (index: number, change: Partial<DeviceField>) => onChange(updateField(draft, index, change));

  return (
    <Stack gap="3">
      <ol className="flex flex-col gap-3">
        {draft.fields.map((field, index) => {
          const id = `field-${index}`;
          return (
            <li key={index} className="flex flex-col gap-3 rounded-lg border bg-background/50 p-3">
              <PageGrid gap="3" className="sm:grid-cols-[1fr_9rem_9rem_6rem]">
                <FormField htmlFor={`${id}-label`} label={<>{t("editor.fields.label")}</>}>
                  <Input id={`${id}-label`} value={field.label} maxLength={60} disabled={disabled} onChange={(event) => set(index, { label: event.target.value })} />
                </FormField>
                <FormField htmlFor={`${id}-key`} label={<>{t("editor.fields.key")}</>}>
                  <Input
                    id={`${id}-key`}
                    value={field.key}
                    maxLength={40}
                    disabled={disabled}
                    className="font-mono text-xs"
                    spellCheck={false}
                    onChange={(event) => set(index, { key: event.target.value.replace(/[^a-zA-Z0-9_]/g, "") })}
                  />
                </FormField>
                <Stack gap="1.5">
                  <Label htmlFor={`${id}-type`}>{t("editor.fields.type")}</Label>
                  <Select value={field.type} onValueChange={(type) => set(index, { type: type as FieldType })} disabled={disabled}>
                    <SelectTrigger id={`${id}-type`} className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {FIELD_TYPES.map((type) => (
                        <SelectItem key={type} value={type}>
                          {t(`fieldTypes.${type}`)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </Stack>
                {field.type === "number" ? (
                  <FormField htmlFor={`${id}-unit`} label={<>{t("editor.fields.unit")}</>}>
                    <Input id={`${id}-unit`} value={field.unit ?? ""} maxLength={12} placeholder="°C" disabled={disabled} onChange={(event) => set(index, { unit: event.target.value || null })} />
                  </FormField>
                ) : (
                  <span />
                )}
              </PageGrid>

              {field.type === "boolean" && (
                <PageGrid gap="3" className="sm:grid-cols-2">
                  <FormField htmlFor={`${id}-true`} label={<>{t("editor.fields.trueLabel")}</>}>
                    <Input id={`${id}-true`} value={field.trueLabel ?? ""} placeholder={t("value.yes")} maxLength={60} disabled={disabled} onChange={(event) => set(index, { trueLabel: event.target.value || null })} />
                  </FormField>
                  <FormField htmlFor={`${id}-false`} label={<>{t("editor.fields.falseLabel")}</>}>
                    <Input id={`${id}-false`} value={field.falseLabel ?? ""} placeholder={t("value.no")} maxLength={60} disabled={disabled} onChange={(event) => set(index, { falseLabel: event.target.value || null })} />
                  </FormField>
                </PageGrid>
              )}

              {field.type === "choice" && (
                <fieldset className="flex flex-col gap-2">
                  <legend className="mb-1 text-sm font-medium">{t("editor.fields.choices")}</legend>
                  {(field.choices ?? []).map((choice, choiceIndex) => (
                    <Inline gap="sm" align="center" key={choiceIndex}>
                      <Input
                        aria-label={t("editor.fields.choiceValue")}
                        value={choice.value}
                        className="w-40 font-mono text-xs"
                        spellCheck={false}
                        disabled={disabled}
                        onChange={(event) =>
                          set(index, {
                            choices: (field.choices ?? []).map((c, i) => (i === choiceIndex ? { ...c, value: event.target.value.toLowerCase().replace(/[^a-z0-9_]/g, "") } : c)),
                          })
                        }
                      />
                      <Input
                        aria-label={t("editor.fields.choiceLabel")}
                        value={choice.label}
                        maxLength={60}
                        disabled={disabled}
                        onChange={(event) =>
                          set(index, { choices: (field.choices ?? []).map((c, i) => (i === choiceIndex ? { ...c, label: event.target.value } : c)) })
                        }
                      />
                      <Button
                        type="button"
                        size="icon"
                        variant="ghost"
                        disabled={disabled || (field.choices?.length ?? 0) <= 1}
                        aria-label={t("editor.fields.removeChoice")}
                        onClick={() => set(index, { choices: (field.choices ?? []).filter((_, i) => i !== choiceIndex) })}
                      >
                        <XIcon />
                      </Button>
                    </Inline>
                  ))}
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    className="self-start"
                    disabled={disabled}
                    onClick={() => {
                      const choices = field.choices ?? [];
                      set(index, { choices: [...choices, { value: `option${choices.length + 1}`, label: t("editor.fields.newChoice", { number: choices.length + 1 }) }] });
                    }}
                  >
                    <PlusIcon />
                    {t("editor.fields.addChoice")}
                  </Button>
                </fieldset>
              )}

              <Inline gap="sm" align="center" justify="between" wrap>
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="radio"
                    name="primaryField"
                    className="size-4 accent-primary"
                    checked={draft.primaryField === field.key}
                    disabled={disabled}
                    onChange={() => onChange({ ...draft, primaryField: field.key })}
                  />
                  {t("editor.fields.primary")}
                </label>
                <Inline gap="xs" align="stretch">
                  <Button type="button" size="icon" variant="ghost" disabled={disabled || index === 0} aria-label={t("editor.moveUp")} onClick={() => onChange({ ...draft, fields: moveItem(draft.fields, index, -1) })}>
                    <ArrowUpIcon />
                  </Button>
                  <Button type="button" size="icon" variant="ghost" disabled={disabled || index === draft.fields.length - 1} aria-label={t("editor.moveDown")} onClick={() => onChange({ ...draft, fields: moveItem(draft.fields, index, 1) })}>
                    <ArrowDownIcon />
                  </Button>
                  <Button type="button" size="icon" variant="ghost" disabled={disabled || draft.fields.length <= 1} aria-label={t("editor.fields.remove")} onClick={() => onChange(removeField(draft, index))}>
                    <Trash2Icon />
                  </Button>
                </Inline>
              </Inline>
            </li>
          );
        })}
      </ol>
      <Button type="button" variant="outline" className="self-start" disabled={disabled || draft.fields.length >= 20} onClick={() => onChange(addField(draft, t("editor.fields.newField")))}>
        <PlusIcon />
        {t("editor.fields.add")}
      </Button>
    </Stack>
  );
}
