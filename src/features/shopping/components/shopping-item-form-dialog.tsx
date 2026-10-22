import * as React from "react";
import { RefreshCwIcon } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import type { GeneralFormField, GeneralFormValues } from "@/components/shared/general-form";
import { GeneralFormDialog } from "@/components/shared/general-form-dialog";
import { ShopPicker, type Shop } from "@/features/shops";
import { formatCurrency } from "@/lib/format";
import { currentLocale } from "@/lib/i18n";
import type { ShoppingActionResult } from "../data/shopping-loaders";
import { fetchLinkPreview } from "../data/shopping-requests";
import { PRODUCT_CATEGORIES, shoppingItemEditSchema, type LinkPreview, type Product, type ShoppingItem } from "../types/shopping";
import { ProductCategoryIcon } from "./product-category-icon";
import { ProductPicker } from "./product-picker";

type ShoppingItemFormDialogProps = {
  /** The item to edit; `null` closes the dialog. */
  item: ShoppingItem | null;
  onOpenChange: (open: boolean) => void;
  products: Product[];
  shops: Shop[];
  /** Reads the webshop link; defaults to the API (stories pass a fake). */
  previewLink?: (url: string) => Promise<LinkPreview>;
  /** After it was saved (e.g. reload the list). */
  onSaved?: () => void;
};

const text = (value: unknown) => (typeof value === "string" ? value : "");

/** The link field's value: the link and photo it posts, and what "Fetch from link" found (copied to price/name). */
type LinkValue = { url: string; imageUrl: string; fetched?: { priceCents: number | null; title: string | null; at: number } };
const linkValue = (value: unknown): LinkValue =>
  value && typeof value === "object" && "url" in value ? (value as LinkValue) : { url: text(value), imageUrl: "" };

/**
 * Edit one thing to buy: name, the product it is (pick one or leave it a loose item), its category (when it
 * has no product), quantity and unit, shop, price, webshop link and note. "Fetch from link" fills in the price
 * and photo from the webshop page. Posts `update-item` to the shopping route (also used by the shop view).
 */
export function ShoppingItemFormDialog({ item, onOpenChange, products, shops, previewLink = fetchLinkPreview, onSaved }: ShoppingItemFormDialogProps) {
  const { t } = useTranslation("shopping");
  const locale = currentLocale();
  const productName = (id: unknown) => products.find((product) => product.id === id)?.name ?? null;

  const adjustValues = (next: GeneralFormValues, previous: GeneralFormValues, changed: string) => {
    if (changed === "url") {
      // "Fetch from link" found a price (and maybe a title): put them in their fields.
      const fetched = linkValue(next.url).fetched;
      if (!fetched || fetched.at === linkValue(previous.url).fetched?.at) return next;
      return {
        ...next,
        ...(fetched.priceCents !== null && { priceCents: fetched.priceCents }),
        ...(!text(previous.name) && fetched.title && { name: fetched.title }),
      };
    }
    if (changed !== "productId") return next;
    const product = products.find((candidate) => candidate.id === next.productId);
    if (!product) return next;
    // A product chosen for a loose item: take its name (unless typed differently), unit and shop when empty.
    const name = text(previous.name);
    return {
      ...next,
      name: !name || name === productName(previous.productId) ? product.name : name,
      unit: text(previous.unit) || product.unit || "",
      shopId: previous.shopId || product.defaultShopId || null,
    };
  };

  const fields: GeneralFormField[] = [
    { name: "name", type: "text", label: t("fields.name"), maxLength: 120 },
    {
      name: "productId",
      type: "custom",
      label: t("edit.product"),
      description: t("edit.productHint"),
      optional: true,
      render: ({ id, name, value, setValue, invalid, disabled }) => (
        <ProductPicker
          id={id}
          name={name}
          products={products}
          value={typeof value === "string" && value ? value : null}
          onChange={setValue}
          clearable
          invalid={invalid}
          disabled={disabled}
          placeholder={t("edit.noProduct")}
        />
      ),
    },
    {
      name: "category",
      type: "select",
      label: t("fields.category"),
      optional: true,
      // A product brings its own category (changed on the product); a loose item has its own.
      when: (values) => !values.productId,
      options: [
        { value: "none", label: t("edit.noCategory") },
        ...PRODUCT_CATEGORIES.map((category) => ({
          value: category,
          label: t(`categories.${category}`),
          icon: <ProductCategoryIcon category={category} className="size-4" />,
        })),
      ],
    },
    { name: "quantity", type: "number", label: t("fields.quantity"), inputMode: "decimal", span: "half" },
    { name: "unit", type: "text", label: t("fields.unit"), placeholder: t("fields.unitPlaceholder"), maxLength: 20, span: "half" },
    {
      name: "shopId",
      type: "custom",
      label: t("fields.shop"),
      optional: true,
      render: ({ id, name, value, setValue, invalid, disabled }) => (
        <ShopPicker id={id} name={name} shops={shops} value={typeof value === "string" && value ? value : null} onChange={setValue} clearable invalid={invalid} disabled={disabled} />
      ),
    },
    { name: "priceCents", type: "money", label: t("edit.price"), description: t("edit.priceHint"), optional: true, span: "half" },
    {
      name: "url",
      type: "custom",
      label: t("fields.url"),
      optional: true,
      errorNames: ["imageUrl"],
      render: ({ id, name, value, setValue, invalid, describedBy, disabled }) => (
        <LinkField
          id={id}
          name={name}
          value={linkValue(value)}
          onChange={setValue}
          invalid={invalid}
          describedBy={describedBy}
          disabled={disabled}
          previewLink={previewLink}
          formatPrice={(cents) => formatCurrency(cents, locale)}
        />
      ),
    },
    { name: "note", type: "textarea", label: t("fields.note"), rows: 2, optional: true },
  ];

  return (
    <GeneralFormDialog<ShoppingActionResult>
      open={item !== null}
      onOpenChange={onOpenChange}
      title={t("edit.title")}
      description={item ? t("edit.description", { list: item.listName }) : undefined}
      successMessage={t("edit.saved")}
      schema={shoppingItemEditSchema}
      fields={fields}
      adjustValues={adjustValues}
      action="/shopping"
      intent="update-item"
      hiddenFields={{ id: item?.id }}
      onSuccess={() => onSaved?.()}
      defaultValues={{
        name: item?.name ?? "",
        productId: item?.productId ?? null,
        category: item && !item.productId ? (item.category ?? "none") : "none",
        quantity: item ? String(item.quantity) : "1",
        unit: item?.unit ?? "",
        shopId: item?.shopId ?? null,
        priceCents: item?.priceCents ?? null,
        url: { url: item?.url ?? "", imageUrl: item?.imageUrl ?? "" } satisfies LinkValue,
        note: item?.note ?? "",
      }}
      contentClassName="sm:max-w-lg"
    />
  );
}

