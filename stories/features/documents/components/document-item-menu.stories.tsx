import type { Meta, StoryObj } from "@storybook/react-vite";
import { fn } from "storybook/test";
import { DocumentItemMenu } from "@/features/documents/components/document-item-menu";
import { documentFiles, documentFolders } from "../fixtures";

const meta = {
  title: "Features/Documents/Components/DocumentItemMenu",
  component: DocumentItemMenu,
  args: { item: { kind: "file", file: documentFiles.akte }, canManage: true, onAction: fn() },
} satisfies Meta<typeof DocumentItemMenu>;

export default meta;
type Story = StoryObj<typeof meta>;

export const File: Story = {};
export const OpenFile: Story = { args: { open: true } };
export const Folder: Story = { args: { item: { kind: "folder", folder: documentFolders.huis }, open: true } };
export const NoPreview: Story = { args: { item: { kind: "file", file: documentFiles.backup }, open: true } };
export const AsChild: Story = { args: { canManage: false, open: true } };
