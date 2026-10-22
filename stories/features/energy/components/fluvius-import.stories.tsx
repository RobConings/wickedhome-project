import type { Meta, StoryObj } from "@storybook/react-vite";
import { FluviusImport } from "@/features/energy/components/fluvius-import";
import type { FluviusUploadProgress } from "@/features/energy/data/energy-requests";
import type { FluviusParseResult } from "@/features/energy/types/fluvius-csv";
import { fluviusGasPreviewFixture, fluviusPreviewFixture } from "../fixtures";

/** Pretends to upload in batches of 500, slowly, so the bar, the stop button and the result can be tried. */
async function fakeUpload(
  parsed: FluviusParseResult,
  { onProgress, signal }: { onProgress?: (progress: FluviusUploadProgress) => void; signal?: AbortSignal } = {},
) {
  const total = parsed.intervals.length;
  const batches = Math.ceil(total / 500);
  let done = 0;
  for (let batch = 1; batch <= batches; batch++) {
    if (signal?.aborted) {
      return { received: done, upserted: done, inserted: done, updated: 0, batches, batchesDone: batch - 1, stopped: true };
    }
    await new Promise((resolve) => setTimeout(resolve, 600));
    done = Math.min(total, batch * 500);
    onProgress?.({ batch, batches, done, total });
  }
  return { received: total, upserted: total, inserted: total - 672, updated: 672, batches, batchesDone: batches, stopped: false };
}

const preview = fluviusPreviewFixture;
const total = preview.parsed.intervals.length;

const meta = {
  title: "Features/Energy/Components/FluviusImport",
  component: FluviusImport,
  decorators: [(Story) => <div className="w-[40rem] max-w-full">{Story()}</div>],
  args: { upload: fakeUpload },
} satisfies Meta<typeof FluviusImport>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Drop any Fluvius CSV here: it is parsed in the browser, in chunks, and the preview shows what's in it. */
export const ChooseFile: Story = {};
/** One week of quarter-hours (1–7 September 2026), parsed by the real parser. Import to see the batches. */
export const Preview: Story = { args: { initialState: { step: "preview", preview } } };
/** One January week of hourly gas (m³ and kWh rows, calorific value per hour). */
export const GasPreview: Story = { args: { initialState: { step: "preview", preview: fluviusGasPreviewFixture } } };
export const PreviewWithSkippedRows: Story = {
  args: {
    initialState: {
      step: "preview",
      preview: { ...preview, parsed: { ...preview.parsed, skipped: [{ line: 14, reason: "date" }, { line: 15, reason: "register" }] } },
    },
  },
};

/** Loading: the browser reads the file. */
export const Reading: Story = { args: { initialState: { step: "reading", fileName: preview.fileName } } };
/** Loading: a year of quarter-hours, parsed in chunks with the line count. */
export const Parsing: Story = {
  args: { initialState: { step: "parsing", fileName: preview.fileName, done: 58_000, total: 140_161 } },
};
/** Loading: batch 3 of 12 is being saved; the stop button ends it after this batch. */
export const Saving: Story = {
  args: {
    initialState: {
      step: "uploading",
      preview,
      progress: { batch: 2, batches: 12, done: 4000, total: 24_000 },
      stopping: false,
    },
  },
};
export const Stopping: Story = {
  args: {
    initialState: { step: "uploading", preview, progress: { batch: 5, batches: 12, done: 10_000, total: 24_000 }, stopping: true },
  },
};
export const Done: Story = {
  args: {
    initialState: {
      step: "done",
      preview,
      result: { received: total, upserted: total, inserted: total - 672, updated: 672, batches: 2, batchesDone: 2, stopped: false },
    },
  },
};
export const Stopped: Story = {
  args: {
    initialState: {
      step: "done",
      preview,
      result: { received: 2000, upserted: 2000, inserted: 2000, updated: 0, batches: 2, batchesDone: 1, stopped: true },
    },
  },
};
export const UploadFails: Story = {
  args: { initialState: { step: "preview", preview }, upload: async () => Promise.reject(new Error("offline")) },
};
