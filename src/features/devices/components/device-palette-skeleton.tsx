import { useTranslation } from "react-i18next";
import { Skeleton } from "@/components/ui/skeleton";
import { Spinner } from "@/components/ui/spinner";

/** The palette while the devices load: a few chip-shaped placeholders. */
export function DevicePaletteSkeleton() {
  const { t } = useTranslation("devices");
  return (
    <div role="status" className="flex flex-col gap-2">
      <span className="flex items-center gap-2 text-xs text-muted-foreground">
        <Spinner className="size-3.5" />
        {t("placement.loading")}
      </span>
      <div aria-hidden className="flex flex-wrap gap-2">
        {[9, 11, 8].map((width, index) => (
          <Skeleton key={index} className="h-11 rounded-lg" style={{ width: `${width}rem` }} />
        ))}
      </div>
    </div>
  );
}
