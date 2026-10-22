import { Router } from "express";
import { pipeline } from "node:stream/promises";
import {
  contentsQuerySchema,
  documentLinkInputSchema,
  documentLinkSchema,
  fileCreateSchema,
  fileUpdateSchema,
  folderCreateSchema,
  folderUpdateSchema,
  searchQuerySchema,
} from "@/features/documents/types/documents";
import { idSchema } from "@/types/common";
import { HttpError, parse, requireAppHeader } from "../lib/http";
import { currentUser, loadSession, requireRole, requireUser } from "../lib/session";
import { contentDisposition, parseRange } from "./documents-http";
import "./documents.jobs";
import {
  attachFile,
  createFile,
  createFolder,
  deleteFilePermanently,
  deleteFolderPermanently,
  detachFile,
  emptyTrash,
  getContents,
  getFile,
  getUsage,
  listFolders,
  listLinkedFiles,
  listTrash,
  openFileContent,
  restoreFile,
  restoreFolder,
  search,
  storeFileContent,
  trashFile,
  trashFolder,
  updateFile,
  updateFolder,
} from "./documents.service";

const canManage = requireRole("owner", "adult");

// ── Upload: raw request body, mounted before express.json() ─────────────────────────────────────────

/**
 * `PUT /api/documents/files/:id/content` streams the raw request body straight to storage, no multipart.
 * `src/api/app.ts` mounts this router *before* `express.json()`, which would otherwise consume (and
 * 1 MB-limit) the body of a `.json` file upload. Because it runs before the API-wide middleware, it applies
 * the CSRF header check and the session itself.
 */
export const documentsUploadRouter = Router();

documentsUploadRouter.put(
  "/files/:id/content",
  requireAppHeader,
  loadSession,
  requireUser,
  canManage,
  async (req, res) => {
    const id = parse(idSchema, req.params.id);
    try {
      const file = await storeFileContent(currentUser(req).householdId, id, req, {
        contentType: req.get("content-type"),
        contentLength: req.get("content-length"),
      });
      res.json(file);
    } catch (error) {
      // The client may still be sending; don't keep reading a body we refused.
      if (!req.readableEnded) res.set("Connection", "close");
      throw error;
    }
  },
);

// ── Everything else: JSON ───────────────────────────────────────────────────────────────────────────

export const documentsRouter = Router();

documentsRouter.use(requireUser);

documentsRouter.get("/contents", async (req, res) => {
  const { folderId } = parse(contentsQuerySchema, req.query);
  res.json(await getContents(currentUser(req).householdId, folderId));
});

documentsRouter.get("/search", async (req, res) => {
  const { q } = parse(searchQuerySchema, req.query);
  res.json(await search(currentUser(req).householdId, q));
});

documentsRouter.get("/usage", async (req, res) => {
  res.json(await getUsage(currentUser(req).householdId));
});

// Folders

documentsRouter.get("/folders", async (req, res) => {
  res.json(await listFolders(currentUser(req).householdId));
});

documentsRouter.post("/folders", canManage, async (req, res) => {
  const input = parse(folderCreateSchema, req.body);
  res.status(201).json(await createFolder(currentUser(req).householdId, input));
});

documentsRouter.patch("/folders/:id", canManage, async (req, res) => {
  const id = parse(idSchema, req.params.id);
  const input = parse(folderUpdateSchema, req.body);
  res.json(await updateFolder(currentUser(req).householdId, id, input));
});

/** Moves the folder, and everything in it, to the trash. */
documentsRouter.delete("/folders/:id", canManage, async (req, res) => {
  await trashFolder(currentUser(req).householdId, parse(idSchema, req.params.id));
  res.status(204).end();
});

documentsRouter.post("/folders/:id/restore", canManage, async (req, res) => {
  res.json(await restoreFolder(currentUser(req).householdId, parse(idSchema, req.params.id)));
});

// Files

documentsRouter.post("/files", canManage, async (req, res) => {
  const input = parse(fileCreateSchema, req.body);
  res.status(201).json(await createFile(currentUser(req), input));
});

documentsRouter.get("/files/:id", async (req, res) => {
  res.json(await getFile(currentUser(req).householdId, parse(idSchema, req.params.id)));
});

