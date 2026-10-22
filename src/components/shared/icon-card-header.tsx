import type * as React from "react";
import type { LucideIcon } from "lucide-react";
import { CardHeader, CardTitle } from "./card";
import { IconChip } from "./icon-chip";

type IconCardHeaderProps = {
  /** The section's icon in a small chip before the title (none when omitted). */
  icon?: LucideIcon;
  tone?: React.ComponentProps<typeof IconChip>["tone"];
  title: React.ReactNode;
  /** A line under the title. */
  description?: React.ReactNode;
  /** Classes of the title + description column. */
  textClassName?: string;
  /** After the title: a badge, an sr-only status… */
  children?: React.ReactNode;
};

/** A card header with an icon chip, the title and optionally a description: dashboard cards, settings sections. */
export function IconCardHeader({ icon, tone, title, description, textClassName = "flex flex-col gap-0.5", children }: IconCardHeaderProps) {
  return (
    <CardHeader className="items-center justify-start gap-3">
      {icon && <IconChip icon={icon} tone={tone} size="sm" />}
      {description === undefined ? (
        <CardTitle>{title}</CardTitle>
      ) : (
        <div className={textClassName}>
          <CardTitle>{title}</CardTitle>
          <p className="text-sm text-muted-foreground">{description}</p>
        </div>
      )}
      {children}
    </CardHeader>
  );
}
