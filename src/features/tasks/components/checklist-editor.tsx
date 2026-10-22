import * as React from "react";
import { PlusIcon, XIcon } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { MAX_CHECKLIST_ITEMS, type TaskChecklistItem } from "../types/tasks";

type Row = { key: string; label: string; done: boolean };

type ChecklistEditorProps = {
  /** Hidden input holding the steps as JSON (`[{ label, done }]`). */
  name: string;
  defaultValue?: Pick<TaskChecklistItem, "label" | "done">[];
  id?: string;
};

let keySeed = 0;
const newRow = (label = "", done = false): Row => ({ key: `row-${++keySeed}`, label, done });

/** Optional steps of a task: type a step, Enter adds the next one. Empty lines are ignored. */
export function ChecklistEditor({ name, defaultValue = [], id }: ChecklistEditorProps) {
  const { t } = useTranslation("tasks");
  const [rows, setRows] = React.useState<Row[]>(() => defaultValue.map((item) => newRow(item.label, item.done)));
  const [focusKey, setFocusKey] = React.useState<string | null>(null);
  const refs = React.useRef(new Map<string, HTMLInputElement>());
  const value = JSON.stringify(rows.filter((row) => row.label.trim()).map(({ label, done }) => ({ label: label.trim(), done })));

  React.useEffect(() => {
    if (focusKey) refs.current.get(focusKey)?.focus();
  }, [focusKey]);

  function add(afterIndex = rows.length - 1) {
    if (rows.length >= MAX_CHECKLIST_ITEMS) return;
    const row = newRow();
    setRows((current) => [...current.slice(0, afterIndex + 1), row, ...current.slice(afterIndex + 1)]);
    setFocusKey(row.key);
  }

  return (
    <div id={id} className="flex flex-col gap-2">
      <input type="hidden" name={name} value={value} />
      {rows.length > 0 && (
        <ol className="flex flex-col gap-1.5">
          {rows.map((row, index) => (
            <li key={row.key} className="flex items-center gap-2">
              <span className="w-5 text-right text-xs text-muted-foreground tabular-nums">{index + 1}.</span>
              <Input
                ref={(element) => {
                  if (element) refs.current.set(row.key, element);
                  else refs.current.delete(row.key);
                }}
                value={row.label}
                maxLength={200}
                aria-label={t("checklist.step", { number: index + 1 })}
                placeholder={t("checklist.placeholder")}
                onChange={(event) =>
                  setRows((current) => current.map((candidate) => (candidate.key === row.key ? { ...candidate, label: event.target.value } : candidate)))
                }
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    event.preventDefault();
                    add(index);
                  }
                }}
                className="h-8"
              />
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                aria-label={t("checklist.remove", { number: index + 1 })}
                onClick={() => setRows((current) => current.filter((candidate) => candidate.key !== row.key))}
              >
                <XIcon />
              </Button>
            </li>
          ))}
        </ol>
      )}
      <Button type="button" variant="outline" size="sm" className="self-start" onClick={() => add()} disabled={rows.length >= MAX_CHECKLIST_ITEMS}>
        <PlusIcon />
        {t("checklist.add")}
      </Button>
    </div>
  );
}
