import { z } from "zod";
import type { DocumentEntityType, DocumentFile } from "@/features/documents/types/documents";
import { formatDate } from "@/types/date-format";
import {
  attachFile,
  createFolder,
  detachFile,
  getContents,
  getFile,
  getUsage,
  listFolders,
  listLinkedFiles,
  listTrash,
  restoreFile,
  restoreFolder,
  search,
  trashFile,
  trashFolder,
  updateFile,
  updateFolder,
} from "@/api/documents/documents.service";
import { HttpError } from "@/api/lib/http";
import { resolveEntity } from "@ai/core/resolve";
import { capList, done, entityRef, registerAssistantSkill, registerAssistantTool, registerEntityResolver, registerScreenContext, say, type AssistantToolContext, type EntityType } from "@ai/core/kit";

/**
 * Skill "documents": the household's drive (folders and files) and what documents are attached to (a room,
 * an appliance, a task, a project, an expense). Files can't be uploaded through the assistant (the content
 * never passes through the model): uploading is done in the app. Registers the `document` and `folder`
 * resolvers (and so search_everything finds documents by name).
 */

registerAssistantSkill({
  id: "documents",
  title: { en: "Documents", nl: "Documenten" },
  summary: "The household's documents and folders: find, look up what is attached to a room, appliance, task or expense, organise, attach.",
  keywords: {
    nl: ["document", "documenten", "map", "mappen", "bestand", "bestanden", "pdf", "handleiding", "garantie", "factuur", "contract", "attest", "bijlage", "prullenbak"],
    en: ["document", "folder", "file", "pdf", "manual", "warranty", "invoice", "contract", "certificate", "attachment", "trash"],
  },
});

/** Files whose name contains the query, or else one of its words (≥ 3 letters). */
async function findFiles(householdId: string, query: string): Promise<(DocumentFile & { path: { name: string }[] })[]> {
  const whole = await search(householdId, query);
  if (whole.files.length) return whole.files;
  const words = [...new Set(query.split(/\s+/).filter((word) => word.length >= 3))].slice(0, 4);
  const hits = await Promise.all(words.map((word) => search(householdId, word)));
  const seen = new Set<string>();
  return hits.flatMap((hit) => hit.files).filter((file) => !seen.has(file.id) && Boolean(seen.add(file.id)));
}

const pathOf = (path: { name: string }[]) => (path.length ? path.map((crumb) => crumb.name).join(" / ") : "Documents");

registerEntityResolver({
  type: "document",
  label: "document",
  skill: "documents",
  search: async (ctx, query) => (await findFiles(ctx.householdId, query)).map((file) => ({ id: file.id, name: file.name, hint: pathOf(file.path) })),
});

registerEntityResolver({
  type: "folder",
  label: "folder",
  skill: "documents",
  list: async (ctx) => (await listFolders(ctx.householdId)).map((folder) => ({ id: folder.id, name: folder.name })),
});

const size = (bytes: number) => (bytes >= 1_048_576 ? `${(bytes / 1_048_576).toFixed(1).replace(".", ",")} MB` : `${Math.max(1, Math.round(bytes / 1024))} kB`);
const fileLine = (file: DocumentFile, locale: "en" | "nl") => `${file.name} (${size(file.sizeBytes)}, ${formatDate(file.uploadedAt ?? file.createdAt, locale)})`;

// ── Reading ─────────────────────────────────────────────────────────────────────────────────────────

registerAssistantTool({
  name: "documents.search",
  description: "Find documents and folders by name (words in the file name), with the folder they are in.",
  input: z.object({ query: z.string().trim().min(1).max(100) }),
  permission: "read",
  confirm: "never",
  activity: { en: "Searched the documents", nl: "Documenten gezocht" },
  run: async (ctx, input) => {
    const [files, folders] = await Promise.all([findFiles(ctx.householdId, input.query), search(ctx.householdId, input.query).then((result) => result.folders)]);
    return {
      files: capList(files, 15, (file) => `${fileLine(file, ctx.locale)} in ${pathOf(file.path)}`),
      folders: capList(folders, 10, (folder) => `${folder.name} in ${pathOf(folder.path)}`),
    };
  },
});

registerAssistantTool({
  name: "documents.folder",
  description: "What is in a folder (without folder: the top of the drive, with the storage used). trash: what is in the trash.",
  input: z.object({ folder: entityRef("folder").optional(), trash: z.boolean().default(false) }),
  permission: "read",
  confirm: "never",
  activity: { en: "Opened the documents", nl: "Documenten bekeken" },
  run: async (ctx, input) => {
    if (input.trash) {
      const trash = await listTrash(ctx.householdId);
      return { trash: capList([...trash.folders.map((folder) => `${folder.name}/`), ...trash.files.map((file) => fileLine(file, ctx.locale))], 30), size: size(trash.totalBytes) };
    }
    const [contents, usage] = await Promise.all([getContents(ctx.householdId, input.folder?.id), input.folder ? null : getUsage(ctx.householdId)]);
    return {
      folder: contents.folder ? [...contents.breadcrumbs.map((crumb) => crumb.name), contents.folder.name].join(" / ") : "Documents",
      folders: capList(contents.folders, 30, (folder) => `${folder.name} (${folder.fileCount} files)`),
      files: capList(contents.files, 30, (file) => fileLine(file, ctx.locale)),
      used: usage ? `${size(usage.usedBytes)} in ${usage.fileCount} files` : null,
    };
  },
});

