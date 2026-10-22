import * as React from "react";
import { SearchIcon, XIcon } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

type SearchFieldProps = {
  /** The applied query. When it changes from outside (cleared, back button), the field follows. */
  value: string;
  /** Called with the new query once typing pauses, at once on Enter, clear and Esc. */
  onValueChange: (value: string) => void;
  /** Pause before a typed query is applied. */
  debounceMs?: number;
  /** Accessible name; defaults to "Search". */
  label?: string;
  placeholder?: string;
  id?: string;
  className?: string;
};

/**
 * The one search field of the app: a search icon, `type="search"` (phones show a search key), a 40 px
 * clear button, Esc clears, and a debounce so lists don't redraw (or reload) on every key.
 */
export function SearchField({
  value,
  onValueChange,
  debounceMs = 200,
  label,
  placeholder,
  id,
  className,
}: SearchFieldProps) {
  const { t } = useTranslation();
  const [text, setText] = React.useState(value);
  // The last query we sent up; an outside change to anything else replaces what is typed.
  const [emitted, setEmitted] = React.useState(value);
  const [previousValue, setPreviousValue] = React.useState(value);
  if (value !== previousValue) {
    setPreviousValue(value);
    if (value !== emitted) {
      setEmitted(value);
      setText(value);
    }
  }

  const onValueChangeRef = React.useRef(onValueChange);
  React.useEffect(() => {
    onValueChangeRef.current = onValueChange;
  });

  const apply = React.useCallback((next: string) => {
    setEmitted(next);
    onValueChangeRef.current(next);
  }, []);

  React.useEffect(() => {
    if (text === emitted) return;
    const timer = window.setTimeout(() => apply(text), debounceMs);
    return () => window.clearTimeout(timer);
  }, [text, emitted, debounceMs, apply]);

  const clear = () => {
    setText("");
    apply("");
  };

  return (
    <div role="search" className={cn("relative", className)}>
      <SearchIcon
        className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground"
        aria-hidden="true"
      />
      <Input
        id={id}
        type="search"
        enterKeyHint="search"
        autoComplete="off"
        value={text}
        onChange={(event) => setText(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Escape" && text !== "") {
            // Clear the field, and don't let a surrounding dialog close.
            event.preventDefault();
            event.stopPropagation();
            clear();
          } else if (event.key === "Enter") {
            event.preventDefault();
            apply(text);
          }
        }}
        placeholder={placeholder ?? t("list.search")}
        aria-label={label ?? t("list.searchLabel")}
        className="h-10 pr-10 pl-9 [&::-webkit-search-cancel-button]:appearance-none"
      />
      {text !== "" && (
        <Button
          type="button"
          variant="ghost"
          size="icon"
          onClick={clear}
          aria-label={t("list.clearSearch")}
          title={t("list.clearSearch")}
          className="absolute top-0 right-0 size-10 text-muted-foreground"
        >
          <XIcon />
        </Button>
      )}
    </div>
  );
}
