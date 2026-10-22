import * as React from "react";
import { useTranslation } from "react-i18next";
import { Form, useActionData, useFetcher, useNavigation } from "react-router";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { FormGrid, FormGridItem } from "@/components/layout/form-grid";
import { Inline } from "@/components/layout/inline";
import { PageSection } from "@/components/layout/page-section";
import { Stack } from "@/components/layout/stack";
import { ColorSwatchPicker } from "@/components/shared/color-swatch-picker";
import { FormField } from "@/components/shared/form-field";
import { InlineAlert } from "@/components/shared/inline-alert";
import { MoneyInput } from "@/components/shared/money-input";
import { parseForm, type FormResult } from "@/lib/forms";

/** The form's current values: strings for inputs, booleans for switches, cents (or null) for money. */
export type GeneralFormValues = Record<string, unknown>;

export type GeneralFormOption = { value: string; label: React.ReactNode; icon?: React.ReactNode };

/** What a `custom` field's `render` gets, so a feature can plug in its own control (pickers…). */
export type GeneralFormCustomFieldProps = {
  /** Put this on the control, so the label points at it. */
  id: string;
  /** Submit the value under this name (e.g. `<EntityPicker name={name} />` or a hidden input). */
  name: string;
  value: unknown;
  /** Update the value (for `when` conditions and previews); clears the field's error. */
  setValue: (value: unknown) => void;
  values: GeneralFormValues;
  errors?: string[];
  /** Errors of another posted name (a control that posts several values, see `errorNames`). */
  errorsFor: (name: string) => string[] | undefined;
  invalid: boolean;
  /** Ids of the description and error, for `aria-describedby`. */
  describedBy?: string;
  disabled: boolean;
};

type FieldBase = {
  /** Field name in the submitted form and in the schema. */
  name: string;
  label: React.ReactNode;
  description?: React.ReactNode;
  placeholder?: string;
  /** Show "(optional)". Detected from a zod object schema when left out. */
  optional?: boolean;
  /** Width from `sm` up: the full row (default) or half of it. Phones always use the full width. */
  span?: "full" | "half";
  hidden?: boolean;
  /** Only show (and submit) the field while this returns true. */
  when?: (values: GeneralFormValues) => boolean;
  disabled?: boolean;
  autoFocus?: boolean;
  /**
   * Other names this (custom) field posts and shows the errors of itself (with `errorsFor`), e.g. a payer
   * editor posting `payerType` and `shares`: their errors are then not repeated above the form.
   */
  errorNames?: readonly string[];
};

export type GeneralFormField =
  | (FieldBase & {
      type: "text";
      inputType?: "text" | "email" | "url" | "tel" | "password";
      inputMode?: React.HTMLAttributes<HTMLInputElement>["inputMode"];
      autoComplete?: string;
      maxLength?: number;
    })
  | (FieldBase & { type: "textarea"; rows?: number; maxLength?: number })
  | (FieldBase & {
      type: "number";
      min?: number;
      max?: number;
      step?: number | "any";
      inputMode?: "numeric" | "decimal";
    })
  | (FieldBase & { type: "money" })
  | (FieldBase & { type: "date"; min?: string; max?: string })
  | (FieldBase & { type: "select"; options: readonly GeneralFormOption[] })
  | (FieldBase & { type: "switch" })
  /** A palette (`colors`) as swatches, or the browser's colour picker without one. */
  | (FieldBase & { type: "color"; colors?: readonly string[] })
  | (FieldBase & {
      type: "custom";
      render: (field: GeneralFormCustomFieldProps) => React.ReactNode;
      /** Render without the label, description and errors around it (the control draws its own). */
      bare?: boolean;
    });

export type GeneralFormSection = {
  title?: React.ReactNode;
  description?: React.ReactNode;
  fields: readonly GeneralFormField[];
};

