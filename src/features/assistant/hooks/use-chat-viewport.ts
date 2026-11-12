import * as React from "react";
/** The visual viewport shrinks with the mobile keyboard; dvh alone does not on every browser. */
export function useChatViewport(active: boolean) {
  const ref = React.useRef<HTMLDivElement>(null);
  React.useEffect(() => {
    if (!active) return;
    const viewport = window.visualViewport;
    if (!viewport) return;
    const update = () => { ref.current?.style.setProperty("--chat-viewport-height", `${viewport.height}px`); ref.current?.style.setProperty("--chat-viewport-top", `${viewport.offsetTop}px`); };
    update(); viewport.addEventListener("resize", update); viewport.addEventListener("scroll", update);
    return () => { viewport.removeEventListener("resize", update); viewport.removeEventListener("scroll", update); };
  }, [active]);
  return ref;
}
