import type { ComponentProps } from "react";
import { Link, useLocation } from "react-router";
import { withRecordOrigin } from "@/lib/record-navigation";
/** A link to an owner record retains the originating record, search and filters. */
export function RecordLink({ to, ...props }: ComponentProps<typeof Link>) {
  const location = useLocation();
  return <Link {...props} to={typeof to === "string" ? withRecordOrigin(to, `${location.pathname}${location.search}${location.hash}`) : to} />;
}
