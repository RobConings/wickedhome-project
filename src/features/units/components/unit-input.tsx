import * as React from "react";
import { Input } from "@/components/ui/input";
import { api } from "@/lib/api-client";
import type { UnitCatalogue } from "@/types/unit-catalogue";
import { unitOverview } from "@/types/unit-overview";

/** Suggest central units while preserving existing recipe labels and free-text units. */
export function UnitInput(props: React.ComponentProps<typeof Input>) {
  const id = React.useId();
  const [names, setNames] = React.useState(() => unitOverview([]).flatMap((unit) => [unit.name, ...unit.aliases]));
  React.useEffect(() => {
    let cancelled = false;
    api.get<UnitCatalogue>("/household/units").then((result) => { if (!cancelled) setNames(unitOverview(result.units).flatMap((unit) => [unit.name, ...unit.aliases])); }).catch(() => undefined);
    return () => { cancelled = true; };
  }, []);
  return <><Input {...props} list={id} /><datalist id={id}>{names.map((name) => <option key={name} value={name} />)}</datalist></>;
}
