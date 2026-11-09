import * as React from "react";
import { useTranslation } from "react-i18next";
import { z } from "zod";
import type { GeneralFormField } from "@/components/shared/general-form";
import { GeneralFormDialog } from "@/components/shared/general-form-dialog";
import type { UseSelectionsOptions } from "@/lib/selections";
import type { ShoppingActionResult } from "../data/shopping-loaders";
import { useProductSelections } from "../data/use-product-selections";
import type { Product } from "../types/shopping";
import { previewSharedStockLink } from "../types/shared-stock-group-preview";
import { ProductPicker } from "./product-picker";

type LinkAlternativeDialogProps = {
  product: Product;
  /** The catalogue to choose from; products already sharing `product`'s stock are left out. */
  products: Product[];
  /**
   * `add`: the chosen product becomes an alternative of `product` (its product page). `of`: `product`
   * becomes an alternative of the chosen one (e.g. a product that was just scanned and added).
   */
  mode?: "add" | "of";
  trigger?: React.ReactElement;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  /** After linking, with the product that was linked (`product` in mode `of`, the chosen one in mode `add`). */
  onLinked?: (productId: string) => void;
  /** Route to post to; defaults to the current route (its action handles `handleProductAlternativeForm`). */
  action?: string;
  initialSelections?: UseSelectionsOptions["initial"];
};

const idOrNull = (value: unknown) => (typeof value === "string" && value !== "" ? value : null);

// Server safeguards intentionally reject incompatible shared-stock merges.
// Surface the reason beside the visible product picker (including errors
// returned for the hidden mainProductId field), in the current UI language.
const stockLinkErrorKey: Record<string, string> = {
  "Verify product types/categories before sharing stock": "category",
  "Different package sizes cannot share one package count": "package",
  "Keep distinct containers as separate product variants; compare verified package content instead": "container",
  "Stock units differ; quantities cannot be added without a verified conversion": "unit",
  "These are different product types, not interchangeable stock": "type",
};

/**
 * Link two products so they share one stock (alternatives): pick the other product, optionally name the
 * shared stock (a new generic product such as "Bacon"). Posts `link-alternative`.
 */
