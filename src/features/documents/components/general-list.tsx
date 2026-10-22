import * as React from "react";
import { LayoutGridIcon, ListIcon, SearchXIcon } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useSearchParams } from "react-router";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Inline } from "./inline";
import { PageGrid } from "./page-grid";
import { PageSection } from "./page-section";
import { Stack } from "./stack";
import { Card } from "./card";
import { EmptyState } from "./empty-state";
import { ErrorState } from "./error-state";
import {
  filterBySearch,
  groupListItems,
  normalizeSearchText,
  readStoredListView,
  resolveListView,
  storeListView,
  type ListView,
} from "./general-list-helpers";
import { PendingContent, SkeletonList } from "./loading-state";
import { SearchField } from "./search-field";
import { SectionHeader } from "./section-header";
import { SegmentedControl } from "./segmented-control";

export type { ListView } from "./general-list-helpers";

type SearchText = string | number | null | undefined;

export type GeneralListSearch<T> = {
  /** Accessible name of the field (default "Search"). */
  label?: string;
  placeholder?: string;
  /**
   * Client-side search: the texts of an item to look in, as property names or a function. Matching
   * ignores case and accents, and every typed word must be found.
   */
  keys?: ReadonlyArray<keyof T> | ((item: T) => ReadonlyArray<SearchText>);
  /** Client-side search with your own rule; gets the trimmed query. Use instead of `keys`. */
  filter?: (item: T, query: string) => boolean;
  /**
   * Server-side or controlled search: the current query. Without `keys`/`filter` the items are shown as
   * given, so the loader (or caller) does the filtering.
   */
  query?: string;
  /** Called with every new (debounced) query. */
  onSearch?: (query: string) => void;
  /** Keep the query in this URL search param (e.g. "q"): survives reloads and reruns the route's loader. */
  param?: string;
  /** Pause before a typed query applies. Default 150 ms client-side, 300 ms server-side. */
  debounceMs?: number;
};

export type GeneralListProps<T> = {
  items: readonly T[];
  getKey: (item: T) => string;
  /** One row of the list view: the content only, the list draws the dividers and padding. */
  renderRow: (item: T) => React.ReactNode;
  /** One tile of the tiles view, usually a `Card`; it is stretched to the row's height. */
  renderTile: (item: T) => React.ReactNode;
  /** Every list has the same search field; this says what it searches. */
  search: GeneralListSearch<T>;
  /** Accessible name of the list, e.g. "Shops". */
  label: string;
  /** Remembers the chosen view per list on this device (e.g. "shops"). */
  storageKey?: string;
  /** View until the person picks one. */
  defaultView?: ListView;
  /** Let the URL choose the view through this search param (e.g. "view"), and keep it there. */
  viewParam?: string;
  /** Filters, sort or other controls, on their own row under the search field. */
  toolbar?: React.ReactNode;
  /** A few compact actions next to the view switcher (e.g. an icon button). */
  actions?: React.ReactNode;
  /** A toolbar filter is active: nothing left then shows "no results" instead of the empty state. */
  filtered?: boolean;
  /** Shown when there are no items at all (no search, no filter). Search and switcher hide then. */
  emptyState: React.ReactNode;
  /** Replaces the standard "Nothing found for …" state. */
  noResultsState?: React.ReactNode;
  /** First load: a skeleton shaped like rows or tiles. */
  loading?: boolean;
  skeletonCount?: number;
  /** Newer items are loading: keeps showing these, faded, with a spinner. */
  pending?: boolean;
  /** Couldn't load: `true` for the standard message, or your own description. */
  error?: React.ReactNode;
  /** Shows a "Try again" button in the error state. */
  onRetry?: () => void;
  /** Split into sections. An item may be in several groups (e.g. "favorites" and its type). */
  groupBy?: (item: T) => string | readonly string[];
  /** Group keys in display order; other keys follow in order of appearance. */
  groupOrder?: readonly string[];
  /** Section title of a group; defaults to its key. */
  renderGroupHeader?: (key: string, items: T[]) => React.ReactNode;
  /** Shown at the right of a group's title, e.g. its total or "2 of 5 done". */
  renderGroupActions?: (key: string, items: T[]) => React.ReactNode;
  /** Shown between a group's title and its items, e.g. a progress bar. */
  renderGroupIntro?: (key: string, items: T[]) => React.ReactNode;
  /** In the list view, show groups in two columns from `md` up. */
  groupColumns?: 1 | 2;
  className?: string;
};

