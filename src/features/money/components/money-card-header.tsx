import type * as React from "react";
import type { LucideIcon } from "lucide-react";
import { CardDescription, CardTitle } from "./card";

type MoneyCardHeaderProps = {
  icon: LucideIcon;
  title: React.ReactNode;
  description?: React.ReactNode;
  /** Buttons or a link: on the right when there is room, else below the title. */
  actions?: React.ReactNode;
};

/**
 * Header of a money flow card: icon and title, the description under the title, actions on the right only
 * when the card is wide enough (they wrap below otherwise, never squeezing the description).
 */
export function MoneyCardHeader({ icon: Icon, title, description, actions }: MoneyCardHeaderProps) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2">
      <div className="flex min-w-[min(100%,14rem)] flex-1 flex-col gap-1">
        <div className="flex items-center gap-2">
          <Icon className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
          <CardTitle>{title}</CardTitle>
        </div>
        {description && <CardDescription>{description}</CardDescription>}
      </div>
      {actions && <div className="flex max-w-full flex-wrap items-center gap-2 max-sm:w-full max-sm:[&>*]:flex-1">{actions}</div>}
    </div>
  );
}
