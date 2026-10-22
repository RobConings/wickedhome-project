import * as React from "react";
import { LandmarkIcon, ZapIcon } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Await, Link } from "react-router";
import { PageContainer } from "@/components/layout/page-container";
import { PageGrid } from "@/components/layout/page-grid";
import { SkeletonTiles } from "@/components/shared/loading-state";
import { PageHeader } from "@/components/shared/page-header";
import { HabitantAvatar, type HouseholdOverview } from "@/features/household";
import { WasteCard, WasteCardSkeleton } from "@/features/waste";
import { WeatherCard, WeatherCardSkeleton } from "@/features/weather";
import { ComingSoonCard } from "../components/coming-soon-card";
import { DashboardCardSkeleton } from "../components/dashboard-card-skeleton";
import { DashboardStats } from "../components/dashboard-stats";
import { EnergyCard } from "../components/energy-card";
import { MoneyCard } from "../components/money-card";
import { TodayCard } from "../components/today-card";
import { UpcomingCard } from "../components/upcoming-card";
import type { DashboardScreenData } from "../data/dashboard-loaders";

type DashboardScreenProps = {
  /** From the loader: every slice a promise (or a plain value in stories). */
  data: DashboardScreenData;
  userName: string;
  /** The fourth stat card, filled by the route (Devices' house status, with its own Suspense). */
  homeStatus?: React.ReactNode;
  /** Injectable for stories and tests. */
  now?: Date;
};

function partOfDay(date: Date): "morning" | "afternoon" | "evening" {
  const hour = date.getHours();
  if (hour < 12) return "morning";
  if (hour < 18) return "afternoon";
  return "evening";
}

/** The household's habitants as a small stack of avatars, linking to the habitants page. */
function HouseholdAvatars({ overview }: { overview: HouseholdOverview }) {
  const { t } = useTranslation("dashboard");
  const shown = overview.habitants.slice(0, 5);
  return (
    <Link
      to="/habitants"
      className="flex items-center rounded-full outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
      aria-label={`${t("household.label", { name: overview.household.name, count: overview.habitants.length })}. ${t("household.manage")}`}
      title={t("household.manage")}
    >
      {shown.map((habitant) => (
        <HabitantAvatar key={habitant.id} habitant={habitant} size="md" className="-ml-2 ring-2 ring-background first:ml-0" />
      ))}
      {overview.habitants.length > shown.length && (
        <span className="-ml-2 grid size-10 place-items-center rounded-full bg-muted text-sm font-medium ring-2 ring-background">
          +{overview.habitants.length - shown.length}
        </span>
      )}
    </Link>
  );
}

/**
 * Home: what needs attention today (stat cards), the day's timeline, what's coming up, the next waste
 * collection, the weather and energy. Quick actions are not here: they live in the app frame ("+" in the
 * top bar, "+ Quick action" in the sidebar, Ctrl/Cmd + K), reachable from every page. The page renders at
 * once; every card shows its own skeleton until its data arrives and copes with that data failing to load.
 */
export function DashboardScreen({ data, userName, homeStatus, now = new Date() }: DashboardScreenProps) {
  const { t } = useTranslation("dashboard");
  const firstName = userName.split(/\s+/)[0];

  return (
    <PageContainer>
      <PageHeader
        eyebrow={t(`greeting.${partOfDay(now)}`)}
        title={firstName}
        description={t("intro")}
        actions={
          <React.Suspense fallback={null}>
            <Await resolve={data.household}>
              {(household) => (household && household.habitants.length > 0 ? <HouseholdAvatars overview={household} /> : null)}
            </Await>
          </React.Suspense>
        }
      />

      <React.Suspense fallback={<SkeletonTiles count={4} className="grid-cols-1 gap-3 sm:grid-cols-2 sm:gap-4 lg:grid-cols-4" />}>
        <Await resolve={data.tasks}>
          {(tasks) => (
            <Await resolve={data.shopping}>
              {(shopping) => (
                <Await resolve={data.expenses}>
                  {(expenses) => <DashboardStats tasks={tasks} shopping={shopping} expenses={expenses} homeStatus={homeStatus} />}
                </Await>
              )}
            </Await>
          )}
        </Await>
      </React.Suspense>

      <PageGrid columns="3" className="items-start">
        <React.Suspense fallback={<DashboardCardSkeleton title={t("today.title")} rows={4} />}>
          <Await resolve={data.agenda}>
            {(agenda) => <Await resolve={data.tasks}>{(tasks) => <TodayCard today={data.today} agenda={agenda} tasks={tasks} />}</Await>}
          </Await>
        </React.Suspense>
        <div className="flex flex-col gap-6">
          <React.Suspense fallback={<DashboardCardSkeleton title={t("upcoming.title")} rows={4} />}>
            <Await resolve={data.expenses}>
              {(expenses) => (
                <Await resolve={data.tasks}>
                  {(tasks) => <UpcomingCard today={data.today} expenses={expenses} tasks={tasks} />}
                </Await>
              )}
            </Await>
          </React.Suspense>
          <React.Suspense fallback={<WasteCardSkeleton />}>
            <Await resolve={data.waste}>{(waste) => <WasteCard today={data.today} summary={waste} />}</Await>
          </React.Suspense>
          <React.Suspense fallback={<DashboardCardSkeleton title={t("money.title")} icon={LandmarkIcon} tone="success" rows={3} />}>
            <Await resolve={data.money}>{(money) => <MoneyCard summary={money} />}</Await>
          </React.Suspense>
        </div>
        <div className="flex flex-col gap-6 md:col-span-2 md:grid md:grid-cols-2 xl:col-span-1 xl:flex">
          <React.Suspense fallback={<WeatherCardSkeleton />}>
            <Await resolve={data.weather}>{(weather) => <WeatherCard weather={weather} />}</Await>
          </React.Suspense>
          <React.Suspense fallback={<DashboardCardSkeleton title={t("energy.title")} icon={ZapIcon} tone="highlight" rows={2} />}>
            <Await resolve={data.energy}>{(energy) => <EnergyCard today={data.today} summary={energy} />}</Await>
          </React.Suspense>
          <ComingSoonCard />
        </div>
      </PageGrid>
    </PageContainer>
  );
}
