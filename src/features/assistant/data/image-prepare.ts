import { ASSISTANT_IMAGE_MAX_SIDE } from "../types/assistant";

/** The size to scale to so the longest side is at most `maxSide` (never enlarged). Pure, unit tested. */
export function fitWithin(width: number, height: number, maxSide = ASSISTANT_IMAGE_MAX_SIDE): { width: number; height: number } {
  const scale = Math.min(1, maxSide / Math.max(width, height, 1));
  return { width: Math.max(1, Math.round(width * scale)), height: Math.max(1, Math.round(height * scale)) };
}

/**
 * An image as the assistant gets it: at most `ASSISTANT_IMAGE_MAX_SIDE` pixels on the longest side, on a
 * white background (vision models see transparent pixels as black, so a cropped plan with a transparent
 * background is unreadable), as JPEG. Throws when the browser can't read the file as an image.
 */
export async function prepareImage(file: Blob): Promise<Blob> {
  const bitmap = await createImageBitmap(file);
  try {
    const size = fitWithin(bitmap.width, bitmap.height);
    const canvas = document.createElement("canvas");
    canvas.width = size.width;
    canvas.height = size.height;
    const context = canvas.getContext("2d");
    if (!context) throw new Error("No canvas");
    context.fillStyle = "#ffffff";
    context.fillRect(0, 0, size.width, size.height);
    context.imageSmoothingQuality = "high";
    context.drawImage(bitmap, 0, 0, size.width, size.height);
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.9));
    if (!blob) throw new Error("Could not encode the image");
    return blob;
  } finally {
    bitmap.close();
  }
}