export type GeneralFormProps<R extends FormResult = FormResult> = {
  /** The fields, in order. Use `sections` instead to group them under titles. */
  fields?: readonly GeneralFormField[];
  sections?: readonly GeneralFormSection[];
  /** Validates in the browser before posting (the same schema the action uses). Errors show per field. */
  schema?: z.ZodType;
  /** Starting values by field name (e.g. the item being edited). */
  defaultValues?: GeneralFormValues;
  /** Posted as `intent`, so one route action can handle several forms. */
  intent?: string;
  /** Extra hidden inputs, e.g. `{ id: item.id }`. Empty values are left out. */
  hiddenFields?: Record<string, string | number | null | undefined>;
  /** Route to post to; defaults to the current route's action. */
  action?: string;
  method?: "post" | "put" | "patch" | "delete";
  /** Content above the fields, e.g. an `InlineAlert` notice. */
  intro?: React.ReactNode;
  submitLabel?: React.ReactNode;
  /** Shows a Cancel button. */
  onCancel?: () => void;
  cancelLabel?: React.ReactNode;
  /** Called once each time the action succeeded (`ok: true`, or your `isSuccess`). */
  onSuccess?: (result: R) => void;
  isSuccess?: (result: R) => boolean;
  onSubmittingChange?: (submitting: boolean) => void;
  /** Called with the values whenever they change (live previews). */
  onValuesChange?: (values: GeneralFormValues) => void;
  /**
   * Adjust other fields when one changes: gets the new values, the previous ones and the changed field's
   * name, returns the values to use (e.g. keep an event's duration when its start moves).
   */
  adjustValues?: (next: GeneralFormValues, previous: GeneralFormValues, changed: string) => GeneralFormValues;
  /** Turns error messages of the schema or the action (e.g. error codes) into text. */
  translateError?: (message: string) => string;
  /** Wrap the Cancel/Save buttons, e.g. in a `DialogFooter`. */
  renderActions?: (buttons: React.ReactNode) => React.ReactNode;
  /** Label of the Save button while saving (default "Saving…"). */
  submittingLabel?: React.ReactNode;
  /** A large Save button (pages built around one form, like login). */
  submitSize?: "default" | "lg";
  /**
   * Submit with a normal navigation (`<Form replace>`) instead of a fetcher, for forms whose action
   * redirects to another page (login, setup, invite links). Busy until the next page has loaded; the
   * result comes from `result` or the route's action data.
   */
  navigate?: boolean;
  /** Navigate mode: the action's result, when the screen passes it down. Defaults to `useActionData()`. */
  result?: R;
  /** Show the busy state regardless (stories). */
  busy?: boolean;
  className?: string;
};

const isOptionalInSchema = (schema: z.ZodType | undefined, name: string): boolean => {
  if (!(schema instanceof z.ZodObject)) return false;
  const field = (schema.shape as Record<string, z.ZodType | undefined>)[name];
  return field ? field.safeParse(undefined).success : false;
};

const allFieldsOf = (fields?: readonly GeneralFormField[], sections?: readonly GeneralFormSection[]) => [
  ...(fields ?? []),
  ...(sections ?? []).flatMap((section) => section.fields),
];

function initialValue(field: GeneralFormField, raw: unknown): unknown {
  switch (field.type) {
    case "switch":
      return raw === true || raw === "on" || raw === "true";
    case "money":
      return typeof raw === "number" ? raw : null;
    case "custom":
      return raw;
    default:
      return raw === null || raw === undefined ? "" : String(raw);
  }
}

/**
 * The standard form: fields come from a config array (or sections), laid out in a responsive two-column
 * grid, validated with the zod schema in the browser, posted with a fetcher and an `intent`. Server field
 * errors (`FormResult.errors`) show under their fields, `formError` above them. While saving the fields are
 * disabled and Save spins. Very specific forms (visual editors, multi-step flows) stay in their feature.
 */
