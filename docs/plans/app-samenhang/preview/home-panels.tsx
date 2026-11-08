import { tr } from "./design-i18n";
import { Link } from "react-router";
import {
  HouseIcon,
  LightbulbIcon,
  ThermometerIcon,
  WashingMachineIcon,
  SparklesIcon,
  CpuIcon,
  MapPinIcon,
} from "lucide-react";
import { Card, CardTitle, CardDescription } from "@/components/shared/card";
import { IconChip } from "@/components/shared/icon-chip";
import { StatTile } from "@/components/shared/stat-tile";
import { PageGrid } from "@/components/layout/page-grid";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

/** Design-only compositions of the existing shared components; no real HA commands or state. */
export function HomePanels({
  id,
  state,
  href,
  onAction,
}: {
  id: string;
  state: string;
  href: (id: string) => string;
  onAction: () => void;
}) {
  const unavailable = state === "offline" || state === "stale";
  const isRoom = id === "room-live",
    isScenes = id === "ha-scenes",
    isDevice = id === "device-live-controls";
  const source = (
    <Card tone={unavailable ? "warning" : "featured"}>
      <div className="flex items-center gap-3">
        <IconChip
          icon={
            isDevice
              ? WashingMachineIcon
              : isRoom
                ? ThermometerIcon
                : LightbulbIcon
          }
          tone={isDevice ? "devices" : "highlight"}
          className="size-14 rounded-2xl [&_svg]:size-7"
        />
        <div>
          <CardTitle>
            {unavailable
              ? tr("Source is not current")
              : isDevice
                ? tr("Washing machine · linked")
                : isRoom
                  ? tr("Living room · comfortable")
                  : isScenes
                    ? tr("Choose a home mode")
                    : tr("Home Assistant · connected")}
          </CardTitle>
          <CardDescription>
            {unavailable
              ? tr(
                  "The current source state cannot be confirmed; controls are disabled.",
                )
              : tr("Source: Home Assistant · updated 15 seconds ago")}
          </CardDescription>
        </div>
      </div>
      <Badge variant={unavailable ? "warning" : "success"}>
        {unavailable ? tr("Unknown / not current") : "Live"}
      </Badge>
    </Card>
  );
  if (isScenes)
    return (
      <>
        {source}
        <PageGrid columns="2">
          {[
            [
              tr("Evening"),
              tr(
                "Dim living room lights and apply the configured evening scene",
              ),
            ],
            [
              tr("Away from home"),
              tr("Only the existing, explicitly linked Home Assistant scene"),
            ],
          ].map(([name, desc]) => (
            <Card key={name}>
              <IconChip icon={HouseIcon} tone="home" />
              <CardTitle>{name}</CardTitle>
              <CardDescription>{desc}</CardDescription>
              <Button
                variant="outline"
                disabled={unavailable}
                onClick={onAction}
              >
                {tr("Review and run home mode")}
              </Button>
            </Card>
          ))}
        </PageGrid>
      </>
    );
  if (isDevice)
    return (
      <>
        {source}
        <PageGrid columns="stats">
          <StatTile
            label={tr("State")}
            value={unavailable ? tr("Unknown") : tr("Available")}
            icon={WashingMachineIcon}
            iconTone="devices"
          />
          <StatTile
            label={tr("Power")}
            value={unavailable ? tr("Unknown") : "0 W"}
            icon={SparklesIcon}
            iconTone="energy"
          />
        </PageGrid>
        <Card>
          <CardTitle>{tr("What this device supports")}</CardTitle>
          <CardDescription>
            {tr(
              "This example washing machine provides sensor readings only. Start and stop controls appear only when the linked source actually supports them.",
            )}
          </CardDescription>
          <Button asChild variant="outline">
            <Link to={href("tasks")}>{tr("View maintenance tasks")}</Link>
          </Button>
        </Card>
      </>
    );
  if (isRoom)
    return (
      <>
        {source}
        <PageGrid columns="stats">
          <StatTile
            label={tr("Temperature")}
            value={unavailable ? tr("Unknown") : "20,5 °C"}
            icon={ThermometerIcon}
            iconTone="warning"
          />
          <StatTile
            label={tr("Lights")}
            value={unavailable ? tr("Unknown") : tr("2 on")}
            icon={LightbulbIcon}
            iconTone="highlight"
          />
        </PageGrid>
        <Card>
          <CardTitle>{tr("Living room lighting")}</CardTitle>
          <CardDescription>
            {tr("Open the device for its actual state and supported controls.")}
          </CardDescription>
          <Button asChild variant="outline">
            <Link to={href("ha-entity")}>{tr("Open living room lamp")}</Link>
          </Button>
        </Card>
        <Card>
          <CardTitle>{tr("In this room")}</CardTitle>
          <Button asChild variant="ghost">
            <Link to={href("tasks")}>{tr("Tasks")}</Link>
          </Button>
          <Button asChild variant="ghost">
            <Link to={href("devices")}>{tr("Devices")}</Link>
          </Button>
        </Card>
      </>
    );
  if (id === "home-assistant")
    return (
      <>
        {source}
        <PageGrid columns="cards">
          {[
            [
              tr("Linked entities"),
              tr("State and capabilities by device"),
              "ha-entities",
              CpuIcon,
            ],
            [
              tr("Link rooms and devices"),
              tr("Reuse existing records"),
              "ha-map",
              MapPinIcon,
            ],
            [
              tr("Home modes"),
              tr("Run existing scenes using familiar controls"),
              "ha-scenes",
              HouseIcon,
            ],
            [
              tr("Connection and synchronisation"),
              tr("Freshness, issues and recovery"),
              "ha-connection",
              SparklesIcon,
            ],
          ].map(([title, desc, target, Icon]) => (
            <Card key={title as string}>
              <IconChip icon={Icon as typeof HouseIcon} tone="devices" />
              <CardTitle>{title as string}</CardTitle>
              <CardDescription>{desc as string}</CardDescription>
              <Button asChild variant="outline">
                <Link to={href(target as string)}>{tr("Open")}</Link>
              </Button>
            </Card>
          ))}
        </PageGrid>
      </>
    );
  return (
    <>
      {source}
      <Card>
        <div className="flex items-center gap-4">
          <IconChip
            icon={LightbulbIcon}
            tone="highlight"
            className="size-16 [&_svg]:size-9"
          />
          <div>
            <CardTitle>{tr("Living room lamp")}</CardTitle>
            <CardDescription>
              {unavailable
                ? tr("State unknown")
                : tr("On · dimmable · 65% brightness")}
            </CardDescription>
          </div>
        </div>
        <Button variant="outline" disabled={unavailable} onClick={onAction}>
          {tr("Toggle light in preview")}
        </Button>
        <details>
          <summary className="cursor-pointer text-sm">
            {tr("Source and capabilities")}
          </summary>
          <p className="mt-3 text-sm text-muted-foreground">
            {tr(
              "Linked to the living room. Supports on/off and dimming. Authorisation and execution use the central Home Assistant service.",
            )}
          </p>
        </details>
      </Card>
    </>
  );
}
