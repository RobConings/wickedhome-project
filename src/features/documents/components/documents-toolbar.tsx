import { ArrowDownWideNarrowIcon } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { DocumentSort, DocumentSortKey } from "../data/use-document-view";

type DocumentsToolbarProps = {
  sort: DocumentSort;
  onSortChange: (sort: DocumentSort) => void;
};

const SORT_KEYS: DocumentSortKey[] = ["name", "modified", "size"];

/**
 * The drive's own list control: the sort menu, shown next to the list/tiles switch of the `GeneralList`
 * (which also brings the search field). On phones only its icon shows.
 */
export function DocumentsToolbar({ sort, onSortChange }: DocumentsToolbarProps) {
  const { t } = useTranslation("documents");
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="lg" className="px-3 sm:px-4">
          <ArrowDownWideNarrowIcon />
          <span className="hidden sm:inline">{t(`sort.${sort.key}`)}</span>
          <span className="sr-only sm:hidden">{t("sort.label")}</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-48">
        <DropdownMenuLabel>{t("sort.label")}</DropdownMenuLabel>
        <DropdownMenuRadioGroup
          value={sort.key}
          onValueChange={(key) => onSortChange({ key: key as DocumentSortKey, direction: key === "name" ? "asc" : "desc" })}
        >
          {SORT_KEYS.map((key) => (
            <DropdownMenuRadioItem key={key} value={key}>
              {t(`sort.${key}`)}
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
        <DropdownMenuSeparator />
        <DropdownMenuRadioGroup
          value={sort.direction}
          onValueChange={(direction) => onSortChange({ ...sort, direction: direction as DocumentSort["direction"] })}
        >
          <DropdownMenuRadioItem value="asc">{t(`sort.asc.${sort.key}`)}</DropdownMenuRadioItem>
          <DropdownMenuRadioItem value="desc">{t(`sort.desc.${sort.key}`)}</DropdownMenuRadioItem>
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
