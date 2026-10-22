import * as React from "react";
import type { AssistantClient } from "../data/assistant-client";
import { prepareImage } from "../data/image-prepare";
import { ASSISTANT_IMAGES_MAX } from "../types/assistant";

/** An image picked for the next question: shown at once (`url`), uploaded in the background. */
export type ImageAttachment = {
  key: string;
  /** An object URL of the resized image, for the thumbnail (and the question bubble after sending). */
  url: string;
  status: "uploading" | "ready" | "failed";
  /** The server's id once uploaded. */
  id: string | null;
};

let sequence = 0;

/**
 * The images attached to the question being written: resized and uploaded as soon as they are picked or
 * pasted, so Send only sends their ids. `take()` hands them over and empties the list (the object URLs then
 * belong to the chat, which shows them in the question bubble).
 */
export function useImageAttachments(client: AssistantClient) {
  const [attachments, setAttachments] = React.useState<ImageAttachment[]>([]);
  const latest = React.useRef(attachments);
  React.useLayoutEffect(() => {
    latest.current = attachments;
  });
  const controllers = React.useRef(new Map<string, AbortController>());

  // Leaving the chat: stop uploads and free the thumbnails that were never sent.
  React.useEffect(() => {
    const running = controllers.current;
    return () => {
      for (const controller of running.values()) controller.abort();
      for (const attachment of latest.current) URL.revokeObjectURL(attachment.url);
    };
  }, []);

  const patch = (key: string, change: Partial<ImageAttachment>) =>
    setAttachments((previous) => previous.map((attachment) => (attachment.key === key ? { ...attachment, ...change } : attachment)));

  const add = React.useCallback(
    async (files: Iterable<File>) => {
      const room = ASSISTANT_IMAGES_MAX - latest.current.length;
      const picked = [...files].filter((file) => file.type.startsWith("image/")).slice(0, Math.max(0, room));
      await Promise.all(
        picked.map(async (file) => {
          let image: Blob;
          try {
            image = await prepareImage(file);
          } catch {
            return;
          }
          const key = `image-${Date.now().toString(36)}-${(sequence += 1)}`;
          const controller = new AbortController();
          controllers.current.set(key, controller);
          setAttachments((previous) => (previous.length >= ASSISTANT_IMAGES_MAX ? previous : [...previous, { key, url: URL.createObjectURL(image), status: "uploading", id: null }]));
          try {
            const { id } = await client.uploadImage(image, controller.signal);
            patch(key, { status: "ready", id });
          } catch {
            if (!controller.signal.aborted) patch(key, { status: "failed" });
          } finally {
            controllers.current.delete(key);
          }
        }),
      );
    },
    [client],
  );

  const remove = React.useCallback((key: string) => {
    controllers.current.get(key)?.abort();
    setAttachments((previous) => {
      const gone = previous.find((attachment) => attachment.key === key);
      if (gone) URL.revokeObjectURL(gone.url);
      return previous.filter((attachment) => attachment.key !== key);
    });
  }, []);

  /** The uploaded images for Send (failed ones are dropped and freed); the list is empty afterwards. */
  const take = React.useCallback((): { id: string; url: string }[] => {
    const ready = latest.current.flatMap((attachment) => (attachment.status === "ready" && attachment.id ? [{ id: attachment.id, url: attachment.url }] : []));
    for (const attachment of latest.current) if (attachment.status !== "ready") URL.revokeObjectURL(attachment.url);
    setAttachments([]);
    return ready;
  }, []);

  const uploading = attachments.some((attachment) => attachment.status === "uploading");
  const ready = attachments.some((attachment) => attachment.status === "ready");
  return { attachments, add, remove, take, uploading, ready, full: attachments.length >= ASSISTANT_IMAGES_MAX };
}
