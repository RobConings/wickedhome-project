import { Stack } from "@/components/layout/stack";
import { Inline } from "@/components/layout/inline";
import { useTranslation } from "react-i18next";
import { Skeleton } from "@/components/ui/skeleton";
import { Spinner } from "@/components/ui/spinner";

/** The palette while the devices load: a few chip-shaped placeholders. */
export function DevicePaletteSkeleton() {
  const { t } = useTranslation("devices");
  return (
    <Stack gap="sm" role="status">
      <span className="flex items-center gap-2 text-xs text-muted-foreground">
        <Spinner className="size-3.5" />
        {t("placement.loading")}
      </span>
      <Inline gap="sm" align="stretch" wrap aria-hidden>
        {[9, 11, 8].map((width, index) => (
          <Skeleton key={index} className="h-11 rounded-lg" style={{ width: `${width}rem` }} />
        ))}
      </Inline>
    </Stack>
  );
}
