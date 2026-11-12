import { Text } from "@/components/ui/text";
import { Stack } from "@/components/layout/stack";
import { Inline } from "@/components/layout/inline";
import { useState, type ComponentProps } from "react";
import { ShoppingCartIcon } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/shared/card";
import { GeneralForm, type GeneralFormField } from "@/components/shared/general-form";
import { IconChip } from "@/components/shared/icon-chip";
import { ShopDestinationPicker } from "@/features/shops";
import type { ShoppingPageData } from "../data/shopping-loaders";
import { sessionStartFormSchema } from "../data/sessions-actions";
import { requirementsForDestination } from "../types/visit-destination";

/** The ordinary trip starts with one decision. The service selects current needs on submit. */
export function SessionStartCard({ shopping, destination, onDestinationChange, initialSelections, action, compact = false }: {
  shopping: ShoppingPageData; destination: string | null; onDestinationChange: (value: string | null) => void;
  initialSelections?: ComponentProps<typeof ShopDestinationPicker>["initialSelections"];
  /** Lets the same destination form start a session from another shopping route. */
  action?: string;
  /** Only the picker/form, without a second title card inside a dialog. */
  compact?: boolean;
}) {
  const { t } = useTranslation("shopping");
  const [operationId] = useState(() => crypto.randomUUID());
  const shopIds = destination?.startsWith("group:") ? shopping.shopGroups?.find((group) => group.id === destination.slice(6))?.shopIds ?? [] : destination?.startsWith("shop:") ? [destination.slice(5)] : [];
  const count = shopIds.length ? requirementsForDestination(shopping.overview.items.filter((item) => item.status === "open"), shopIds, shopping.products).length : 0;
  const fields: GeneralFormField[] = [{
    name: "destination", type: "custom", label: t("sessions.destination"), optional: false,
    render: ({ id, name, value, setValue, invalid, disabled }) => <ShopDestinationPicker id={id} name={name}
      shops={shopping.shops} groups={shopping.shopGroups ?? []} initialSelections={initialSelections} value={typeof value === "string" ? value : null}
      onChange={setValue} invalid={invalid} disabled={disabled} />,
  }];
  const content = <>
    <GeneralForm navigate action={action} schema={sessionStartFormSchema} fields={fields} intent="start-session"
      hiddenFields={{ operationId }} defaultValues={{ destination }}
      onValuesChange={(values) => onDestinationChange(typeof values.destination === "string" ? values.destination : null)}
      submitLabel={t("sessions.startShopping")}
    />
    {destination && <Text size="sm" role="status" className="rounded-xl bg-section-soft p-3 text-section-foreground">{t("sessions.matchingNeeds", { count })}</Text>}
  </>;
  if (compact) return <Stack gap="3" className="min-w-0">{content}</Stack>;
  return <Card className="max-w-2xl">
    <CardHeader><Inline gap="md" align="center"><IconChip icon={ShoppingCartIcon} tone="shopping" /><div>
      <CardTitle>{t("sessions.simpleStart")}</CardTitle><CardDescription>{t("sessions.simpleDescription")}</CardDescription>
    </div></Inline></CardHeader>
    {content}
  </Card>;
}
