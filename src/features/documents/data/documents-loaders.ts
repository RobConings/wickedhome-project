import i18n from "i18next";
import { type ActionFunctionArgs, type LoaderFunctionArgs } from "react-router";
import { failedAction, type FormResult, formString, parseForm, readIntent } from "@/lib/forms";
import { notFoundAs404 } from "@/lib/loaders";
import { z } from "zod";
import {
  folderCreateSchema,
  type DocumentFolder,
  type DocumentSearchResult,
  type DocumentTrash,
  type FolderContents,
  type StorageUsage,
} from "../types/documents";
import {
  createFolder,
  deleteFilePermanently,
  deleteFolderPermanently,
  emptyTrash,
  fetchContents,
  fetchFolders,
  fetchTrash,
  fetchUsage,
  restoreFile,
  restoreFolder,
  searchDocuments,
  trashFile,
  trashFolder,
  updateFile,
  updateFolder,
} from "./documents-requests";
import { deferred } from "./use-settled";

export const DOCUMENT_INTENTS = [
  "create-folder",
  "update-folder",
  "rename-file",
  "move",
  "trash",
  "restore",
  "delete",
  "empty-trash",
] as const;
export type DocumentIntent = (typeof DOCUMENT_INTENTS)[number];

export type DocumentActionResult = FormResult & { intent?: DocumentIntent; id?: string };

export type DocumentsLoaderData = {
  contents: FolderContents;
  /** Set when the URL has `?q=`: search results across the whole drive. */
  search: DocumentSearchResult | null;
  query: string;
  /** All folders, for the move dialog. Deferred: only needed once the dialog opens. */
  folders: Promise<DocumentFolder[]>;
  /** Deferred: totals and disk stats are slow and not needed to show the folder. */
  usage: Promise<StorageUsage>;
};

export type DocumentsTrashLoaderData = {
  trash: DocumentTrash;
  /** Deferred, like on the drive page. */
  usage: Promise<StorageUsage>;
};


/**
 * `/documents` and `/documents/folders/:folderId`, optionally with `?q=` to search. Waits only for the
 * folder's contents (and the search); the folder tree and the storage usage arrive later.
 */
export async function documentsLoader({ params, request }: LoaderFunctionArgs): Promise<DocumentsLoaderData> {
  const query = new URL(request.url).searchParams.get("q")?.trim() ?? "";
  const folders = deferred(fetchFolders());
  const usage = deferred(fetchUsage());
  try {
    const [contents, search] = await Promise.all([
      fetchContents(params.folderId),
      query ? searchDocuments(query.slice(0, 100)) : Promise.resolve(null),
    ]);
    return { contents, search, query, folders, usage };
  } catch (error) {
    return notFoundAs404(error);
  }
}

export async function documentsTrashLoader(): Promise<DocumentsTrashLoaderData> {
  const usage = deferred(fetchUsage());
  return { trash: await fetchTrash(), usage };
}

const kindSchema = z.enum(["folder", "file"]);
const nameField = folderCreateSchema.shape.name;
/** `""` from the form = the drive root. */
const optionalId = z.preprocess((value) => (value === undefined || value === "" ? null : value), z.string().nullable());

/** The folder dialog's posted fields (create and update); the dialog validates with it too. */
export const folderFormSchema = z.object({
  name: nameField,
  color: folderCreateSchema.shape.color,
  parentId: optionalId,
});

/** The rename dialog's posted field. */
export const fileRenameFormSchema = z.object({ name: nameField });

async function handleDocumentsForm(formData: FormData): Promise<DocumentActionResult> {
  const intent = readIntent<DocumentIntent>(formData);
  const id = formString(formData, "id");
  const kind = kindSchema.safeParse(formData.get("kind")).data;

  try {
    switch (intent) {
      case "create-folder":
      case "update-folder": {
        const { data: input, errors } = parseForm(folderFormSchema, formData);
        if (errors) return { errors, intent };
        const folder =
          intent === "create-folder"
            ? await createFolder(input)
            : await updateFolder(id, { name: input.name, color: input.color ?? null });
        return { ok: true, intent, id: folder.id };
      }
      case "rename-file": {
        const { data: input, errors } = parseForm(fileRenameFormSchema, formData);
        if (errors) return { errors, intent };
        await updateFile(id, { name: input.name });
        return { ok: true, intent, id };
      }
      case "move": {
        const { data: input } = parseForm(z.object({ targetId: optionalId }), formData);
        const targetId = input?.targetId ?? null;
        await (kind === "folder" ? updateFolder(id, { parentId: targetId }) : updateFile(id, { folderId: targetId }));
        return { ok: true, intent, id };
      }
      case "trash":
        await (kind === "folder" ? trashFolder(id) : trashFile(id));
        return { ok: true, intent, id };
      case "restore":
        await (kind === "folder" ? restoreFolder(id) : restoreFile(id));
        return { ok: true, intent, id };
      case "delete":
        await (kind === "folder" ? deleteFolderPermanently(id) : deleteFilePermanently(id));
        return { ok: true, intent, id };
      case "empty-trash":
        await emptyTrash();
        return { ok: true, intent };
      default:
        return { formError: i18n.t("common:errors.generic") };
    }
  } catch (error) {
    return failedAction(error, intent ?? undefined, {
        conflict: i18n.t("documents:errors.conflict"),
        forbidden: i18n.t("documents:errors.forbidden"),
        not_found: i18n.t("documents:errors.notFound"),
        bad_request: i18n.t("documents:errors.badRequest"),
      });
  }
}

/** Drive and trash pages share one action: the form's `intent` says what to do. */
export async function documentsAction({ request }: ActionFunctionArgs): Promise<DocumentActionResult> {
  return handleDocumentsForm(await request.formData());
}

export const documentsTrashAction = documentsAction;
