import type { Meta, StoryObj } from "@storybook/react-vite";
import { DocumentsScreen } from "@/features/documents/screens/documents-screen";
import {
  deferredLoadingLoaderData,
  documentUploads,
  emptyFolderLoaderData,
  notarisLoaderData,
  rejects,
  rootLoaderData,
  searchLoaderData,
} from "../fixtures";

const meta = {
  title: "Features/Documents/Screens/DocumentsScreen",
  component: DocumentsScreen,
  parameters: { layout: "fullscreen" },
  args: { data: rootLoaderData, canManage: true, initialView: "tiles" },
} satisfies Meta<typeof DocumentsScreen>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Root: Story = {};
export const ListView: Story = { args: { initialView: "list" } };
export const Subfolder: Story = { args: { data: notarisLoaderData } };
export const Uploading: Story = { args: { initialUploads: documentUploads } };
/** The query lives in `?q=` (the list's search field reads it) and the loader returned the results. */
export const Search: Story = {
  args: { data: searchLoaderData, initialView: "list" },
  parameters: { router: { initialEntries: ["/documents?q=fluvius"] } },
};
export const SearchNoResults: Story = {
  args: { data: { ...searchLoaderData, query: "kadaster", search: { folders: [], files: [] } } },
  parameters: { router: { initialEntries: ["/documents?q=kadaster"] } },
};
export const EmptyFolder: Story = { args: { data: emptyFolderLoaderData } };
export const AsChild: Story = { args: { canManage: false } };
export const Mobile: Story = { args: { initialView: "list" }, globals: { viewport: { value: "mobile1" } } };
/** Tiles on a phone: two per row. */
export const MobileTiles: Story = { globals: { viewport: { value: "mobile1" } } };
/** The folder is shown at once; the storage meter (and the move dialog's folder tree) are still loading. */
export const Loading: Story = { args: { data: deferredLoadingLoaderData } };
/** The storage usage could not be loaded: the meter offers a retry, the rest of the page works. */
export const UsageFailed: Story = { args: { data: { ...rootLoaderData, usage: rejects() } } };
