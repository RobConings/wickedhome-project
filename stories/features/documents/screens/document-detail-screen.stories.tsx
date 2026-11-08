import type { Meta, StoryObj } from "@storybook/react-vite";
import { DocumentDetailScreen } from "@/features/documents/screens/document-detail-screen";
import { documentFiles, allDocumentFolders } from "../fixtures";
const file = documentFiles.luminus;
const meta = {
  title: "Features/Documents/Screens/DocumentDetailScreen", component: DocumentDetailScreen,
  parameters: { layout: "fullscreen" },
  args: { detail: { file, folder: null, links: [{ entityType: "product", entityId: "p-milk", name: "Household milk", href: "/inventory/products/p-milk" }] }, folders: allDocumentFolders, canManage: true },
} satisfies Meta<typeof DocumentDetailScreen>;
export default meta;
type Story = StoryObj<typeof meta>;
export const Default: Story = {};
export const Child: Story = { args: { canManage: false } };
export const Empty: Story = { args: { detail: { file, folder: null, links: [] } } };
export const Pending: Story = { args: { detail: { file: { ...file, uploadedAt: null }, folder: null, links: [] } } };
export const Deleted: Story = { args: { detail: { file: { ...file, deletedAt: "2026-10-01T10:00:00Z" }, folder: null, links: [] } } };
