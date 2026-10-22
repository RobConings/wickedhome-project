import * as React from "react";
import { CheckIcon, LinkIcon, MapPinIcon, SearchXIcon } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Card } from "@/components/shared/card";
import { EmptyState } from "@/components/shared/empty-state";
import { GeneralList } from "@/components/shared/general-list";
import { cn } from "@/lib/utils";
import { entityFitsField } from "../types/ha-entity-kind";
import type { HaEntity } from "../types/home-assistant";

type HaEntityBrowserProps = {
  entities: HaEntity[];
  /** First load (skeleton). */
  loading?: boolean;
  error?: boolean;
  onRetry?: () => void;
  /** When binding a device field: entities that fit its type are marked, and the list can show only those. */
  fieldType?: "boolean" | "number" | "text" | "choice";
  /** Entities a device field is already bound to. */
  boundIds?: ReadonlySet<string>;
  /** The currently bound entity (highlighted). */
  selectedId?: string | null;
  /** Makes rows buttons; without it the browser is read-only. */
  onPick?: (entity: HaEntity) => void;
  /** Remember the view switch under this key. */
  storageKey?: string;
};

const ALL = "__all";

/** Search Home Assistant entities by name, entity id, area or domain; optionally pick one. */
export function HaEntityBrowser({ entities, loading, error, onRetry, fieldType, boundIds, selectedId, onPick, storageKey = "ha-entities" }: HaEntityBrowserProps) {
  const { t } = useTranslation("home-assistant");
  const [domain, setDomain] = React.useState(ALL);
  const [fittingOnly, setFittingOnly] = React.useState(Boolean(fieldType));
  const domains = React.useMemo(() => [...new Set(entities.map((entity) => entity.domain))].sort(), [entities]);
  const visible = entities.filter(
    (entity) => (domain === ALL || entity.domain === domain) && (!fieldType || !fittingOnly || entityFitsField(entity, fieldType)),
  );

  const toolbar = (
    <div className="flex flex-wrap items-center gap-3">
      <Select value={domain} onValueChange={setDomain}>
        <SelectTrigger className="w-full sm:w-52" aria-label={t("entities.domain")}>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={ALL}>{t("entities.allDomains")}</SelectItem>
          {domains.map((value) => (
            <SelectItem key={value} value={value}>
              {value}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      {fieldType && (
        <div className="flex items-center gap-2">
          <Switch id="ha-fitting-only" checked={fittingOnly} onCheckedChange={setFittingOnly} />
          <Label htmlFor="ha-fitting-only" className="text-sm font-normal">
            {t("entities.fittingOnly")}
          </Label>
        </div>
      )}
    </div>
  );

  const content = (entity: HaEntity, tile: boolean) => {
    const bound = boundIds?.has(entity.entityId);
    const selected = selectedId === entity.entityId;
    const body = (
      <span className={cn("flex min-w-0 flex-1 gap-3", tile ? "flex-col" : "items-center justify-between")}>
        <span className="flex min-w-0 flex-col gap-0.5">
          <span className="flex min-w-0 items-center gap-1.5 font-medium">
            {selected && <CheckIcon className="size-4 shrink-0 text-success" aria-label={t("entities.selected")} />}
            <span className="truncate">{entity.name}</span>
          </span>
          <span className="truncate font-mono text-xs text-muted-foreground">{entity.entityId}</span>
          {entity.area && (
            <span className="flex items-center gap-1 text-xs text-muted-foreground">
              <MapPinIcon className="size-3" aria-hidden="true" />
              {entity.area}
            </span>
          )}
        </span>
        <span className="flex shrink-0 flex-wrap items-center gap-1.5">
          {bound && (
            <Badge variant="secondary">
              <LinkIcon />
              {t("entities.bound")}
            </Badge>
          )}
          <Badge variant="outline" className="max-w-40 truncate tabular-nums">
            {entity.state}
            {entity.unit ? ` ${entity.unit}` : ""}
          </Badge>
        </span>
      </span>
    );
    if (!onPick) return body;
    return (
      <button
        type="button"
        onClick={() => onPick(entity)}
        className="-m-2 flex min-h-10 w-[calc(100%+1rem)] items-center rounded-lg p-2 text-left text-sm hover:bg-accent focus-visible:bg-accent focus-visible:outline-none"
      >
        {body}
      </button>
    );
  };

  return (
    <GeneralList
      label={t("entities.title")}
      items={visible}
      getKey={(entity) => entity.entityId}
      renderRow={(entity) => content(entity, false)}
      renderTile={(entity) => <Card className="h-full gap-2 p-4 text-sm">{content(entity, true)}</Card>}
      search={{ keys: (entity) => [entity.name, entity.entityId, entity.area, entity.domain], placeholder: t("entities.searchPlaceholder") }}
      storageKey={storageKey}
      defaultView="list"
      toolbar={toolbar}
      filtered={domain !== ALL || (Boolean(fieldType) && fittingOnly)}
      loading={loading}
      error={error ? t("entities.loadFailed") : undefined}
      onRetry={onRetry}
      emptyState={<EmptyState icon={SearchXIcon} title={t("entities.empty.title")} description={t("entities.empty.description")} />}
    />
  );
}
