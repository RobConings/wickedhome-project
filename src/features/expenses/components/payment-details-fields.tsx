import * as React from "react";
import { useTranslation } from "react-i18next";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { FormField } from "@/components/shared/form-field";
import { SegmentedControl } from "@/components/shared/segmented-control";
import { PAYMENT_METHODS, type PaymentMethod } from "../types/expenses";
import { MAX_REFERENCE_LENGTH, formatStructuredCommunication } from "../types/payment-references";

/** The controlled part of the payment details: what picking a previous payee can prefill. */
export type PaymentDetailsValues = {
  paymentMethod: PaymentMethod | null;
  beneficiaryName: string;
  iban: string;
  bic: string;
};

type PaymentDetailsFieldsProps = {
  values: PaymentDetailsValues;
  onChange: (values: PaymentDetailsValues) => void;
  defaultStructuredCommunication?: string | null;
  defaultReference?: string | null;
  /** Field errors from the action, keyed by field name. */
  errors?: Record<string, string[]>;
  idPrefix?: string;
};

const NO_METHOD = "none";

/**
 * Payment method, beneficiary, IBAN, BIC and communication (structured "+++…+++" or free text). The bank
 * fields only show for a transfer (or when filled in); a direct debit only needs its method.
 */
export function PaymentDetailsFields({
  values,
  onChange,
  defaultStructuredCommunication,
  defaultReference,
  errors,
  idPrefix = "expense",
}: PaymentDetailsFieldsProps) {
  const { t } = useTranslation("expenses");
  const { t: tCommon } = useTranslation();
  const [communicationType, setCommunicationType] = React.useState<"structured" | "free">(
    defaultReference && !defaultStructuredCommunication ? "free" : "structured",
  );
  const [structured, setStructured] = React.useState(
    defaultStructuredCommunication ? formatStructuredCommunication(defaultStructuredCommunication) : "",
  );
  const [reference, setReference] = React.useState(defaultReference ?? "");
  const set = (patch: Partial<PaymentDetailsValues>) => onChange({ ...values, ...patch });
  /** Our own validators return English; show the translated message instead. */
  const translated = (field: string, key: string) => (errors?.[field] ? [t(key)] : undefined);

  const showBank =
    values.paymentMethod === "wire_transfer" ||
    values.paymentMethod === "direct_debit" ||
    Boolean(values.iban || values.beneficiaryName || structured || reference);

  return (
    <>
      <input type="hidden" name="paymentMethod" value={values.paymentMethod ?? ""} />
      <FormField
        label={t("fields.paymentMethod")}
        htmlFor={`${idPrefix}-payment-method`}
        description={values.paymentMethod === "direct_debit" ? t("hints.directDebit") : undefined}
        errors={errors?.paymentMethod}
      >
        <Select
          value={values.paymentMethod ?? NO_METHOD}
          onValueChange={(value) => set({ paymentMethod: value === NO_METHOD ? null : (value as PaymentMethod) })}
        >
          <SelectTrigger id={`${idPrefix}-payment-method`} className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={NO_METHOD}>{t("methods.none")}</SelectItem>
            {PAYMENT_METHODS.map((method) => (
              <SelectItem key={method} value={method}>
                {t(`methods.${method}`)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </FormField>

      {showBank && (
        <>
          <FormField
            label={t("fields.beneficiaryName")}
            htmlFor={`${idPrefix}-beneficiary`}
            optionalLabel={tCommon("form.optional")}
            description={t("hints.beneficiaryName")}
            errors={errors?.beneficiaryName}
          >
            <Input
              id={`${idPrefix}-beneficiary`}
              name="beneficiaryName"
              value={values.beneficiaryName}
              onChange={(event) => set({ beneficiaryName: event.target.value })}
              placeholder={t("placeholders.beneficiaryName")}
              maxLength={70}
              autoComplete="off"
            />
          </FormField>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-[2fr_1fr]">
            <FormField
              label={t("fields.iban")}
              htmlFor={`${idPrefix}-iban`}
              optionalLabel={tCommon("form.optional")}
              errors={translated("iban", "errors.iban")}
            >
              <Input
                id={`${idPrefix}-iban`}
                name="iban"
                value={values.iban}
                onChange={(event) => set({ iban: event.target.value })}
                placeholder="BE68 5390 0754 7034"
                autoComplete="off"
                className="font-mono uppercase"
              />
            </FormField>
            <FormField
              label={t("fields.bic")}
              htmlFor={`${idPrefix}-bic`}
              optionalLabel={tCommon("form.optional")}
              errors={translated("bic", "errors.bic")}
            >
              <Input
                id={`${idPrefix}-bic`}
                name="bic"
                value={values.bic}
                onChange={(event) => set({ bic: event.target.value })}
                placeholder="GEBABEBB"
                autoComplete="off"
                className="font-mono uppercase"
              />
            </FormField>
          </div>
          <FormField
            label={t("fields.communication")}
            htmlFor={`${idPrefix}-communication`}
            optionalLabel={tCommon("form.optional")}
            description={communicationType === "structured" ? t("hints.structured") : undefined}
            errors={
              errors?.structuredCommunication || errors?.reference
                ? [t("errors.structuredCommunication")]
                : undefined
            }
          >
            <div className="flex flex-col gap-2">
              <SegmentedControl
                size="sm"
                label={t("fields.communication")}
                value={communicationType}
                onChange={setCommunicationType}
                options={[
                  { value: "structured", label: t("fields.structured") },
                  { value: "free", label: t("fields.freeText") },
                ]}
              />
              {communicationType === "structured" ? (
                <Input
                  id={`${idPrefix}-communication`}
                  name="structuredCommunication"
                  value={structured}
                  onChange={(event) => setStructured(event.target.value)}
                  placeholder="+++123/4567/89002+++"
                  inputMode="numeric"
                  autoComplete="off"
                  className="font-mono"
                />
              ) : (
                <Input
                  id={`${idPrefix}-communication`}
                  name="reference"
                  value={reference}
                  onChange={(event) => setReference(event.target.value)}
                  placeholder={t("placeholders.reference")}
                  maxLength={MAX_REFERENCE_LENGTH}
                  autoComplete="off"
                />
              )}
            </div>
          </FormField>
        </>
      )}
    </>
  );
}
