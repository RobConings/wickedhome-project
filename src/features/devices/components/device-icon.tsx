import * as React from "react";
import { cn } from "@/lib/utils";
import { deviceIconComponent } from "./device-icons";

/** A profile's or rule's icon, by key. */
export function DeviceIcon({ icon, className }: { icon: string | null | undefined; className?: string }) {
  return React.createElement(deviceIconComponent(icon), { className: cn("size-4", className), "aria-hidden": true });
}
