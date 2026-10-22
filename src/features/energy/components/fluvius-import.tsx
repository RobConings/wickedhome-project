import * as React from "react";
import { CircleCheckIcon, CircleStopIcon, FileSpreadsheetIcon } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Link, useRevalidator } from "react-router";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Card, CardFooter, CardHeader, CardTitle } from "./card";
import { DescriptionItem, DescriptionList } from "./description-list";
import { FileDropZone } from "./file-drop-zone";
import { InlineAlert } from "./inline-alert";
import { intlLocale } from "../lib/format";
import { currentLocale } from "@/lib/i18n";
import { formatDate } from "@/types/date-format";
import { uploadFluviusFile, type FluviusUploadProgress, type FluviusUploadResult } from "../data/energy-requests";
import { IMPORT_BATCH_SIZE } from "../types/energy";
import { FluviusFormatError, parseFluviusCsvInChunks, type FluviusParseResult } from "../types/fluvius-csv";
import { CarrierBadge } from "./carrier-badge";
import { formatCalorific, formatKwh, formatM3 } from "./energy-format";

export type FluviusPreview = { fileName: string; parsed: FluviusParseResult };

/** Where the import is. Exported so stories can start in any stage. */
export type FluviusImportState =
  | { step: "choose"; error?: string }
  | { step: "reading"; fileName: string }
  | { step: "parsing"; fileName: string; done: number; total: number }
  | { step: "preview"; preview: FluviusPreview; error?: string }
  | { step: "uploading"; preview: FluviusPreview; progress: FluviusUploadProgress; stopping: boolean }
  | { step: "done"; preview: FluviusPreview; result: FluviusUploadResult };

type FluviusImportProps = {
  /** Start in a given stage (stories). */
  initialState?: FluviusImportState;
  /** Replace the upload (stories); defaults to posting batches to the API. */
  upload?: typeof uploadFluviusFile;
  /** For gas files in m³ without a calorific value: the household's default, kWh/m³. */
  defaultCalorificKwhPerM3?: number;
};

const isAbort = (error: unknown) => error instanceof DOMException && error.name === "AbortError";

/**
 * Import the Mijn Fluvius CSV (electricity or gas) in clear stages: reading and parsing the file in the
 * browser (in chunks, so the page never freezes), a preview, saving in batches with a bar and a stop
 * button, and a summary at the end. Re-importing an overlapping file is safe.
 */
