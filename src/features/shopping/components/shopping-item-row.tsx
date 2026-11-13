import { Stack } from "@/components/layout/stack";
import { Text } from "@/components/ui/text";
import { Inline } from "@/components/layout/inline";
import { RecordImage } from "@/components/shared/record-image";
import { RecordLink } from "@/components/shared/record-link";
import { shoppingStockNeed } from "../types/shopping";
import * as React from "react";
import { CheckIcon, ChevronDownIcon, ExternalLinkIcon, MapPinIcon, MoreHorizontalIcon, PackageIcon, PencilIcon, Trash2Icon } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { TagChip } from "@/components/shared/tag-chip";
import { ShopBadge, type Shop } from "@/features/shops";
import { formatCurrency } from "@/lib/format";
import { currentLocale } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import { projectPath } from "@/types/projects";
import type { ShoppingItem } from "../types/shopping";
import { shoppingItemQuantity } from "../types/shopping-product-rows";
import { ShoppingSourceBadge } from "./shopping-source-badge";
import { ShoppingStockBadge } from "./shopping-stock-badge";

type ShoppingItemRowProps = {
  item: ShoppingItem;
  /** The item's shop with its type (for the icon); falls back to the name on the item. */
  shop?: Shop | null;
  showShop?: boolean;
  showList?: boolean;
  showSource?: boolean;
  /** Stock-group headings already convey this, so omit the repeated row indicator there. */
  showStockStatus?: boolean;
  /** `large`: big tap targets for the shop view on a phone. */
  size?: "default" | "large";
  /** Title of the item's task, when known. */
  taskTitle?: string | null;
  onToggle: (item: ShoppingItem) => void;
  /** Shows a delete button when given. */
  onDelete?: (item: ShoppingItem) => void;
  onSkip?: (item: ShoppingItem) => void;
  /** Shows an edit button when given (name, product, category, price, link…). */
  onEdit?: (item: ShoppingItem) => void;
  /** The project chip (projects feature); off on the project's own page. */
  showProject?: boolean;
  /** Hide the record link when this row is already inside its own dedicated workspace. */
  showRecordLink?: boolean;
  /** Extra buttons before the link and delete buttons (e.g. "Set price"). */
  actions?: React.ReactNode;
  /** Extra chips after the others (e.g. "On invoice Toppy · 09/10/2026" on a project's page). */
  extraBadges?: React.ReactNode;
  inCollectAndGo?: boolean;
  className?: string;
};

