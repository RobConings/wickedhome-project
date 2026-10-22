import * as React from "react";
import { useTranslation } from "react-i18next";
import { voiceLabelParts } from "../data/voice-preferences";

/** "Nathalie (Vlaams)", "Rdh (Vlaams, man)", "Northern English (man)", from the voice id, in the UI's language. */
export function useVoiceLabel() {
  const { t } = useTranslation("assistant");
  return React.useCallback(
    (id: string) => {
      const { name, region, male } = voiceLabelParts(id);
      const details = [region ? t(`voices.region.${region}`, { defaultValue: region }) : null, male ? t("voices.male") : null].filter(Boolean);
      return details.length ? `${name} (${details.join(", ")})` : name;
    },
    [t],
  );
}
