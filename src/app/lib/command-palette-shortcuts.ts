import * as React from "react";

/** `all`: quick actions, then every page (Ctrl/Cmd + K, "/"). `new`: only the quick actions, a letter runs one ("N"). */
export type CommandPaletteMode = "all" | "new";

/** The keys that open the command palette on this device: ⌘ K on Apple devices, Ctrl K elsewhere. */
export function paletteShortcutKeys(): string[] {
  const platform = typeof navigator === "undefined" ? "" : navigator.platform || navigator.userAgent;
  return /Mac|iPhone|iPad|iPod/i.test(platform) ? ["⌘", "K"] : ["Ctrl", "K"];
}

/** Typing in a field, or inside a menu, list or dialog: single-key shortcuts must not fire there. */
function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  if (target.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName)) return true;
  return target.closest('[role="dialog"], [role="alertdialog"], [role="menu"], [role="listbox"], [role="combobox"]') !== null;
}

/** Another dialog or menu is open (a form, a sheet, the palette itself): leave the keyboard to it. */
function overlayOpen(): boolean {
  return document.querySelector('[role="dialog"][data-state="open"], [role="alertdialog"][data-state="open"], [role="menu"][data-state="open"]') !== null;
}

/**
 * Global shortcuts for the command palette: Ctrl/Cmd + K and "/" open it with everything, "N" with only
 * the quick actions. The single keys are ignored while typing or while another dialog or menu is open.
 */
export function useCommandPaletteShortcuts(onOpen: (mode: CommandPaletteMode) => void, enabled = true) {
  const onOpenRef = React.useRef(onOpen);
  React.useEffect(() => {
    onOpenRef.current = onOpen;
  });

  React.useEffect(() => {
    if (!enabled) return;
    function handleKeyDown(event: KeyboardEvent) {
      if (event.defaultPrevented || event.isComposing || event.repeat) return;
      const key = event.key.toLowerCase();
      if (key === "k" && (event.metaKey || event.ctrlKey) && !event.altKey && !event.shiftKey) {
        if (overlayOpen()) return;
        event.preventDefault();
        onOpenRef.current("all");
        return;
      }
      if (event.metaKey || event.ctrlKey || event.altKey || (key !== "/" && key !== "n")) return;
      if (isTypingTarget(event.target) || overlayOpen()) return;
      event.preventDefault();
      onOpenRef.current(key === "n" ? "new" : "all");
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [enabled]);
}