registerAssistantTool({
  name: "documents.info",
  description: "Details of one document: folder, type, size, who uploaded it and when, where it is stored.",
  input: z.object({ document: entityRef("document") }),
  permission: "read",
  confirm: "never",
  activity: { en: "Looked at a document", nl: "Document bekeken" },
  run: async (ctx, input) => {
    const file = await getFile(ctx.householdId, input.document.id);
    return {
      name: file.name,
      folder: input.document.hint,
      type: file.mimeType,
      size: size(file.sizeBytes),
      uploaded: file.uploadedAt ? `${formatDate(file.uploadedAt, ctx.locale)}${file.uploadedBy ? ` by ${file.uploadedBy.name}` : ""}` : "still uploading",
      storedOn: file.storageProvider === "local" ? "the home server" : "Google Drive",
    };
  },
});

// ── Attachments ─────────────────────────────────────────────────────────────────────────────────────

/** What a document can be attached to, as the person says it → the documents' entity type and the resolver. */
const TARGETS = {
  room: { linkType: "place", entity: "place" },
  appliance: { linkType: "appliance", entity: "appliance" },
  task: { linkType: "task", entity: "task" },
  project: { linkType: "project", entity: "project" },
  expense: { linkType: "bill", entity: "expense" },
} as const satisfies Record<string, { linkType: DocumentEntityType; entity: EntityType }>;
type Target = keyof typeof TARGETS;
const targetSchema = z.enum(Object.keys(TARGETS) as [Target, ...Target[]]);

async function resolveTarget(ctx: AssistantToolContext, on: Target, name: string) {
  const outcome = await resolveEntity(ctx, TARGETS[on].entity, name);
  if (!outcome.ok) throw new HttpError(400, "bad_request", outcome.error);
  return { linkType: TARGETS[on].linkType, entity: outcome.entity };
}

registerAssistantTool({
  name: "documents.linked",
  description: "Documents attached to a room, appliance, task, project or expense (e.g. the manual of the dishwasher, the invoices of an expense).",
  input: z.object({ on: targetSchema, name: z.string().trim().min(1).max(160).describe("Name of the room, appliance, task, project or expense") }),
  permission: "read",
  confirm: "never",
  activity: { en: "Looked up attached documents", nl: "Bijlagen bekeken" },
  run: async (ctx, input) => {
    const { linkType, entity } = await resolveTarget(ctx, input.on, input.name);
    const files = await listLinkedFiles(ctx.householdId, { entityType: linkType, entityId: entity.id });
    return { on: entity.name, documents: capList(files, 20, (file) => fileLine(file, ctx.locale)) };
  },
});

registerAssistantTool({
  name: "documents.attach",
  description: "Attach a document to a room, appliance, task, project or expense, or detach it (detach true).",
  input: z.object({ document: entityRef("document"), on: targetSchema, name: z.string().trim().min(1).max(160), detach: z.boolean().default(false) }),
  permission: "write",
  confirm: "always",
  activity: { en: "Changed an attachment", nl: "Bijlage aangepast" },
  describe: (ctx, input) =>
    input.detach
      ? say(ctx.locale, `Detach “${input.document.name}” from ${input.name}`, `“${input.document.name}” loskoppelen van ${input.name}`)
      : say(ctx.locale, `Attach “${input.document.name}” to ${input.name}`, `“${input.document.name}” koppelen aan ${input.name}`),
  preview: async (ctx, input) => {
    // Checks the target exists before the person is asked.
    await resolveTarget(ctx, input.on, input.name);
    return null;
  },
  run: async (ctx, input) => {
    const { linkType, entity } = await resolveTarget(ctx, input.on, input.name);
    const link = { fileId: input.document.id, entityType: linkType, entityId: entity.id };
    if (input.detach) await detachFile(ctx.householdId, link);
    else await attachFile(ctx.householdId, link);
    return done(input.detach ? `Detached ${input.document.name} from ${entity.name}.` : `Attached ${input.document.name} to ${entity.name}.`);
  },
});

// ── Organising ──────────────────────────────────────────────────────────────────────────────────────

registerAssistantTool({
  name: "documents.create_folder",
  description: "Create a folder (optionally inside another folder).",
  input: z.object({ name: z.string().trim().min(1).max(120), parent: entityRef("folder").optional() }),
  permission: "write",
  confirm: "first-time",
  activity: { en: "Created a folder", nl: "Map gemaakt" },
  describe: (ctx, input) => say(ctx.locale, `Create the folder “${input.name}”${input.parent ? ` in ${input.parent.name}` : ""}`, `De map “${input.name}” maken${input.parent ? ` in ${input.parent.name}` : ""}`),
  run: async (ctx, input) => {
    const folder = await createFolder(ctx.householdId, { name: input.name, parentId: input.parent?.id ?? null });
    return done(`Created the folder ${folder.name}.`, { id: folder.id });
  },
});

