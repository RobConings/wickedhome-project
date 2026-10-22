import { PlusIcon, XIcon } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

type MultiValueInputProps = {
  /** Id of the first input (the field's label points at it). */
  id: string;
  /** Posted as one hidden field: the non-empty values, one per line (the form schema splits them). */
  name: string;
  values: string[];
  onChange: (values: string[]) => void;
  inputType: "email" | "tel";
  placeholder?: string;
  /** At most this many lines. */
  max?: number;
  /** Errors of one line (`emails.1`), shown under it. */
  errorsFor?: (index: number) => string[] | undefined;
  invalid?: boolean;
  describedBy?: string;
  disabled?: boolean;
};

/**
 * A few values of the same kind (email addresses, phone numbers): one input per line, a remove button per line and
 * "Add another". The first line is the primary one. Posts the values as one field, one per line.
 */
export function MultiValueInput({
  id,
  name,
  values,
  onChange,
  inputType,
  placeholder,
  max = 5,
  errorsFor,
  invalid,
  describedBy,
  disabled,
}: MultiValueInputProps) {
  const { t } = useTranslation("contacts");
  const rows = values.length ? values : [""];
  const set = (index: number, value: string) => onChange(rows.map((row, at) => (at === index ? value : row)));
  const remove = (index: number) => onChange(rows.filter((_, at) => at !== index));
  const canAdd = rows.length < max && rows.every((row) => row.trim() !== "");

  return (
    <div className="flex flex-col gap-2">
      <input type="hidden" name={name} value={rows.map((row) => row.trim()).filter(Boolean).join("\n")} />
      {rows.map((row, index) => {
        const errors = errorsFor?.(index);
        const errorId = `${id}-${index}-error`;
        return (
          <div key={index} className="flex flex-col gap-1">
            <div className="flex items-center gap-2">
              <Input
                id={index === 0 ? id : `${id}-${index}`}
                type={inputType}
                inputMode={inputType}
                autoComplete={inputType === "email" ? "email" : "tel"}
                placeholder={placeholder}
                value={row}
                disabled={disabled}
                aria-invalid={Boolean(errors) || (index === 0 && invalid) || undefined}
                aria-describedby={[index === 0 ? describedBy : undefined, errors ? errorId : undefined].filter(Boolean).join(" ") || undefined}
                onChange={(event) => set(index, event.target.value)}
                className="min-w-0 flex-1"
              />
              {(rows.length > 1 || row !== "") && (
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="shrink-0 text-muted-foreground"
                  disabled={disabled}
                  aria-label={t("multi.remove")}
                  title={t("multi.remove")}
                  onClick={() => remove(index)}
                >
                  <XIcon />
                </Button>
              )}
            </div>
            {errors && (
              <p id={errorId} className="text-sm text-destructive">
                {errors.join(" ")}
              </p>
            )}
          </div>
        );
      })}
      {canAdd && (
        <Button type="button" variant="ghost" size="sm" className="self-start" disabled={disabled} onClick={() => onChange([...rows, ""])}>
          <PlusIcon />
          {t("multi.add")}
        </Button>
      )}
    </div>
  );
}
