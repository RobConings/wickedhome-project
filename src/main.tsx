import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { RouterProvider } from "react-router/dom";
import { router } from "@/app/router";
import { initI18n } from "@/lib/i18n";
import { registerServiceWorker } from "@/lib/pwa";
import { initTheme } from "@/lib/theme";
import "@/styles/index.css";

initTheme();
registerServiceWorker();

void initI18n().then(() => {
  createRoot(document.getElementById("root")!).render(
    <StrictMode>
      <RouterProvider router={router} />
    </StrictMode>,
  );
});
