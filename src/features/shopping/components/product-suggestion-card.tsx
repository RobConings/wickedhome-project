import * as React from "react";
import { useTranslation } from "react-i18next";
import { cn } from "@/lib/utils";
import type { ProductSuggestion } from "../types/barcode-lookup";
import { ProductCategoryIcon } from "./product-category-icon";

type ProductSuggestionCardProps = {
  suggestion: ProductSuggestion;
  /** `lg` for the scan result (readable at arm's length), `md` inside the product form. */
  size?: "md" | "lg";
  className?: string;
};

/** What a scanned or typed barcode turned out to be: photo, name, brand, size and category. */
export function ProductSuggestionCard({ suggestion, size = "lg", className }: ProductSuggestionCardProps) {
  const { t } = useTranslation("shopping");
  const [photoFailed, setPhotoFailed] = React.useState(false);
  const photo = suggestion.imageUrl && !photoFailed ? suggestion.imageUrl : null;
  const details = [suggestion.brand, suggestion.quantity?.text].filter(Boolean).join(" · ");
  const large = size === "lg";

  return (
    <div className={cn("flex items-center gap-3", large && "gap-4", className)}>
      {photo ? (
        <img
          src={photo}
          alt=""
          onError={() => setPhotoFailed(true)}
          className={cn("shrink-0 rounded-lg border bg-white object-contain p-1", large ? "size-24" : "size-14")}
        />
      ) : (
        <span
          className={cn(
            "grid shrink-0 place-items-center rounded-lg bg-section-soft text-section",
            large ? "size-24" : "size-14",
          )}
        >
          <ProductCategoryIcon category={suggestion.category ?? "other"} className={large ? "size-10" : "size-6"} />
        </span>
      )}
      <div className="flex min-w-0 flex-col gap-1">
        <p className={cn("font-semibold leading-tight break-words", large ? "text-lg" : "text-base")}>{suggestion.name}</p>
        {details && <p className={cn("text-muted-foreground break-words", large ? "text-base" : "text-sm")}>{details}</p>}
        {suggestion.category && (
          <p className="flex items-center gap-1.5 text-sm text-muted-foreground">
            <ProductCategoryIcon category={suggestion.category} className="size-4" />
            {t(`categories.${suggestion.category}`)}
          </p>
        )}
      </div>
    </div>
  );
}
