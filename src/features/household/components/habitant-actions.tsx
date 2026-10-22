import * as React from "react";
import { PencilIcon, Trash2Icon } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useFetcher } from "react-router";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Inline } from "@/components/layout/inline";
import { DeleteConfirmDialog } from "@/components/shared/confirm-dialog";
import type { HabitantActionResult } from "../data/household-loaders";
import type { Habitant } from "../types/household";
import { HabitantFormDialog } from "./habitant-form-dialog";
import { useFetcherErrorToast } from "@/lib/hooks/use-fetcher-result";

type HabitantActionsProps = {
  habitant: Habitant;
  /** Icon buttons only (labels for screen readers and as tooltips), for rows. Tiles show labels from `sm` up. */
  iconOnly?: boolean;
};

/** Edit and delete for one habitant, used by the card (tiles) and the list row. */
export function HabitantActions({ habitant, iconOnly = false }: HabitantActionsProps) {
  const { t } = useTranslation("household");
  const { t: tCommon } = useTranslation();
  const fetcher = useFetcher<HabitantActionResult>();

  useFetcherErrorToast(fetcher);

  const size = iconOnly ? "icon" : "sm";
  const text = (label: string) => <span className={iconOnly ? "sr-only" : "max-sm:sr-only"}>{label}</span>;
  const deleteButton = (props: React.ComponentProps<typeof Button>) => (
    <Button
      variant="ghost"
      size={size}
      title={tCommon("actions.delete")}
      className="text-destructive hover:text-destructive"
      {...props}
    >
      <Trash2Icon />
      {text(tCommon("actions.delete"))}
    </Button>
  );

  return (
    <Inline gap="xs" justify="end" className="shrink-0">
      <HabitantFormDialog
        habitant={habitant}
        trigger={
          <Button variant="ghost" size={size} title={tCommon("actions.edit")}>
            <PencilIcon />
            {text(tCommon("actions.edit"))}
          </Button>
        }
      />
      {habitant.hasAccount ? (
        <Tooltip>
          <TooltipTrigger asChild>
            {/* Wrapper keeps the tooltip working on a disabled button. */}
            <span tabIndex={0}>{deleteButton({ disabled: true, title: undefined })}</span>
          </TooltipTrigger>
          <TooltipContent>{t("delete.hasAccount")}</TooltipContent>
        </Tooltip>
      ) : (
        <DeleteConfirmDialog
          trigger={deleteButton({})}
          title={t("delete.title", { name: habitant.name })}
          description={t("delete.description")}
          onConfirm={() => fetcher.submit({ intent: "delete", id: habitant.id }, { method: "post" })}
        />
      )}
    </Inline>
  );
}