type LinkFieldProps = {
  id: string;
  name: string;
  value: LinkValue;
  onChange: (value: LinkValue) => void;
  invalid?: boolean;
  describedBy?: string;
  disabled?: boolean;
  previewLink: (url: string) => Promise<LinkPreview>;
  formatPrice: (cents: number) => string;
};

/** The webshop link, with "Fetch from link" (price and photo from the page). Posts the photo as `imageUrl`. */
function LinkField({ id, name, value, onChange, invalid, describedBy, disabled, previewLink, formatPrice }: LinkFieldProps) {
  const { t } = useTranslation("shopping");
  const [state, setState] = React.useState<{ busy?: boolean; message?: string }>({});
  const url = value.url.trim();
  const valid = /^https?:\/\/\S+$/i.test(url);

  const fetchFromLink = () => {
    setState({ busy: true });
    previewLink(url)
      .then((preview) => {
        onChange({
          url: value.url,
          imageUrl: preview.imageUrl ?? value.imageUrl,
          fetched: { priceCents: preview.priceCents, title: preview.fetched ? preview.title : null, at: Date.now() },
        });
        setState({
          message: !preview.fetched ? t("edit.fetchFailed") : preview.priceCents !== null ? t("edit.fetchedPrice", { price: formatPrice(preview.priceCents) }) : t("edit.fetchedNoPrice"),
        });
      })
      .catch(() => setState({ message: t("edit.fetchFailed") }));
  };

  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex gap-2">
        <input
          id={id}
          name={name}
          type="url"
          inputMode="url"
          value={value.url}
          onChange={(event) => onChange({ url: event.target.value, imageUrl: value.imageUrl })}
          placeholder="https://"
          disabled={disabled}
          aria-invalid={invalid || undefined}
          aria-describedby={describedBy}
          className="h-9 min-w-0 flex-1 rounded-md border border-input bg-transparent px-3 text-base shadow-xs outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 aria-invalid:border-destructive md:text-sm dark:bg-input/30"
        />
        <Button type="button" variant="outline" onClick={fetchFromLink} disabled={disabled || !valid} loading={state.busy}>
          <RefreshCwIcon />
          <span className="max-sm:sr-only">{t("edit.fetch")}</span>
        </Button>
      </div>
      <input type="hidden" name="imageUrl" value={value.imageUrl} />
      {state.message && (
        <p className="text-xs text-muted-foreground" aria-live="polite">
          {state.message}
        </p>
      )}
    </div>
  );
}
