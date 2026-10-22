import type { Meta, StoryObj } from "@storybook/react-vite";
import { fn, waitFor } from "storybook/test";
import type { UploadDocumentOptions } from "@/features/documents";
import { PlanImportBusy, PlanImportDialog } from "@/features/places/components/plan-import-dialog";
import { ApiRequestError } from "@/lib/api-client";
import { floorFixtures } from "../fixtures";
import { syntheticPlanPdf, syntheticPlanPdfText, underlayFixture } from "../plan-import-fixtures";

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/** Stands in for the documents API: reports progress over about 1,5 s, then returns a fake document id. */
async function fakeUpload(_blob: Blob, { onProgress, signal }: UploadDocumentOptions) {
  for (let step = 1; step <= 10; step++) {
    await wait(150);
    if (signal?.aborted) throw new ApiRequestError(0, "aborted", "Upload cancelled");
    onProgress?.({ loaded: step, total: 10, fraction: step / 10 });
  }
  return { id: `doc-story-${Math.random().toString(36).slice(2, 8)}` };
}

const failingUpload = async () => {
  await wait(400);
  throw new ApiRequestError(413, "too_large", "Too large");
};

const meta = {
  title: "Features/Places/Components/PlanImportDialog",
  component: PlanImportDialog,
  parameters: { layout: "fullscreen" },
  args: {
    open: true,
    onOpenChange: fn(),
    onImported: fn(),
    floor: floorFixtures.ground,
    upload: fakeUpload,
  },
} satisfies Meta<typeof PlanImportDialog>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Step 1: choose a PDF, PNG or JPG. */
export const ChooseFile: Story = {};

/** A one-page PDF goes straight to cropping: drag around the ground floor, then "Import selection". */
export const Crop: Story = { args: { initialFile: syntheticPlanPdf() } };

/**
 * Turning in the crop step: the preview is turned a quarter to the right (the buttons next to the zoom),
 * the selection still works and the turn becomes the underlay's rotation. North is known, so the compass
 * shows where it will point.
 */
export const CropTurned: Story = {
  args: { initialFile: syntheticPlanPdf(), north: 30 },
  play: async () => {
    const button = await waitFor(
      () => {
        const element = document.querySelector<HTMLButtonElement>('button[aria-label="Rotate 90° right"], button[aria-label="90° naar rechts draaien"]');
        if (!element || element.disabled) throw new Error("Crop step not ready");
        return element;
      },
      { timeout: 15_000 },
    );
    button.click();
  },
};

/** Several pages: thumbnails render one by one, with progress. */
export const PickPage: Story = { args: { initialFile: syntheticPlanPdf({ pages: 2 }) } };

/** "Change crop" on an imported plan: the original comes back from Documents with the old selection. */
export const RedoCrop: Story = {
  args: {
    source: underlayFixture,
    loadStored: async () => {
      await wait(600);
      return new Blob([syntheticPlanPdfText()], { type: "application/pdf" });
    },
  },
};

/** The original is gone from Documents. */
export const SourceMissing: Story = {
  args: { source: underlayFixture, loadStored: () => Promise.reject(new ApiRequestError(404, "not_found", "Not found")) },
};

/** Storing fails (too large): the selection stays, with the error under it. Press "Whole page" to see it. */
export const UploadFails: Story = { args: { initialFile: syntheticPlanPdf(), upload: failingUpload } };

/** Loading: the busy states shown while opening, rendering and uploading. */
export const Loading: Story = {
  render: () => (
    <div className="mx-auto flex max-w-md flex-col gap-6 p-6">
      <PlanImportBusy label="Opening the plan…" progress={null} />
      <PlanImportBusy label="Saving the original in Documents…" progress={0.45} onCancel={fn()} cancelLabel="Cancel" />
      <PlanImportBusy label="Rendering the plan in high resolution…" progress={null} onCancel={fn()} cancelLabel="Cancel" />
    </div>
  ),
};
