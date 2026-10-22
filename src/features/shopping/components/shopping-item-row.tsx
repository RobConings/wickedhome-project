import * as React from "react";
import { CheckIcon, ExternalLinkIcon, MapPinIcon, PencilIcon, Trash2Icon } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { TagChip } from "./tag-chip";
import { ShopBadge, type Shop } from "@/features/shops";
import { formatCurrency } from "../lib/format";
import { currentLocale } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import { projectPath } from "@/types/projects";
import { formatQuantity, type ShoppingItem } from "../types/shopping";
import { ShoppingSourceBadge } from "./shopping-source-badge";
import { ShoppingStockBadge } from "./shopping-stock-badge";
import { ProductEssentialBadge } from "./product-essential-badge";

type ShoppingItemRowProps = {
  item: ShoppingItem;
  /** The item's shop with its type (for the icon); falls back to the name on the item. */
  shop?: Shop | null;
  showShop?: boolean;
  showList?: boolean;
  showSource?: boolean;
  /** `large`: big tap targets for the shop view on a phone. */
  size?: "default" | "large";
  /** Title of the item's task, when known. */
  taskTitle?: string | null;
  onToggle: (item: ShoppingItem) => void;
  /** Shows a delete button when given. */
  onDelete?: (item: ShoppingItem) => void;
  /** Shows an edit button when given (name, product, category, price, link…). */
  onEdit?: (item: ShoppingItem) => void;
  /** The project chip (projects feature); off on the project's own page. */
  showProject?: boolean;
  /** Extra buttons before the link and delete buttons (e.g. "Set price"). */
  actions?: React.ReactNode;
  /** Extra chips after the others (e.g. "On invoice Toppy · 09/10/2026" on a project's page). */
  extraBadges?: React.ReactNode;
  className?: string;
};

