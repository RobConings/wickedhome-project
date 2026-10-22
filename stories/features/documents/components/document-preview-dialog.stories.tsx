import type { Meta, StoryObj } from "@storybook/react-vite";
import { fn } from "storybook/test";
import { DocumentPreviewDialog } from "@/features/documents/components/document-preview-dialog";
import { documentFiles, fluviusCsvSample, meterstandImage } from "../fixtures";

const meta = {
  title: "Features/Documents/Components/DocumentPreviewDialog",
  component: DocumentPreviewDialog,
  args: { file: documentFiles.meterstand, src: meterstandImage, onOpenChange: fn() },
} satisfies Meta<typeof DocumentPreviewDialog>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Image: Story = {};
export const CsvText: Story = { args: { file: documentFiles.fluvius2025, src: undefined, text: fluviusCsvSample } };
/** In Storybook there is no API, so the PDF frame stays empty; in the app it shows the browser's PDF viewer. */
export const Pdf: Story = { args: { file: documentFiles.plans, src: "about:blank" } };
export const NoPreview: Story = { args: { file: documentFiles.backup, src: undefined } };
/** The image can't be loaded (gone, no access, broken file): a message instead of an endless spinner. */
export const ImageFails: Story = { args: { src: "data:image/png;base64,AAAA" } };