export function FluviusImport({ initialState, upload = uploadFluviusFile, defaultCalorificKwhPerM3 }: FluviusImportProps) {
  const { t } = useTranslation("energy");
  const locale = currentLocale();
  const number = (value: number) => value.toLocaleString(intlLocale(locale));
  const revalidator = useRevalidator();
  const [state, setState] = React.useState<FluviusImportState>(initialState ?? { step: "choose" });
  const controller = React.useRef<AbortController | null>(null);

  // Leaving the page stops parsing and further batches.
  React.useEffect(() => () => controller.current?.abort(), []);

  function start() {
    controller.current?.abort();
    controller.current = new AbortController();
    return controller.current.signal;
  }

  async function handleFiles([file]: File[]) {
    if (!file) return;
    const signal = start();
    setState({ step: "reading", fileName: file.name });
    try {
      const text = await file.text();
      if (signal.aborted) return;
      const parsed = await parseFluviusCsvInChunks(text, {
        fileName: file.name,
        defaultCalorificWhPerM3: defaultCalorificKwhPerM3 ? Math.round(defaultCalorificKwhPerM3 * 1000) : undefined,
        signal,
        onProgress: ({ done, total }) => setState({ step: "parsing", fileName: file.name, done, total }),
      });
      setState({ step: "preview", preview: { fileName: file.name, parsed } });
    } catch (error) {
      if (isAbort(error)) return;
      const message =
        error instanceof FluviusFormatError
          ? t(error.code === "empty" ? "import.errors.empty" : "import.errors.header")
          : t("import.errors.read");
      setState({ step: "choose", error: message });
    }
  }

  async function handleImport(preview: FluviusPreview) {
    const signal = start();
    const total = preview.parsed.intervals.length;
    let progress: FluviusUploadProgress = { batch: 0, batches: Math.ceil(total / IMPORT_BATCH_SIZE), done: 0, total };
    setState({ step: "uploading", preview, progress, stopping: false });
    try {
      const result = await upload(preview.parsed, {
        signal,
        onProgress: (next) => {
          progress = next;
          setState((current) => (current.step === "uploading" ? { ...current, progress: next } : current));
        },
      });
      setState({ step: "done", preview, result });
    } catch {
      setState({
        step: "preview",
        preview,
        error:
          progress.done > 0
            ? t("import.errors.uploadPartial", { batch: progress.batch, batches: progress.batches, rows: number(progress.done) })
            : t("import.errors.upload"),
      });
    } finally {
      // The meter list and the overview show the new data.
      void revalidator.revalidate();
    }
  }

  function stop() {
    controller.current?.abort();
    setState((current) => {
      if (current.step === "uploading") return { ...current, stopping: true };
      if (current.step === "reading" || current.step === "parsing") return { step: "choose" };
      return current;
    });
  }

  if (state.step === "choose") {
    return (
      <div className="flex flex-col gap-3">
        {state.error && <InlineAlert tone="error">{state.error}</InlineAlert>}
        <FileDropZone
          accept=".csv,text/csv"
          icon={FileSpreadsheetIcon}
          title={t("import.drop.title")}
          description={t("import.drop.description")}
          buttonLabel={t("import.drop.button")}
          onFiles={(files) => void handleFiles(files)}
        />
      </div>
    );
  }

  if (state.step === "reading" || state.step === "parsing") {
    const percent = state.step === "parsing" && state.total ? (state.done / state.total) * 100 : null;
    return (
      <Card aria-busy="true">
        <CardHeader className="items-center justify-start gap-3">
          <FileSpreadsheetIcon className="size-5 shrink-0 text-muted-foreground" aria-hidden="true" />
          <CardTitle className="min-w-0 truncate">{state.fileName}</CardTitle>
        </CardHeader>
        <div className="flex flex-col gap-2">
          <Progress value={percent} label={t("import.stages.parsingLabel")} />
          <p className="text-sm text-muted-foreground" role="status">
            {state.step === "reading"
              ? t("import.stages.reading")
              : t("import.stages.parsing", { done: number(state.done), total: number(state.total) })}
          </p>
        </div>
        <CardFooter className="justify-end">
          <Button variant="outline" onClick={stop}>
            {t("import.cancelFile")}
          </Button>
        </CardFooter>
      </Card>
    );
  }

  const { preview } = state;
  const { parsed } = preview;
  const date = (value: string | null) => (value ? formatDate(value, locale) : "–");
  const range = `${date(parsed.firstAt)} – ${date(parsed.lastAt)}`;

  if (state.step === "done") {
    const { result } = state;
    return (
      <Card>
        <CardHeader className="items-center justify-start gap-3">
          {result.stopped ? (
            <CircleStopIcon className="size-6 text-warning" aria-hidden="true" />
          ) : (
            <CircleCheckIcon className="size-6 text-success" aria-hidden="true" />
          )}
          <CardTitle>{result.stopped ? t("import.stopped.title") : t("import.done.title")}</CardTitle>
          <CarrierBadge carrier={parsed.carrier} className="ml-auto" />
        </CardHeader>
        <p className="text-sm text-muted-foreground" role="status">
          {result.stopped
            ? t("import.stopped.description", { batch: result.batchesDone, batches: result.batches })
            : t("import.done.description", { count: result.received })}
        </p>
        <DescriptionList>
          <DescriptionItem label={t("import.preview.range")}>{range}</DescriptionItem>
          <DescriptionItem label={t("import.result.rows")}>
            {t("import.result.rowsOf", { done: number(result.received), total: number(parsed.intervals.length) })}
          </DescriptionItem>
          <DescriptionItem label={t("import.result.inserted")}>{number(result.inserted)}</DescriptionItem>
          <DescriptionItem label={t("import.result.updated")}>{number(result.updated)}</DescriptionItem>
        </DescriptionList>
        <CardFooter className="flex-wrap">
          <Button asChild>
            <Link to={`/energy?carrier=${parsed.carrier}`}>{t("import.done.view")}</Link>
          </Button>
          {result.stopped && (
            <Button variant="outline" onClick={() => void handleImport(preview)}>
              {t("import.stopped.resume")}
            </Button>
          )}
          <Button variant="outline" onClick={() => setState({ step: "choose" })}>
            {t("import.done.again")}
          </Button>
        </CardFooter>
      </Card>
    );
  }

  const uploading = state.step === "uploading";
  const total = parsed.intervals.length;
  const hasVolume = parsed.registers.some((register) => register.volumeLitres !== null);

  return (
    <Card aria-busy={uploading || undefined}>
      <CardHeader className="items-center justify-start gap-3">
        <FileSpreadsheetIcon className="size-5 text-muted-foreground" aria-hidden="true" />
        <CardTitle>{t("import.preview.title")}</CardTitle>
        <CarrierBadge carrier={parsed.carrier} className="ml-auto" />
      </CardHeader>

      {state.step === "preview" && state.error && <InlineAlert tone="error">{state.error}</InlineAlert>}

      <DescriptionList>
        <DescriptionItem label={t("import.preview.file")}>
          <span className="break-all">{preview.fileName}</span>
        </DescriptionItem>
        <DescriptionItem label={t("import.preview.range")}>{range}</DescriptionItem>
        {parsed.ean && <DescriptionItem label={t("import.preview.ean")}>{parsed.ean}</DescriptionItem>}
        {parsed.calorific && (
          <DescriptionItem label={t("import.preview.calorific")}>
            {parsed.calorific.min === parsed.calorific.max
              ? formatCalorific(parsed.calorific.min, locale)
              : `${formatCalorific(parsed.calorific.min, locale)} – ${formatCalorific(parsed.calorific.max, locale)}`}
          </DescriptionItem>
        )}
      </DescriptionList>

      {total === 0 ? (
        <InlineAlert tone="error">{t("import.preview.noRows")}</InlineAlert>
      ) : (
        <div className="overflow-x-auto rounded-md border">
          <table className="w-full text-sm">
            <thead className="bg-muted text-left text-xs text-muted-foreground">
              <tr>
                <th scope="col" className="px-3 py-2 font-medium">
                  {t("import.preview.register")}
                </th>
                <th scope="col" className="px-3 py-2 text-right font-medium">
                  {t("import.preview.rows")}
                </th>
                {hasVolume && (
                  <th scope="col" className="px-3 py-2 text-right font-medium">
                    {t("import.preview.volume")}
                  </th>
                )}
                <th scope="col" className="px-3 py-2 text-right font-medium">
                  {t("import.preview.total")}
                </th>
              </tr>
            </thead>
            <tbody>
              {parsed.registers.map((register) => (
                <tr key={register.register} className="border-t">
                  <th scope="row" className="px-3 py-2 text-left font-normal">
                    {parsed.carrier === "gas"
                      ? t("import.preview.gasOfftake")
                      : `${t(`kinds.${register.kind}`)} · ${t(`registers.${register.tariff}`)}`}
                  </th>
                  <td className="px-3 py-2 text-right tabular-nums">{number(register.rows)}</td>
                  {hasVolume && (
                    <td className="px-3 py-2 text-right tabular-nums">
                      {register.volumeLitres === null ? "–" : formatM3(register.volumeLitres, locale)}
                    </td>
                  )}
                  <td className="px-3 py-2 text-right tabular-nums">{formatKwh(register.energyWh, locale)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {parsed.skipped.length > 0 && <InlineAlert>{t("import.preview.skipped", { count: parsed.skipped.length })}</InlineAlert>}

      {uploading && (
        <div className="flex flex-col gap-2">
          <Progress
            value={state.progress.batches ? (state.progress.batch / state.progress.batches) * 100 : 0}
            label={t("import.stages.savingLabel")}
          />
          <p className="flex flex-wrap justify-between gap-x-3 text-sm text-muted-foreground" role="status">
            <span>
              {state.stopping
                ? t("import.stages.stopping")
                : t("import.stages.saving", {
                    batch: Math.min(state.progress.batch + 1, state.progress.batches),
                    batches: state.progress.batches,
                  })}
            </span>
            <span className="tabular-nums">
              {t("import.stages.rows", { done: number(state.progress.done), total: number(state.progress.total) })}
            </span>
          </p>
        </div>
      )}

      <CardFooter className="flex-wrap justify-end">
        {uploading ? (
          <Button variant="outline" onClick={stop} loading={state.stopping} disabled={state.stopping}>
            <CircleStopIcon />
            {t("import.stop")}
          </Button>
        ) : (
          <>
            <Button variant="outline" onClick={() => setState({ step: "choose" })}>
              {t("import.cancelFile")}
            </Button>
            <Button disabled={total === 0} onClick={() => void handleImport(preview)}>
              {t("import.confirm", { count: total })}
            </Button>
          </>
        )}
      </CardFooter>
    </Card>
  );
}
