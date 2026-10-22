import * as React from "react";
import { MapIcon, PencilIcon, PlusIcon, Trash2Icon } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Link, useFetcher } from "react-router";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Card, CardHeader, CardTitle } from "@/components/shared/card";
import { DeleteConfirmDialog } from "@/components/shared/confirm-dialog";
import type { PlacesActionResult } from "../data/places-loaders";
import { PLACE_COLORS, type Floor, type Place } from "../types/places";
import { FloorFormDialog } from "./floor-form-dialog";
import { PlaceListItem } from "./place-list-item";
import { useFetcherErrorToast } from "@/lib/hooks/use-fetcher-result";

type FloorSectionProps = {
  floor: Floor;
  /** The places on this floor. */
  places: Place[];
  /** Show add, edit and delete actions. */
  canManage: boolean;
};

/** A floor (or the outdoor plan) with its places as a list, a quick way to add one, and the way to its plan. */
export function FloorSection({ floor, places, canManage }: FloorSectionProps) {
  const { t } = useTranslation("places");
  const fetcher = useFetcher<PlacesActionResult>();
  const deleting = fetcher.state !== "idle" && fetcher.formData?.get("intent") === "delete-floor";
  const drawn = places.filter((place) => place.polygon).length;

  useFetcherErrorToast(fetcher);

  return (
    <Card className={deleting ? "opacity-50" : undefined} aria-busy={deleting || undefined} aria-labelledby={`floor-${floor.id}`}>
      <CardHeader className="flex-wrap items-center">
        <div className="flex min-w-0 flex-col gap-1.5">
          <CardTitle id={`floor-${floor.id}`} className="truncate text-lg">
            {floor.name}
          </CardTitle>
          <div className="flex flex-wrap gap-1.5">
            <Badge variant="secondary" className="font-normal">
              {floor.kind === "outdoor" ? t("floorKinds.outdoor") : t("floor.level", { level: floor.level })}
            </Badge>
            <Badge variant="outline" className="font-normal text-muted-foreground">
              {t("floor.drawnCount", { drawn, count: places.length })}
            </Badge>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-1">
          <Button asChild variant="outline" size="sm">
            <Link to={`/places/floors/${floor.id}/plan`}>
              <MapIcon />
              {t("floor.openPlan")}
            </Link>
          </Button>
          {canManage && (
            <>
              <FloorFormDialog
                floor={floor}
                trigger={
                  <Button variant="ghost" size="icon-sm" aria-label={t("floor.edit")} title={t("floor.edit")}>
                    <PencilIcon />
                  </Button>
                }
              />
              {places.length > 0 ? (
                <Tooltip>
                  <TooltipTrigger asChild>
                    {/* Wrapper keeps the tooltip working on a disabled button. */}
                    <span tabIndex={0}>
                      <Button variant="ghost" size="icon-sm" disabled aria-label={t("floor.delete.action")}>
                        <Trash2Icon />
                      </Button>
                    </span>
                  </TooltipTrigger>
                  <TooltipContent>{t("floor.delete.hasPlaces")}</TooltipContent>
                </Tooltip>
              ) : (
                <DeleteConfirmDialog
                  trigger={
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      className="text-destructive hover:text-destructive"
                      aria-label={t("floor.delete.action")}
                      title={t("floor.delete.action")}
                    >
                      <Trash2Icon />
                    </Button>
                  }
                  title={t("floor.delete.title", { name: floor.name })}
                  description={t("floor.delete.description")}
                  onConfirm={() => fetcher.submit({ intent: "delete-floor", id: floor.id }, { method: "post" })}
                />
              )}
            </>
          )}
        </div>
      </CardHeader>

      {places.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t(`list.empty.${floor.kind}`)}</p>
      ) : (
        <ul className="-mx-2.5 grid grid-cols-1 gap-x-4 sm:grid-cols-2">
          {places.map((place) => (
            <li key={place.id}>
              <PlaceListItem place={place} />
            </li>
          ))}
        </ul>
      )}

      {canManage && <QuickAddPlace floor={floor} placeCount={places.length} />}
    </Card>
  );
}

/** Type a name, press Enter: the fastest way to list every room before drawing anything. */
function QuickAddPlace({ floor, placeCount }: { floor: Floor; placeCount: number }) {
  const { t } = useTranslation("places");
  const fetcher = useFetcher<PlacesActionResult>({ key: `quick-add-${floor.id}` });
  const formRef = React.useRef<HTMLFormElement>(null);
  const submitting = fetcher.state !== "idle";
  const inputId = `quick-add-${floor.id}`;

  // Clear the field after each add; focus stays in it for the next name.
  React.useEffect(() => {
    if (fetcher.state !== "idle" || !fetcher.data) return;
    if (fetcher.data.ok) formRef.current?.reset();
    else toast.error(fetcher.data.errors?.name?.join(" ") ?? fetcher.data.formError);
  }, [fetcher.state, fetcher.data]);

  return (
    <fetcher.Form ref={formRef} method="post" noValidate className="flex items-center gap-2 border-t pt-3">
      <input type="hidden" name="intent" value="create-place" />
      <input type="hidden" name="floorId" value={floor.id} />
      <input type="hidden" name="color" value={PLACE_COLORS[placeCount % PLACE_COLORS.length]} />
      <label htmlFor={inputId} className="sr-only">
        {t(`list.quickAdd.${floor.kind}`)}
      </label>
      <Input
        id={inputId}
        name="name"
        placeholder={t(`list.quickAdd.${floor.kind}`)}
        autoComplete="off"
        maxLength={60}
        required
        // Read-only (not disabled) while adding, so focus stays here for the next name.
        readOnly={submitting}
        className="h-8"
      />
      <Button type="submit" size="sm" variant="secondary" loading={submitting}>
        <PlusIcon />
        {t("list.add")}
      </Button>
    </fetcher.Form>
  );
}
