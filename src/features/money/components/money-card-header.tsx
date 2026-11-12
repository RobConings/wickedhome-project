import { Inline } from "@/components/layout/inline";
import { Stack } from "@/components/layout/stack";
import type * as React from "react";
import type { LucideIcon } from "lucide-react";
import { CardDescription, CardTitle } from "@/components/shared/card";

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
    <Inline gap="none" align="start" justify="between" wrap className="gap-x-4 gap-y-2">
      <Stack gap="xs" className="min-w-[min(100%,14rem)] flex-1">
        <Inline gap="sm" align="center">
          <Icon className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
          <CardTitle>{title}</CardTitle>
        </Inline>
        {description && <CardDescription>{description}</CardDescription>}
      </Stack>
      {actions && <Inline gap="sm" align="center" wrap className="max-w-full max-sm:w-full max-sm:[&>*]:flex-1">{actions}</Inline>}
    </Inline>
  );
}
