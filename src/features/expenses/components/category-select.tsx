import { useTranslation } from "react-i18next";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { BILL_CATEGORIES, EVERYDAY_CATEGORIES, type ExpenseCategory } from "../types/expenses";
import { ExpenseCategoryIcon } from "./expense-category-icon";

type CategorySelectProps = {
  id: string;
  name?: string;
  value: ExpenseCategory;
  onChange: (category: ExpenseCategory) => void;
  /** Which group comes first: everyday spending (logging) or bills (the expense form). */
  first?: "everyday" | "bills";
  "aria-invalid"?: boolean;
  "aria-describedby"?: string;
};

/** Category picker in two groups (everyday spending, bills & recurring costs), "Other" last. */
export function CategorySelect({ id, name = "category", value, onChange, first = "bills", ...aria }: CategorySelectProps) {
  const { t } = useTranslation("expenses");
  const groups = [
    { key: "bills", categories: BILL_CATEGORIES },
    { key: "everyday", categories: EVERYDAY_CATEGORIES },
  ] as const;
  const ordered = first === "bills" ? groups : [groups[1], groups[0]];

  return (
    <Select name={name} value={value} onValueChange={(next) => onChange(next as ExpenseCategory)}>
      <SelectTrigger id={id} className="w-full" {...aria}>
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {ordered.map((group) => (
          <SelectGroup key={group.key}>
            <SelectLabel>{t(`categoryGroups.${group.key}`)}</SelectLabel>
            {group.categories.map((category) => (
              <SelectItem key={category} value={category}>
                <ExpenseCategoryIcon category={category} size="sm" />
                {t(`categories.${category}`)}
              </SelectItem>
            ))}
          </SelectGroup>
        ))}
        <SelectItem value="other">
          <ExpenseCategoryIcon category="other" size="sm" />
          {t("categories.other")}
        </SelectItem>
      </SelectContent>
    </Select>
  );
}