const searchTexts = <T,>(search: GeneralListSearch<T>) => {
  const { keys } = search;
  if (!keys) return null;
  if (typeof keys === "function") return keys;
  return (item: T) =>
    keys.map((key) => {
      const value = item[key];
      return typeof value === "string" || typeof value === "number" ? value : null;
    });
};

/**
 * The standard list of a screen: one search field, a list/tiles switch (remembered per list), optional
 * filters and groups, and the empty, no-results, loading, refreshing and error states. Screens give it
 * the data and how one row and one tile look.
 */
export function GeneralList<T>({
  items,
  getKey,
  renderRow,
  renderTile,
  search,
  label,
  storageKey,
  defaultView = "list",
  viewParam,
  toolbar,
  actions,
  filtered = false,
  emptyState,
  noResultsState,
  loading = false,
  skeletonCount = 6,
  pending = false,
  error,
  onRetry,
  groupBy,
  groupOrder,
  renderGroupHeader,
  renderGroupActions,
  renderGroupIntro,
  groupColumns = 1,
  className,
}: GeneralListProps<T>) {
  const { t } = useTranslation();
  const idPrefix = React.useId();
  const [searchParams, setSearchParams] = useSearchParams();

  // --- Search -------------------------------------------------------------------------------------
  const [localQuery, setLocalQuery] = React.useState("");
  const urlQuery = search.param ? (searchParams.get(search.param) ?? "") : null;
  const query = search.query ?? urlQuery ?? localQuery;
  const getTexts = searchTexts(search);
  const clientSide = Boolean(getTexts || search.filter);

  const setQuery = (next: string) => {
    search.onSearch?.(next);
    if (search.query !== undefined) return;
    const { param } = search;
    if (param) {
      setSearchParams(
        (previous) => {
          const params = new URLSearchParams(previous);
          if (next.trim()) params.set(param, next);
          else params.delete(param);
          return params;
        },
        { replace: true, preventScrollReset: true },
      );
    } else {
      setLocalQuery(next);
    }
  };

  const trimmed = query.trim();
  const searching = normalizeSearchText(query) !== "";
  const { filter } = search;
  let visible: readonly T[] = items;
  if (searching && getTexts) visible = filterBySearch(items, trimmed, getTexts);
  else if (searching && filter) visible = items.filter((item) => filter(item, trimmed));

  // --- View ---------------------------------------------------------------------------------------
  const [storedView, setStoredView] = React.useState(() => (storageKey ? readStoredListView(storageKey) : null));
  const view = resolveListView({
    urlValue: viewParam ? searchParams.get(viewParam) : null,
    storedValue: storedView,
    defaultView,
  });

  const changeView = (next: ListView) => {
    setStoredView(next);
    if (storageKey) storeListView(storageKey, next);
    if (viewParam) {
      setSearchParams(
        (previous) => {
          const params = new URLSearchParams(previous);
          params.set(viewParam, next);
          return params;
        },
        { replace: true, preventScrollReset: true },
      );
    }
  };

  // --- What to show -------------------------------------------------------------------------------
  const pristineEmpty = !loading && !error && items.length === 0 && !searching && !filtered;

  const renderItems = (list: readonly T[], labelledBy?: string) =>
    view === "tiles" ? (
      <PageGrid columns="tiles" role="list" aria-label={labelledBy ? undefined : label} aria-labelledby={labelledBy}>
        {list.map((item) => (
          <div key={getKey(item)} role="listitem" className="flex min-w-0 flex-col *:flex-1">
            {renderTile(item)}
          </div>
        ))}
      </PageGrid>
    ) : (
      <Card className="gap-0 px-4 py-1 sm:px-5">
        <Stack
          gap="none"
          role="list"
          aria-label={labelledBy ? undefined : label}
          aria-labelledby={labelledBy}
          className="divide-y"
        >
          {list.map((item) => (
            <div key={getKey(item)} role="listitem" className="flex min-h-10 min-w-0 flex-col justify-center py-2.5">
              {renderRow(item)}
            </div>
          ))}
        </Stack>
      </Card>
    );

  const renderContent = () => {
    if (error) {
      return (
        <ErrorState
          title={t("list.errorTitle")}
          description={error === true ? t("list.errorDescription") : error}
          action={onRetry && <Button onClick={onRetry}>{t("actions.retry")}</Button>}
        />
      );
    }
    if (loading) {
      return (
        <div role="status">
          <span className="sr-only">{t("loading.default")}</span>
          {view === "tiles" ? (
            <PageGrid columns="tiles" aria-hidden>
              {Array.from({ length: skeletonCount }, (_, index) => (
                <div key={index} className="flex flex-col gap-3 rounded-xl border bg-card p-4">
                  <Skeleton className="size-10 rounded-full" />
                  <Skeleton className="h-4" style={{ width: `${80 - ((index * 13) % 30)}%` }} />
                  <Skeleton className="h-3 w-1/2" />
                </div>
              ))}
            </PageGrid>
          ) : (
            <Card className="gap-0 px-4 py-1 sm:px-5">
              <SkeletonList rows={skeletonCount} />
            </Card>
          )}
        </div>
      );
    }
    if (pristineEmpty) return emptyState;
    if (visible.length === 0) {
      return (
        noResultsState ?? (
          <EmptyState
            icon={SearchXIcon}
            title={searching ? t("list.noResultsTitle", { query: trimmed }) : t("list.noResultsFilteredTitle")}
            description={t("list.noResultsDescription")}
            action={
              searching && (
                <Button variant="outline" onClick={() => setQuery("")}>
                  {t("list.clearSearch")}
                </Button>
              )
            }
          />
        )
      );
    }

    if (!groupBy) return <PendingContent pending={pending} label={t("loading.updating")}>{renderItems(visible)}</PendingContent>;

    const groups = groupListItems(visible, groupBy, groupOrder);
    const sections = groups.map((group, index) => {
      const headingId = `${idPrefix}-group-${index}`;
      return (
        <PageSection key={group.key} aria-labelledby={headingId}>
          <SectionHeader
            id={headingId}
            accent
            title={renderGroupHeader?.(group.key, group.items) ?? group.key}
            actions={renderGroupActions?.(group.key, group.items)}
          />
          {renderGroupIntro?.(group.key, group.items)}
          {renderItems(group.items, headingId)}
        </PageSection>
      );
    });
    return (
      <PendingContent pending={pending} label={t("loading.updating")}>
        {view === "list" && groupColumns === 2 ? (
          <PageGrid columns="2" className="items-start">
            {sections}
          </PageGrid>
        ) : (
          <Stack gap="lg">{sections}</Stack>
        )}
      </PendingContent>
    );
  };

  return (
    <Stack gap="md" className={className}>
      {!pristineEmpty && (
        <Stack gap="sm">
          {/* The actions move under the search field when they don't fit next to it (phones). */}
          <Inline gap="sm" wrap>
            <SearchField
              value={query}
              onValueChange={setQuery}
              debounceMs={search.debounceMs ?? (clientSide ? 150 : 300)}
              label={search.label}
              placeholder={search.placeholder}
              className="min-w-0 flex-[1_1_12rem] sm:max-w-md"
            />
            <Inline gap="sm" wrap className="ml-auto max-w-full min-w-0">
              {actions}
              <ListViewSwitcher value={view} onChange={changeView} />
            </Inline>
          </Inline>
          {toolbar}
        </Stack>
      )}
      <p role="status" className="sr-only">
        {searching && !loading && !error ? t("list.results", { count: visible.length }) : ""}
      </p>
      {renderContent()}
    </Stack>
  );
}

/** The list/tiles switch: two icon buttons (radios), 40 px tall, labelled for screen readers. */
export function ListViewSwitcher({ value, onChange }: { value: ListView; onChange: (view: ListView) => void }) {
  const { t } = useTranslation();
  return (
    <SegmentedControl
      size="lg"
      iconOnly
      label={t("list.view")}
      value={value}
      onChange={onChange}
      options={[
        { value: "list", label: t("list.views.list"), icon: ListIcon },
        { value: "tiles", label: t("list.views.tiles"), icon: LayoutGridIcon },
      ]}
    />
  );
}