export function GeneralForm<R extends FormResult = FormResult>({
  fields,
  sections,
  schema,
  defaultValues = {},
  intent,
  hiddenFields,
  action,
  method = "post",
  intro,
  submitLabel,
  onCancel,
  cancelLabel,
  onSuccess,
  isSuccess = (result) => result.ok === true,
  onSubmittingChange,
  onValuesChange,
  adjustValues,
  translateError,
  renderActions,
  submittingLabel,
  submitSize = "default",
  navigate = false,
  result: resultProp,
  busy = false,
  className,
}: GeneralFormProps<R>) {
  const { t } = useTranslation();
  const idPrefix = React.useId();
  const formRef = React.useRef<HTMLFormElement>(null);
  const fetcher = useFetcher();
  const navigation = useNavigation();
  const actionData = useActionData() as R | undefined;
  // Navigate mode: busy from the submit until the next page has loaded (the redirect after success).
  const navigating = navigation.state !== "idle" && navigation.formData !== undefined;
  const fetcherData = navigate ? (resultProp ?? actionData) : (fetcher.data as R | undefined);
  const submitting = busy || (navigate ? navigating : fetcher.state !== "idle");
  const allFields = allFieldsOf(fields, sections);

  const [values, setValues] = React.useState<GeneralFormValues>(() => {
    const initial: GeneralFormValues = { ...defaultValues };
    for (const field of allFieldsOf(fields, sections)) initial[field.name] = initialValue(field, defaultValues[field.name]);
    return initial;
  });
  const [clientErrors, setClientErrors] = React.useState<Record<string, string[]>>({});
  // Server errors of fields that were changed since: hidden until the next response.
  const [dismissed, setDismissed] = React.useState<ReadonlySet<string>>(new Set());
  const [seenResult, setSeenResult] = React.useState(fetcherData);
  if (fetcherData !== seenResult) {
    setSeenResult(fetcherData);
    setDismissed(new Set());
  }

  const result = submitting ? undefined : fetcherData;
  const translate = (message: string) => (translateError ? translateError(message) : message);
  const errorsFor = (name: string) => {
    const messages = clientErrors[name] ?? (dismissed.has(name) ? undefined : result?.errors?.[name]);
    return messages?.length ? messages.map(translate) : undefined;
  };

  const callbacks = React.useRef({ onSuccess, isSuccess, onSubmittingChange, onValuesChange });
  React.useEffect(() => {
    callbacks.current = { onSuccess, isSuccess, onSubmittingChange, onValuesChange };
  });

  React.useEffect(() => {
    callbacks.current.onSubmittingChange?.(submitting);
  }, [submitting]);

  React.useEffect(() => {
    callbacks.current.onValuesChange?.(values);
  }, [values]);

  const handled = React.useRef<R | undefined>(undefined);
  React.useEffect(() => {
    if (submitting || !fetcherData || handled.current === fetcherData) return;
    handled.current = fetcherData;
    if (callbacks.current.isSuccess(fetcherData)) callbacks.current.onSuccess?.(fetcherData);
    else formRef.current?.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus();
  }, [submitting, fetcherData]);

  const setValue = (name: string, value: unknown) => {
    setValues((previous) => {
      const next = { ...previous, [name]: value };
      return adjustValues ? adjustValues(next, previous, name) : next;
    });
    setClientErrors((previous) => {
      if (!(name in previous)) return previous;
      const next = { ...previous };
      delete next[name];
      return next;
    });
    setDismissed((previous) => (previous.has(name) ? previous : new Set(previous).add(name)));
  };

  const isVisible = (field: GeneralFormField) => !field.hidden && (!field.when || field.when(values));
  const visibleNames = new Set(allFields.filter(isVisible).flatMap((field) => [field.name, ...(field.errorNames ?? [])]));

  // Messages that belong to no visible field still need to be seen.
  const strayErrors = [
    ...Object.entries(result?.errors ?? {}).filter(([name]) => !visibleNames.has(name) && !dismissed.has(name)),
    ...Object.entries(clientErrors).filter(([name]) => !visibleNames.has(name)),
  ].flatMap(([, messages]) => messages.map(translate));
  const hasClientFieldErrors = Object.keys(clientErrors).some((name) => visibleNames.has(name));

  const handleSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    if (!schema) return;
    const parsed = parseForm(schema, new FormData(event.currentTarget));
    if (!parsed.errors) {
      setClientErrors({});
      return;
    }
    event.preventDefault();
    setClientErrors(parsed.errors);
    requestAnimationFrame(() => formRef.current?.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus());
  };

  const renderField = (field: GeneralFormField) => {
    const id = `${idPrefix}-${field.name}`;
    const errors = errorsFor(field.name);
    const invalid = Boolean(errors);
    const descriptionId = `${id}-description`;
    const errorId = `${id}-error`;
    const describedBy = [field.description && !invalid && descriptionId, invalid && errorId].filter(Boolean).join(" ") || undefined;
    const optional = field.optional ?? isOptionalInSchema(schema, field.name);
    const optionalLabel = optional && field.type !== "switch" ? t("form.optional") : undefined;
    const value = values[field.name];
    const text = typeof value === "string" ? value : "";
    const disabled = field.disabled;
    const shell = (control: React.ReactElement<{ "aria-invalid"?: boolean; "aria-describedby"?: string }>) => (
      <FormField label={field.label} htmlFor={id} description={field.description} errors={errors} optionalLabel={optionalLabel}>
        {control}
      </FormField>
    );
    const onText = (event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setValue(field.name, event.target.value);

    switch (field.type) {
      case "text":
        return shell(
          <Input
            id={id}
            name={field.name}
            type={field.inputType ?? "text"}
            inputMode={field.inputMode}
            autoComplete={field.autoComplete ?? "off"}
            maxLength={field.maxLength}
            placeholder={field.placeholder}
            disabled={disabled}
            autoFocus={field.autoFocus}
            value={text}
            onChange={onText}
          />,
        );
      case "textarea":
        return shell(
          <Textarea
            id={id}
            name={field.name}
            rows={field.rows ?? 3}
            maxLength={field.maxLength}
            placeholder={field.placeholder}
            disabled={disabled}
            autoFocus={field.autoFocus}
            value={text}
            onChange={onText}
          />,
        );
      case "number":
        return shell(
          <Input
            id={id}
            name={field.name}
            type="number"
            inputMode={field.inputMode ?? "decimal"}
            min={field.min}
            max={field.max}
            step={field.step}
            placeholder={field.placeholder}
            disabled={disabled}
            autoFocus={field.autoFocus}
            value={text}
            onChange={onText}
          />,
        );
      case "date":
        return shell(
          <Input
            id={id}
            name={field.name}
            type="date"
            min={field.min}
            max={field.max}
            disabled={disabled}
            autoFocus={field.autoFocus}
            value={text}
            onChange={onText}
          />,
        );
      case "money":
        return shell(
          <MoneyInput
            id={id}
            name={field.name}
            placeholder={field.placeholder}
            disabled={disabled}
            autoFocus={field.autoFocus}
            defaultValueCents={typeof value === "number" ? value : null}
            onValueChange={(cents) => setValue(field.name, cents)}
          />,
        );
      case "select":
        return shell(
          <SelectControl
            id={id}
            name={field.name}
            value={text}
            options={field.options}
            placeholder={field.placeholder ?? t("form.choose")}
            disabled={disabled}
            onChange={(next) => setValue(field.name, next)}
          />,
        );
      case "switch":
        return (
          <Stack gap="xs">
            <Inline gap="md" justify="between" align="start">
              <Stack gap="xs" className="min-w-0 pt-0.5">
                <Label htmlFor={id}>{field.label}</Label>
                {field.description && !invalid && (
                  <p id={descriptionId} className="text-xs text-muted-foreground">
                    {field.description}
                  </p>
                )}
              </Stack>
              <Switch
                id={id}
                name={field.name}
                checked={value === true}
                onCheckedChange={(checked) => setValue(field.name, checked)}
                disabled={disabled}
                aria-invalid={invalid || undefined}
                aria-describedby={describedBy}
              />
            </Inline>
            {errors && (
              <p id={errorId} className="text-xs font-medium text-destructive">
                {errors.join(" ")}
              </p>
            )}
          </Stack>
        );
      case "color": {
        const labelText = typeof field.label === "string" ? field.label : field.name;
        if (!field.colors) {
          return shell(
            <Input
              id={id}
              name={field.name}
              type="color"
              disabled={disabled}
              value={text || "#124734"}
              onChange={onText}
              className="h-10 w-16 cursor-pointer p-1"
            />,
          );
        }
        return (
          <Stack gap="sm">
            <span className="text-sm leading-none font-medium">
              {field.label}
              {optionalLabel && <span className="ml-2 font-normal text-muted-foreground">({optionalLabel})</span>}
            </span>
            <ColorSwatchPicker
              name={field.name}
              label={labelText}
              colors={field.colors}
              defaultValue={text}
              onChange={(color) => setValue(field.name, color)}
            />
            {field.description && !invalid && <p className="text-xs text-muted-foreground">{field.description}</p>}
            {errors && <p className="text-xs font-medium text-destructive">{errors.join(" ")}</p>}
          </Stack>
        );
      }
      case "custom": {
        const control = field.render({
          id,
          name: field.name,
          value,
          setValue: (next) => setValue(field.name, next),
          values,
          errors,
          errorsFor,
          invalid,
          describedBy,
          disabled: Boolean(disabled) || submitting,
        });
        return field.bare ? control : shell(<div className="min-w-0">{control}</div>);
      }
    }
  };

  const renderGrid = (list: readonly GeneralFormField[]) => (
    <FormGrid>
      {list.filter(isVisible).map((field) => (
        <FormGridItem key={field.name} span={field.span ?? "full"}>
          {renderField(field)}
        </FormGridItem>
      ))}
    </FormGrid>
  );

  const buttons = (
    <>
      {onCancel && (
        <Button type="button" variant="outline" onClick={onCancel}>
          {cancelLabel ?? t("actions.cancel")}
        </Button>
      )}
      <Button type="submit" size={submitSize} loading={submitting}>
        {submitting ? (submittingLabel ?? t("form.saving")) : (submitLabel ?? t("actions.save"))}
      </Button>
    </>
  );

  const formProps = {
    ref: formRef,
    method,
    action,
    noValidate: true,
    "aria-busy": submitting || undefined,
    onSubmit: handleSubmit,
    className,
  };

  const body = (
    <>
      {intent && <input type="hidden" name="intent" value={intent} />}
      {Object.entries(hiddenFields ?? {}).map(([name, value]) =>
        value === null || value === undefined || value === "" ? null : (
          <input key={name} type="hidden" name={name} value={String(value)} />
        ),
      )}
      <fieldset disabled={submitting} className="min-w-0">
        <Stack gap="lg">
          {intro}
          {result?.formError && <InlineAlert tone="error">{result.formError}</InlineAlert>}
          {strayErrors.length > 0 && <InlineAlert tone="error">{strayErrors.join(" ")}</InlineAlert>}
          {hasClientFieldErrors && <InlineAlert tone="error">{t("form.checkFields")}</InlineAlert>}
          {fields && fields.length > 0 && renderGrid(fields)}
          {sections?.map((section, index) => {
            const headingId = `${idPrefix}-section-${index}`;
            const visible = section.fields.filter(isVisible);
            if (visible.length === 0) return null;
            return (
              <PageSection key={index} aria-labelledby={section.title ? headingId : undefined} className="gap-3">
                {section.title && (
                  <Stack gap="xs">
                    <h3 id={headingId} className="text-sm font-semibold">
                      {section.title}
                    </h3>
                    {section.description && <p className="text-xs text-muted-foreground">{section.description}</p>}
                  </Stack>
                )}
                {renderGrid(section.fields)}
              </PageSection>
            );
          })}
          {renderActions ? renderActions(buttons) : <Inline justify="end" gap="sm" wrap>{buttons}</Inline>}
        </Stack>
      </fieldset>
    </>
  );

  return navigate ? (
    <Form {...formProps} replace>
      {body}
    </Form>
  ) : (
    <fetcher.Form {...formProps}>{body}</fetcher.Form>
  );
}

type SelectControlProps = {
  id: string;
  name: string;
  value: string;
  options: readonly GeneralFormOption[];
  placeholder: string;
  disabled?: boolean;
  onChange: (value: string) => void;
  "aria-invalid"?: boolean;
  "aria-describedby"?: string;
};

/** A select whose trigger receives the label, error and description wiring from `FormField`. */
function SelectControl({ id, name, value, options, placeholder, disabled, onChange, ...aria }: SelectControlProps) {
  return (
    <Select name={name} value={value} onValueChange={onChange} disabled={disabled}>
      <SelectTrigger id={id} className="w-full" {...aria}>
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent>
        {options.map((option) => (
          <SelectItem key={option.value} value={option.value}>
            {option.icon}
            {option.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