/** One thing to buy: tick it off, see how much, where from and why it is on the list. */
export function ShoppingItemRow({
  item,
  shop,
  showShop = true,
  showList = false,
  showSource = true,
  size = "default",
  taskTitle,
  onToggle,
  onDelete,
  onEdit,
  showProject = true,
  actions,
  extraBadges,
  className,
}: ShoppingItemRowProps) {
  const { t } = useTranslation("shopping");
  const locale = currentLocale();
  const tickId = React.useId();
  const bought = item.status === "bought";
  const large = size === "large";
  // The item's shop reference carries the type and logo too; `shop` (the full shop) wins when given.
  const shopForBadge = shop ?? item.shop;
  const quantity = `${formatQuantity(item.quantity, locale)}${item.unit ? ` ${item.unit}` : ""}`;
  const showQuantity = item.quantity !== 1 || Boolean(item.unit);

  const badges = [
    // A project's own materials show the project chip instead of "For a task".
    showSource && item.source !== "manual" && !(item.source === "task" && !item.taskId && item.project) && !(item.source === "low_stock" && item.stockStatus) && (
      <ShoppingSourceBadge key="source" source={item.source} taskTitle={taskTitle} recipeName={item.recipe?.name} />
    ),
    item.stockStatus && <ShoppingStockBadge key="stock" status={item.stockStatus} showAdvice={!bought} />,
    item.isEssential !== null && <ProductEssentialBadge key="essential" isEssential={item.isEssential} />,
    showShop && shopForBadge && <ShopBadge key="shop" shop={shopForBadge} />,
    showList && (
      <Badge key="list" variant="secondary" className="max-w-40 font-normal">
        <span className="truncate">{item.listName}</span>
      </Badge>
    ),
    item.placeName && (
      <Badge key="place" variant="outline" className="max-w-40 gap-1 font-normal text-muted-foreground">
        <MapPinIcon aria-hidden="true" />
        <span className="truncate">{item.placeName}</span>
      </Badge>
    ),
    showProject && item.project && (
      <TagChip
        key="project"
        label={item.project.name}
        color={item.project.color}
        to={projectPath(item.project.id)}
        title={t("item.project", { name: item.project.name })}
      />
    ),
    extraBadges && <React.Fragment key="extra">{extraBadges}</React.Fragment>,
  ].filter(Boolean);

  return (
    <li className={cn(
      "flex items-center gap-3",
      large ? "py-3" : "py-2",
      !bought && item.stockStatus === "below_minimum" && "bg-danger-soft/30",
      !bought && item.stockStatus === "at_minimum" && "bg-warning-soft/30",
      className,
    )}>
      <button
        id={tickId}
        type="button"
        role="checkbox"
        aria-checked={bought}
        aria-label={t(bought ? "item.untick" : "item.tick", { name: item.name })}
        onClick={() => onToggle(item)}
        className={cn(
          "grid shrink-0 place-items-center rounded-full border-2 transition-colors outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50",
          large ? "size-12 [&_svg]:size-6" : "size-8 [&_svg]:size-4",
          bought ? "border-primary bg-primary text-primary-foreground" : "border-input bg-background hover:border-primary",
        )}
      >
        {bought && <CheckIcon aria-hidden="true" />}
      </button>

      {item.imageUrl && (
        <img
          src={item.imageUrl}
          alt=""
          loading="lazy"
          referrerPolicy="no-referrer"
          className={cn("shrink-0 rounded-md border bg-white object-contain", large ? "size-12" : "size-9")}
        />
      )}

      <label htmlFor={tickId} className="flex min-w-0 flex-1 cursor-pointer flex-col gap-1">
        <span className={cn("flex flex-wrap items-baseline gap-x-2", large && "text-lg")}>
          <span className={cn("font-medium break-words", bought && "text-muted-foreground line-through")}>{item.name}</span>
          {showQuantity && <span className="text-sm text-muted-foreground tabular-nums">{quantity}</span>}
          {item.priceCents !== null && (
            <span className="text-sm text-muted-foreground tabular-nums">{formatCurrency(item.priceCents, locale)}</span>
          )}
        </span>
        {item.note && <span className="text-sm whitespace-pre-line text-muted-foreground">{item.note}</span>}
        {/* Alternatives: other brands that share the product's stock do as well, with their webshop links. */}
        {item.alternatives.length > 0 && (
          <span className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-muted-foreground">
            <span>{t("alternatives.or")}</span>
            {item.alternatives.map((alternative, index) => (
              <span key={alternative.productId} className="inline-flex min-w-0 flex-wrap items-center gap-1">
                <span className="break-words">{alternative.name}</span>
                {alternative.links.map((link) =>
                  link.url ? (
                    <a
                      key={link.shop.id}
                      href={link.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="rounded-full outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
                      title={t("item.openLink")}
                    >
                      <ShopBadge shop={link.shop} />
                    </a>
                  ) : (
                    <ShopBadge key={link.shop.id} shop={link.shop} />
                  ),
                )}
                {index < item.alternatives.length - 1 && <span aria-hidden="true">,</span>}
              </span>
            ))}
          </span>
        )}
        {badges.length > 0 && <span className="flex flex-wrap items-center gap-1.5">{badges}</span>}
        {bought && item.boughtByName && (
          <span className="text-xs text-muted-foreground">{t("item.boughtBy", { name: item.boughtByName })}</span>
        )}
      </label>

      {actions}
      {item.url && (
        <Button asChild variant="ghost" size={large ? "icon-lg" : "icon-sm"} className="text-muted-foreground">
          <a href={item.url} target="_blank" rel="noopener noreferrer" aria-label={t("item.openLink")} title={t("item.openLink")}>
            <ExternalLinkIcon />
          </a>
        </Button>
      )}
      {onEdit && (
        <Button
          type="button"
          variant="ghost"
          size={large ? "icon-lg" : "icon-sm"}
          className="text-muted-foreground"
          aria-label={t("item.edit", { name: item.name })}
          title={t("item.edit", { name: item.name })}
          onClick={() => onEdit(item)}
        >
          <PencilIcon />
        </Button>
      )}
      {onDelete && (
        <Button
          type="button"
          variant="ghost"
          size={large ? "icon-lg" : "icon-sm"}
          className="text-muted-foreground hover:text-destructive"
          aria-label={t("item.delete", { name: item.name })}
          title={t("item.delete", { name: item.name })}
          onClick={() => onDelete(item)}
        >
          <Trash2Icon />
        </Button>
      )}
    </li>
  );
}