export function LinkAlternativeDialog({
  product,
  products,
  mode = "add",
  trigger,
  open,
  onOpenChange,
  onLinked,
  action,
  initialSelections,
}: LinkAlternativeDialogProps) {
  const { t } = useTranslation("shopping");
  const { recordUse } = useProductSelections({ initial: initialSelections });
  const chosen = React.useRef<string | null>(null);
  const owner = product.stockProductId ?? product.id;
  const candidates = React.useMemo(() => products.filter((other) => (other.stockProductId ?? other.id) !== owner), [products, owner]);
  // In mode `add` the chosen product is the one that is linked (posted as `id`); in mode `of` it is the main one.
  const pickerName = mode === "add" ? "id" : "mainProductId";

  const previewFor = (productId: string | null) => {
    const selected = products.find((row) => row.id === productId);
    return selected ? previewSharedStockLink(product, selected, products) : null;
  };
  const confirmationSchema = z.object({
    id: z.string().optional(),
    mainProductId: z.string().optional(),
    confirmGroupMerge: z.enum(["true", "false"]).optional(),
  }).superRefine((values, context) => {
    const selectedId = mode === "add" ? values.id : values.mainProductId;
    if (!selectedId) {
      context.addIssue({ code: "custom", path: [pickerName], message: t("alternatives.chooseProduct") });
      return;
    }
    if (previewFor(selectedId)?.needsConfirmation && values.confirmGroupMerge !== "true") {
      context.addIssue({ code: "custom", path: ["confirmGroupMerge"], message: t("alternatives.groupMergeRequired") });
    }
  });

  const fields: GeneralFormField[] = [
    {
      name: pickerName,
      type: "custom",
      label: t("alternatives.product"),
      errorNames: ["mainProductId", "id"],
      render: ({ id, name, value, setValue, invalid, disabled }) => (
        <ProductPicker
          id={id}
          name={name}
          products={candidates}
          value={idOrNull(value)}
          onChange={(next) => {
            chosen.current = next;
            setValue(next);
          }}
          invalid={invalid}
          disabled={disabled}
          initialSelections={initialSelections}
        />
      ),
    },
    {
      name: "newMainName",
      type: "text",
      label: t("alternatives.sharedName"),
      description: t("alternatives.sharedNameDescription"),
      optional: true,
      maxLength: 120,
    },
    {
      name: "confirmGroupMerge",
      type: "custom",
      label: t("alternatives.groupMergeTitle"),
      bare: true,
      when: (values) => Boolean(previewFor(idOrNull(values[pickerName]))?.needsConfirmation),
      render: ({ id, name, value, values, setValue, disabled, invalid, errors }) => {
        const preview = previewFor(idOrNull(values[pickerName]));
        if (!preview?.needsConfirmation) return null;
        return (
          <section className="flex flex-col gap-3 rounded-lg border border-warning/40 bg-muted/40 p-3" aria-label={t("alternatives.groupMergeTitle")}>
            <div className="space-y-1">
              <p className="text-sm font-semibold">{t("alternatives.groupMergeTitle")}</p>
              <p className="text-sm text-muted-foreground">{t("alternatives.groupMergeDescription")}</p>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              {[
                { label: t("alternatives.currentGroup"), members: preview.currentMembers },
                { label: t("alternatives.selectedGroup"), members: preview.selectedMembers },
              ].map((group) => (
                <div key={group.label} className="min-w-0">
                  <p className="text-xs font-semibold text-muted-foreground">{group.label}</p>
                  <ul className="mt-1 list-disc space-y-0.5 pl-4 text-sm">
                    {group.members.map((member) => <li key={member.id} className="break-words">{member.name}</li>)}
                  </ul>
                </div>
              ))}
            </div>
            <input type="hidden" name={name} value={value === true ? "true" : "false"} />
            <label htmlFor={id} className="flex cursor-pointer items-start gap-2 text-sm">
              <input
                id={id}
                type="checkbox"
                checked={value === true}
                onChange={(event) => setValue(event.currentTarget.checked)}
                disabled={disabled}
                aria-invalid={invalid || undefined}
                className="mt-0.5 size-4 shrink-0 accent-primary"
              />
              <span>{t("alternatives.groupMergeConfirm")}</span>
            </label>
            {errors?.length ? <p className="text-xs font-medium text-destructive">{errors.join(" ")}</p> : null}
          </section>
        );
      },
    },
  ];

  return (
    <GeneralFormDialog<ShoppingActionResult>
      trigger={trigger}
      open={open}
      onOpenChange={(next) => {
        if (next) chosen.current = null;
        onOpenChange?.(next);
      }}
      title={mode === "add" ? t("alternatives.linkTitle", { name: product.name }) : t("alternatives.linkOfTitle", { name: product.name })}
      description={t("alternatives.linkDescription")}
      successMessage={t("alternatives.linked")}
      translateError={(message) => {
        const key = stockLinkErrorKey[message];
        return key ? t(`alternatives.errors.${key}`) : message;
      }}
      submitLabel={t("alternatives.submit")}
      schema={confirmationSchema}
      adjustValues={(next, _previous, changed) =>
        changed === pickerName ? { ...next, confirmGroupMerge: false } : next
      }
      fields={fields}
      intent="link-alternative"
      action={action}
      hiddenFields={mode === "add" ? { mainProductId: product.id } : { id: product.id }}
      defaultValues={{ [pickerName]: null, newMainName: "" }}
      onSuccess={() => {
        if (chosen.current) void recordUse(chosen.current);
        onLinked?.(mode === "add" ? (chosen.current ?? product.id) : product.id);
      }}
    />
  );
}