/**
 * Download or preview. Household-scoped like everything else. Only allowlisted types (images, PDF,
 * audio/video) are shown inline; `?download=1` forces a download. Supports single `Range` requests (PDF
 * viewers, video seeking) and `If-None-Match` on the content hash.
 */
documentsRouter.get("/files/:id/content", async (req, res) => {
  const id = parse(idSchema, req.params.id);
  const { file, open } = await openFileContent(currentUser(req).householdId, id);
  const forceDownload = req.query.download === "1";
  const etag = file.sha256 ? `"${file.sha256}"` : undefined;

  res.set({
    "Content-Type": file.mimeType,
    "Content-Disposition": contentDisposition(file.name, file.mimeType, forceDownload),
    "X-Content-Type-Options": "nosniff",
    "Cross-Origin-Resource-Policy": "same-origin",
    "Cache-Control": "private, no-cache",
    "Accept-Ranges": "bytes",
    ...(etag && { ETag: etag }),
  });
  // Belt and braces: even if a browser rendered something, it can't run script or load anything. Chrome's
  // PDF viewer refuses to run in a sandbox, so PDFs (inline-safe by themselves) are exempt.
  const inlinePdf = file.mimeType === "application/pdf" && !forceDownload;
  if (!inlinePdf) {
    res.set(
      "Content-Security-Policy",
      "default-src 'none'; img-src 'self'; media-src 'self'; style-src 'unsafe-inline'; sandbox",
    );
  }

  if (etag && req.get("if-none-match") === etag) {
    res.status(304).end();
    return;
  }

  const range = parseRange(req.get("range"), file.sizeBytes);
  if (range === "unsatisfiable") {
    res.set("Content-Range", `bytes */${file.sizeBytes}`);
    throw new HttpError(416, "range_not_satisfiable", "Requested range not satisfiable");
  }
  if (range) {
    res.status(206).set({
      "Content-Range": `bytes ${range.start}-${range.end}/${file.sizeBytes}`,
      "Content-Length": String(range.end - range.start + 1),
    });
  } else {
    res.set("Content-Length", String(file.sizeBytes));
  }
  if (req.method === "HEAD") {
    res.end();
    return;
  }
  const stream = await open(range);
  // A client that goes away mid-download is not an error worth logging.
  await pipeline(stream, res).catch((error: NodeJS.ErrnoException) => {
    if (error.code !== "ERR_STREAM_PREMATURE_CLOSE") throw error;
  });
});

documentsRouter.patch("/files/:id", canManage, async (req, res) => {
  const id = parse(idSchema, req.params.id);
  const input = parse(fileUpdateSchema, req.body);
  res.json(await updateFile(currentUser(req).householdId, id, input));
});

/** Moves the file to the trash. */
documentsRouter.delete("/files/:id", canManage, async (req, res) => {
  await trashFile(currentUser(req).householdId, parse(idSchema, req.params.id));
  res.status(204).end();
});

documentsRouter.post("/files/:id/restore", canManage, async (req, res) => {
  res.json(await restoreFile(currentUser(req).householdId, parse(idSchema, req.params.id)));
});

// Trash

documentsRouter.get("/trash", async (req, res) => {
  res.json(await listTrash(currentUser(req).householdId));
});

documentsRouter.delete("/trash", canManage, async (req, res) => {
  await emptyTrash(currentUser(req).householdId);
  res.status(204).end();
});

documentsRouter.delete("/trash/folders/:id", canManage, async (req, res) => {
  await deleteFolderPermanently(currentUser(req).householdId, parse(idSchema, req.params.id));
  res.status(204).end();
});

documentsRouter.delete("/trash/files/:id", canManage, async (req, res) => {
  await deleteFilePermanently(currentUser(req).householdId, parse(idSchema, req.params.id));
  res.status(204).end();
});

// Links: attach documents to any item

documentsRouter.get("/links", async (req, res) => {
  const ref = parse(documentLinkSchema, req.query);
  res.json(await listLinkedFiles(currentUser(req).householdId, ref));
});

documentsRouter.post("/links", canManage, async (req, res) => {
  await attachFile(currentUser(req).householdId, parse(documentLinkInputSchema, req.body));
  res.status(204).end();
});

documentsRouter.delete("/links/:fileId/:entityType/:entityId", canManage, async (req, res) => {
  await detachFile(currentUser(req).householdId, parse(documentLinkInputSchema, req.params));
  res.status(204).end();
});
