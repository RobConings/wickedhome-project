import { Stack } from "@/components/layout/stack";
import { Text } from "@/components/ui/text";
import * as React from "react";
import { useTranslation } from "react-i18next";
import { FormField } from "@/components/shared/form-field";
import { InlineAlert } from "@/components/shared/inline-alert";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import type { UseSelectionsOptions } from "@/lib/selections";
import { useAsyncResource } from "@/lib/use-async-resource";
import { fetchDevicesOverview } from "../data/devices-requests";
import type { DevicesOverview } from "../types/devices";
import { DevicePicker } from "./device-picker";

/** The Devices owner contributes its picker to task forms through route composition. */
export function DeviceFormField({ defaultValue = null, initialData, initialSelections, errors }: { defaultValue?: string | null; errors?: string[]; initialData?: DevicesOverview; initialSelections?: UseSelectionsOptions["initial"] }) {
  const { t } = useTranslation("devices");
  const { t: tCommon } = useTranslation();
  const id = React.useId();
  const { data, error, loading, refresh } = useAsyncResource("device-task-picker", fetchDevicesOverview, { initial: initialData });
  return (
    <Stack gap="sm">
      {error && <InlineAlert tone="error"><Text>{t("maintenance.loadError")}</Text><Button type="button" variant="outline" size="sm" onClick={refresh}>{tCommon("actions.retry")}</Button></InlineAlert>}
      <FormField htmlFor={id} label={t("maintenance.device")} optionalLabel={tCommon("form.optional")} errors={errors}>
        {data ? (
          <DevicePicker id={id} name="deviceId" defaultValue={defaultValue} devices={data.devices} profiles={data.profiles} initialSelections={initialSelections} clearable />
        ) : (
          <Input id={id} disabled value={loading ? tCommon("loading.updating") : t("maintenance.loadError")} />
        )}
      </FormField>
      {/* An unavailable picker must not clear the existing relationship when the other task fields save. */}
      {!data && <input type="hidden" name="deviceId" value={defaultValue ?? ""} />}
    </Stack>
  );
}