registerAssistantTool({
  name: "documents.organise",
  description: "Rename a document or folder, or move it to another folder (toTop: to the top of the drive).",
  input: z.object({
    document: entityRef("document").optional(),
    folder: entityRef("folder").optional().describe("The folder to rename or move (not the destination)"),
    name: z.string().trim().min(1).max(120).optional(),
    moveTo: entityRef("folder").optional(),
    toTop: z.boolean().default(false),
  }),
  permission: "write",
  confirm: "always",
  activity: { en: "Organised the documents", nl: "Documenten geordend" },
  describe: (ctx, input) => {
    const what = input.document?.name ?? input.folder?.name ?? "?";
    const where = input.moveTo ? input.moveTo.name : input.toTop ? "Documents" : null;
    return say(
      ctx.locale,
      [input.name && `Rename “${what}” to “${input.name}”`, where && `move “${what}” to ${where}`].filter(Boolean).join(", "),
      [input.name && `“${what}” hernoemen naar “${input.name}”`, where && `“${what}” verplaatsen naar ${where}`].filter(Boolean).join(", "),
    );
  },
  run: async (ctx, input) => {
    if (!input.document === !input.folder) return { ok: false, error: "Give either a document or a folder." };
    const destination = input.moveTo ? { folderId: input.moveTo.id } : input.toTop ? { folderId: null } : {};
    if (!input.name && !("folderId" in destination)) return { ok: false, error: "Give a new name, moveTo or toTop." };
    if (input.document) {
      const file = await updateFile(ctx.householdId, input.document.id, { ...(input.name && { name: input.name }), ...destination });
      return done(`Saved ${file.name}.`);
    }
    const folder = await updateFolder(ctx.householdId, input.folder!.id, { ...(input.name && { name: input.name }), ...("folderId" in destination && { parentId: destination.folderId }) });
    return done(`Saved the folder ${folder.name}.`);
  },
});

registerAssistantTool({
  name: "documents.trash",
  description: "Move a document or folder (with everything in it) to the trash, or restore it from the trash (restore true).",
  input: z.object({ document: z.string().trim().min(1).max(160).optional().describe("Document name"), folder: z.string().trim().min(1).max(160).optional().describe("Folder name"), restore: z.boolean().default(false) }),
  permission: "sensitive",
  confirm: "always",
  activity: { en: "Changed the trash", nl: "Prullenbak aangepast" },
  describe: (ctx, input) => {
    const what = input.document ?? input.folder ?? "?";
    return input.restore ? say(ctx.locale, `Restore “${what}” from the trash`, `“${what}” terugzetten uit de prullenbak`) : say(ctx.locale, `Move “${what}” to the trash`, `“${what}” naar de prullenbak verplaatsen`);
  },
  preview: async (ctx, input) => {
    await trashTarget(ctx, input);
    return null;
  },
  run: async (ctx, input) => {
    const target = await trashTarget(ctx, input);
    if (input.restore) {
      if (target.kind === "file") await restoreFile(ctx.householdId, target.id);
      else await restoreFolder(ctx.householdId, target.id);
      return done(`Restored ${target.name}.`);
    }
    if (target.kind === "file") await trashFile(ctx.householdId, target.id);
    else await trashFolder(ctx.householdId, target.id);
    return done(`Moved ${target.name} to the trash (it can be restored).`);
  },
});

/** The document or folder to trash (resolved normally) or to restore (looked up in the trash). */
async function trashTarget(ctx: AssistantToolContext, input: { document?: string; folder?: string; restore: boolean }) {
  const name = input.document ?? input.folder;
  if (!name || (input.document && input.folder)) throw new HttpError(400, "bad_request", "Give either a document or a folder.");
  const kind = input.document ? ("file" as const) : ("folder" as const);
  if (!input.restore) {
    const outcome = await resolveEntity(ctx, kind === "file" ? "document" : "folder", name);
    if (!outcome.ok) throw new HttpError(400, "bad_request", outcome.error);
    return { kind, id: outcome.entity.id, name: outcome.entity.name };
  }
  const trash = await listTrash(ctx.householdId);
  const items = kind === "file" ? trash.files : trash.folders;
  const lower = name.toLowerCase();
  const hits = items.filter((item) => item.name.toLowerCase().includes(lower));
  if (hits.length !== 1) throw new HttpError(400, "bad_request", hits.length ? `Which one: ${hits.slice(0, 4).map((item) => item.name).join(", ")}?` : `Nothing called “${name}” in the trash.`);
  return { kind, id: hits[0]!.id, name: hits[0]!.name };
}

// ── Screen context (ai/docs/ASSISTANT.md): the documents ──

registerScreenContext({
  kind: "documents",
  skills: ["documents"],
  describe: (ctx) => ({ label: say(ctx.locale, "Documents", "Documenten"), summary: "the documents (folders and files)" }),
});
