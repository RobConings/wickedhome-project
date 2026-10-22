import * as React from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { Input } from "@/components/ui/input";
import { EntityPicker } from "./entity-picker";
import { useSelections } from "@/lib/selections";
import type { PayeeSuggestion } from "../types/expenses";
import { ExpenseCategoryIcon } from "./expense-category-icon";

type PayeeFieldProps = {
  id: string;
  name?: string;
  defaultValue?: string;
  payees: PayeeSuggestion[];
  /** Called when a previous payee is picked, to prefill category and payment details. */
  onPick?: (payee: PayeeSuggestion) => void;
  placeholder?: string;
  /** Set by FormField. */
  "aria-invalid"?: boolean;
  "aria-describedby"?: string;
};

/**
 * Free-text payee with a picker of previous payees next to it (Favourites and Recently used first).
 * Payees are remembered by name: the name is the selection id.
 */
export function PayeeField({ id, name = "payee", defaultValue = "", payees, onPick, placeholder, ...aria }: PayeeFieldProps) {
  const { t } = useTranslation("expenses");
  const { t: tCommon } = useTranslation();
  const [value, setValue] = React.useState(defaultValue);
  const { favoriteIds, recentIds, toggleFavorite, loading } = useSelections("payee");

  return (
    <div className="flex gap-2">
      <Input
        {...aria}
        id={id}
        name={name}
        value={value}
        onChange={(event) => setValue(event.target.value)}
        autoComplete="off"
        maxLength={64}
        placeholder={placeholder}
        className="flex-1"
        required
      />
      {payees.length > 0 && (
        <EntityPicker
          className="w-auto shrink-0 [&_button[role=combobox]]:w-auto"
          items={payees.map((payee) => ({
            id: payee.name,
            label: payee.name,
            description: t(`categories.${payee.category}`),
            leading: <ExpenseCategoryIcon category={payee.category} size="sm" />,
          }))}
          value={null}
          onChange={(picked) => {
            const payee = payees.find((candidate) => candidate.name === picked);
            if (!payee) return;
            setValue(payee.name);
            onPick?.(payee);
          }}
          favoriteIds={favoriteIds}
          recentIds={recentIds}
          onToggleFavorite={(payeeId) => toggleFavorite(payeeId).catch(() => toast.error(tCommon("errors.generic")))}
          loading={loading}
          placeholder={t("fields.previousPayees")}
          labels={{ placeholder: t("fields.previousPayees") }}
        />
      )}
    </div>
  );
}
