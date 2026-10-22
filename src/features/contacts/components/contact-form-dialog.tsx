import type * as React from "react";
import { Trash2Icon } from "lucide-react";
import { useTranslation } from "react-i18next";
import type { GeneralFormField } from "@/components/shared/general-form";
import { GeneralFormDialog } from "@/components/shared/general-form-dialog";
import { ShopPicker, type Shop } from "@/features/shops";
import { formatDate } from "@/types/date-format";
import type { ContactActionResult } from "../data/contacts-loaders";
import { MAX_CONTACT_VALUES, contactFormSchema, type Contact } from "../types/contacts";
import { ContactAvatar } from "./contact-avatar";
import { MultiValueInput } from "./multi-value-input";
import { TradeInput } from "./trade-input";

type ContactFormDialogProps = {
  /** Edit this contact; omit to add a new one. */
  contact?: Contact;
  /** Shops for the "supplier's shop" field; the field is left out without them. */
  shops?: Shop[];
  /** Trades the household already uses, suggested next to the built-in ones. */
  knownTrades?: readonly string[];
  /** Trade preselected for a new contact. */
  defaultTrade?: string;
  /** A new contact is linked to this project right away (from a project's page), with this role. */
  projectId?: string;
  projectRole?: string;
  /** Route to post to (default: the current route). The project page posts to "/contacts". */
  action?: string;
  trigger?: React.ReactElement;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  /** After it saved (or the contact was deleted). */
  onSaved?: (result: ContactActionResult) => void;
};

const indexNames = (name: string) => Array.from({ length: MAX_CONTACT_VALUES }, (_, index) => `${name}.${index}`);
const asList = (value: unknown) => (Array.isArray(value) ? value.map(String) : []);

/** Add or edit a contact (name, company, trade, phone numbers, email addresses, address, website, shop, notes); delete it from the footer. */
export function ContactFormDialog({
  contact,
  shops,
  knownTrades,
  defaultTrade,
  projectId,
  projectRole,
  action,
  trigger,
  open,
  onOpenChange,
  onSaved,
}: ContactFormDialogProps) {
  const { t, i18n } = useTranslation("contacts");
  const isEdit = Boolean(contact);
  const locale = i18n.resolvedLanguage === "nl" ? "nl" : "en";
  const translateError = (message: string) => (i18n.exists(`contacts:errors.${message}`) ? t(`errors.${message}`) : message);

  const multi = (name: "emails" | "phones", inputType: "email" | "tel", placeholder: string): GeneralFormField => ({
    name,
    type: "custom",
    label: t(`fields.${name}`),
    description: t(`fields.${name}Description`),
    errorNames: indexNames(name),
    render: ({ id, name: fieldName, value, setValue, errorsFor, invalid, describedBy, disabled }) => (
      <MultiValueInput
        id={id}
        name={fieldName}
        values={asList(value)}
        onChange={setValue}
        inputType={inputType}
        placeholder={placeholder}
        max={MAX_CONTACT_VALUES}
        errorsFor={(index) => errorsFor(`${fieldName}.${index}`)}
        invalid={invalid}
        describedBy={describedBy}
        disabled={disabled}
      />
    ),
  });

  const fields: GeneralFormField[] = [
    { name: "name", type: "text", label: t("fields.name"), placeholder: t("fields.namePlaceholder"), span: "half", autoComplete: "name" },
    { name: "company", type: "text", label: t("fields.company"), span: "half", autoComplete: "organization" },
    {
      name: "trade",
      type: "custom",
      label: t("fields.trade"),
      description: t("fields.tradeDescription"),
      render: ({ id, name, value, setValue, invalid, describedBy, disabled }) => (
        <TradeInput
          id={id}
          name={name}
          value={typeof value === "string" ? value : ""}
          onChange={setValue}
          extra={knownTrades}
          placeholder={t("fields.tradePlaceholder")}
          invalid={invalid}
          describedBy={describedBy}
          disabled={disabled}
        />
      ),
    },
    multi("phones", "tel", "+32 470 12 34 56"),
    multi("emails", "email", "naam@example.be"),
    { name: "address", type: "text", label: t("fields.address"), autoComplete: "street-address" },
    { name: "websiteUrl", type: "text", inputType: "url", inputMode: "url", label: t("fields.websiteUrl"), placeholder: "https://www.example.be" },
    {
      name: "shopId",
      type: "custom",
      label: t("fields.shop"),
      description: t("fields.shopDescription"),
      hidden: !shops?.length,
      render: ({ id, name, value, setValue, invalid, disabled }) => (
        <ShopPicker
          id={id}
          name={name}
          shops={shops ?? []}
          value={typeof value === "string" ? value : null}
          onChange={setValue}
          invalid={invalid}
          disabled={disabled}
          clearable
        />
      ),
    },
    { name: "notes", type: "textarea", rows: 3, label: t("fields.notes") },
  ];

  const linkedProjects = contact?.projects.length ?? 0;

  return (
    <GeneralFormDialog<ContactActionResult>
      trigger={trigger}
      open={open}
      onOpenChange={onOpenChange}
      title={isEdit ? t("form.editTitle") : t("form.createTitle")}
      description={
        contact
          ? t("form.addedOn", { date: formatDate(contact.createdAt, locale) })
          : projectId
            ? t("project.newDescription")
            : t("form.description")
      }
      media={(values) => <ContactAvatar name={typeof values.name === "string" && values.name.trim() ? values.name : "?"} size="md" />}
      successMessage={isEdit ? t("form.updated") : t("form.created")}
      schema={contactFormSchema}
      fields={fields}
      intent={isEdit ? "update" : "create"}
      action={action}
      hiddenFields={{ id: contact?.id, projectId: isEdit ? undefined : projectId, projectRole: isEdit ? undefined : projectRole }}
      translateError={translateError}
      defaultValues={{
        name: contact?.name ?? "",
        company: contact?.company ?? "",
        trade: contact?.trade ?? defaultTrade ?? "",
        phones: contact?.phones ?? [],
        emails: contact?.emails ?? [],
        address: contact?.address ?? "",
        websiteUrl: contact?.websiteUrl ?? "",
        shopId: contact?.shop?.id ?? null,
        notes: contact?.notes ?? "",
      }}
      onSuccess={onSaved}
      secondaryAction={
        contact
          ? {
              label: t("delete.label"),
              icon: <Trash2Icon />,
              destructive: true,
              intent: "delete",
              data: { id: contact.id },
              action,
              confirm: {
                title: t("delete.title", { name: contact.name }),
                description: linkedProjects ? t("delete.descriptionLinked", { count: linkedProjects }) : t("delete.description"),
              },
              successMessage: t("delete.deleted"),
              onSuccess: onSaved,
            }
          : undefined
      }
    />
  );
}