/** One thing to buy: tick it off, see how much, where from and why it is on the list. */
export function ShoppingItemRow({
  item,
  shop,
  showShop = true,
  showList = false,
  showSource = true,
  showStockStatus = true,
  size = "default",
  taskTitle,
  onToggle,
  onDelete,
  onSkip,
  onEdit,
  showProject = true,
  showRecordLink = true,
  actions,
  extraBadges,
  inCollectAndGo = false,
  className,
}: ShoppingItemRowProps) {
  const { t } = useTranslation("shopping");
  const { t: common } = useTranslation();
  const locale = currentLocale();
  const [detailsOpen, setDetailsOpen] = React.useState(false);
  const detailsId = React.useId();
  const tickId = React.useId();
  const bought = item.status === "bought";
  const stockNeed = shoppingStockNeed(item.stockStatus, item.isEssential);
  const large = size === "large";
  // The item's shop reference carries the type and logo too; `shop` (the full shop) wins when given.
  const shopForBadge = shop ?? item.shop;
  const quantity = shoppingItemQuantity(item, locale);
  const reasons = [...new Map((item.requirements ?? [item]).map((part) => [
    `${part.source}:${part.recipe?.entryId ?? part.taskId ?? ""}`, part,
  ])).values()];

  const badges = [
    // A project's own materials show the project chip instead of "For a task".
    ...reasons.filter((part) => showSource && part.source !== "manual" && !(part.source === "task" && !part.taskId && part.project) && !(part.source === "low_stock" && item.stockStatus))
      .map((part) => <ShoppingSourceBadge key={`source-${part.source}-${part.recipe?.entryId ?? part.taskId ?? ""}`} source={part.source} taskTitle={taskTitle} recipeName={part.recipe?.name} />),
    item.stockStatus && <ShoppingStockBadge key="stock" status={item.stockStatus} isEssential={item.isEssential} showAdvice={!bought} />,
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
    <li className={cn("grid min-w-0 grid-cols-[2.75rem_minmax(0,1fr)_2.75rem] items-center gap-x-1", large ? "py-2.5" : "py-2", className)}>
      <button
        id={tickId}
        type="button"
        role="checkbox"
        aria-checked={bought}
        aria-label={t(bought ? "item.untick" : "item.tick", { name: item.name })}
        onClick={() => onToggle(item)}
        className="grid size-11 shrink-0 place-items-center rounded-md outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
      >
        <span className={cn("grid size-6 place-items-center rounded-full border-2 transition-colors", bought ? "border-primary bg-primary text-primary-foreground" : "border-input bg-background hover:border-primary")}>
          {bought && <CheckIcon className="size-4" aria-hidden="true" />}
        </span>
      </button>

      <button
        type="button"
        onClick={() => setDetailsOpen((open) => !open)}
        aria-expanded={detailsOpen}
        aria-controls={detailsId}
        aria-label={`${t("item.showDetails", { name: item.name })}${inCollectAndGo ? ` · ${t("collectAndGoList.added")}` : ""}`}
        className="flex min-w-0 items-center gap-2 rounded-md text-left outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
      >
        {item.imageUrl ? (
          <RecordImage src={item.imageUrl} shape="avatar" fit="contain" />
        ) : (
          <span className="grid size-8 shrink-0 place-items-center rounded bg-muted/50 sm:size-9"><PackageIcon className="size-4 text-muted-foreground" aria-hidden="true" /></span>
        )}
        <span className="flex min-w-0 flex-1 flex-col gap-0.5">
          <span title={item.name} className={cn("line-clamp-2 text-sm leading-5 font-medium [overflow-wrap:anywhere] sm:line-clamp-1", bought && "text-muted-foreground line-through")}>{item.name}</span>
          {inCollectAndGo && <Badge variant="secondary" className="self-start whitespace-normal text-left text-xs" title={t("collectAndGoList.addedHelp")}>{t("collectAndGoList.added")}</Badge>}
          <span className="flex min-w-0 items-center gap-1.5 text-xs leading-4 text-muted-foreground">
            <span className={cn("tabular-nums", !item.amounts && "shrink-0", item.amounts && "truncate")}>{quantity}</span>
            {showShop && shopForBadge && <><span aria-hidden="true">·</span><span className="truncate">{shopForBadge.name}</span></>}
            {item.priceCents !== null && <span className="ml-auto shrink-0 tabular-nums">{formatCurrency(item.priceCents, locale)}</span>}
            {showStockStatus && !bought && stockNeed && <span className={cn("shrink-0 font-medium", stockNeed === "out" ? "text-danger" : "text-warning")} title={t(`stockNeedHelp.${stockNeed}`)}>{t(`stockNeed.${stockNeed}`)}</span>}
            <ChevronDownIcon aria-hidden="true" className={cn("size-3 shrink-0 transition-transform", detailsOpen && "rotate-180")} />
          </span>
        </span>
      </button>

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button type="button" variant="ghost" size="icon" className="size-11 text-muted-foreground" aria-label={t("item.actions", { name: item.name })}><MoreHorizontalIcon /></Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="max-w-[calc(100vw-2rem)]">
          <DropdownMenuLabel className="max-w-64 truncate">{item.name}</DropdownMenuLabel>
          {showRecordLink && <DropdownMenuItem asChild><RecordLink to={`/shopping/items/${encodeURIComponent(item.id)}`}>{t("need.open")}</RecordLink></DropdownMenuItem>}
          <DropdownMenuItem onSelect={() => setDetailsOpen((open) => !open)}><ChevronDownIcon />{t(detailsOpen ? "item.hideDetails" : "item.details")}</DropdownMenuItem>
          {onSkip && item.status === "open" && <DropdownMenuItem onSelect={() => onSkip(item)}>{t("planning.skip")}</DropdownMenuItem>}
          {item.status === "skipped" && <DropdownMenuItem onSelect={() => onToggle(item)}>{t("planning.restore")}</DropdownMenuItem>}
          {onEdit && <DropdownMenuItem onSelect={() => onEdit(item)}><PencilIcon />{common("actions.edit")}</DropdownMenuItem>}
          {item.url && <DropdownMenuItem asChild><a href={item.url} target="_blank" rel="noopener noreferrer"><ExternalLinkIcon />{t("item.openLink")}</a></DropdownMenuItem>}
          {onDelete && <><DropdownMenuSeparator /><DropdownMenuItem variant="destructive" onSelect={() => onDelete(item)}><Trash2Icon />{common("actions.delete")}</DropdownMenuItem></>}
        </DropdownMenuContent>
      </DropdownMenu>

      {detailsOpen && <Stack gap="sm" id={detailsId} className="col-span-3 mt-2 min-w-0 rounded-lg bg-muted/30 p-3 text-sm">
        <Text weight="medium" className="break-words">{item.name}</Text>
        {item.amounts && <Text className="break-words tabular-nums">{quantity}</Text>}
        {item.note && <Text size="xs" tone="muted" className="whitespace-pre-line">{item.note}</Text>}
        {item.requirements && <Stack gap="xs" className="text-xs text-muted-foreground">{item.requirements.map((part) => <Text key={part.id} className="break-words">{part.recipe?.name ?? part.listName} · {shoppingItemQuantity(part, locale)}</Text>)}</Stack>}
        {badges.length > 0 && <Inline gap="1.5" align="center" wrap className="min-w-0">{badges}</Inline>}
        {item.alternatives.length > 0 && <Stack gap="xs" className="min-w-0 text-xs text-muted-foreground">
          <span>{t("alternatives.or")}</span>
          {item.alternatives.map((alternative) => <Inline gap="xs" align="center" wrap key={alternative.productId} className="min-w-0">
            <span className="break-words">{alternative.name}</span>
            {alternative.links.map((link) => link.url ? <a key={link.shop.id} href={link.url} target="_blank" rel="noopener noreferrer" title={t("item.openLink")} className="rounded-full outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"><ShopBadge shop={link.shop} /></a> : <ShopBadge key={link.shop.id} shop={link.shop} />)}
          </Inline>)}
        </Stack>}
        {bought && item.boughtByName && <Text size="xs" tone="muted">{t("item.boughtBy", { name: item.boughtByName })}</Text>}
        {actions && <Inline gap="sm" align="center" wrap className="min-w-0">{actions}</Inline>}
      </Stack>}
    </li>
  );
}
