import { z } from "zod";

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
  PORT: z.coerce.number().int().positive().default(3101),
  HOST: z.string().default("127.0.0.1"),
  DATABASE_URL: z.url(),
  COOKIE_SECURE: z.stringbool().default(false),
  /**
   * The app's public address (no trailing slash): the OAuth issuer and the MCP resource URL are built from it
   * (ai/docs/MCP-OAUTH.md), so it must be what ChatGPT/Claude use to reach the app.
   */
  PUBLIC_URL: z
    .url()
    .default("https://home.example.be")
    .transform((url) => url.replace(/\/+$/, "")),
  SESSION_DAYS: z.coerce.number().int().positive().default(30),
  /** Documents: root folder for stored files (outside the repo; relative paths resolve from the cwd). */
  STORAGE_DIR: z.string().min(1).default("data/files"),
  /** Documents: largest accepted upload, in MB. */
  MAX_UPLOAD_MB: z.coerce.number().int().positive().max(4096).default(100),
  /** Weather: Google Maps Platform key with the Weather API enabled (billing required). Optional; server-side only. */
  GOOGLE_MAPS_API_KEY: z.string().trim().min(1).optional(),
  /**
   * Integrations: AES-256-GCM key (32 bytes, base64) that encrypts per-user tokens at rest (src/api/lib/secrets.ts).
   * Generate with `openssl rand -base64 32`. Without it, integrations that store tokens show "not configured".
   */
  INTEGRATIONS_KEY: z.string().trim().min(1).optional(),
  /** Google (Calendar, Gmail, Drive per user): OAuth client of a "Web application" in Google Cloud. Optional. */
  GOOGLE_CLIENT_ID: z.string().trim().min(1).optional(),
  GOOGLE_CLIENT_SECRET: z.string().trim().min(1).optional(),
  /** Must match an "Authorised redirect URI" of that OAuth client exactly. Default: PUBLIC_URL + /api/integrations/google/callback. */
  GOOGLE_REDIRECT_URI: z.url().optional(),
  /**
   * Assistant (ai/docs/ASSISTANT.md): an OpenAI-compatible server on the LAN, e.g. LM Studio
   * `http://192.168.1.20:1234/v1`, and the model to use. Without both the assistant shows "not configured".
   * Kept as plain strings: a typo shows up as an error on the assistant's card instead of stopping the app.
   */
  ASSISTANT_BASE_URL: z.string().trim().optional(),
  ASSISTANT_MODEL: z.string().trim().optional(),
  /**
   * Bearer token, only when the server asks for one (LM Studio: Developer → "Require API token").
   * `ASSISTANT_TOKEN` is accepted as the same thing.
   */
  ASSISTANT_API_KEY: z.string().trim().optional(),
  ASSISTANT_TOKEN: z.string().trim().optional(),
  /** Speech to text: an OpenAI-compatible `/audio/transcriptions` server (e.g. a local Whisper), base URL. */
  ASSISTANT_STT_URL: z.string().trim().optional(),
  ASSISTANT_STT_MODEL: z.string().trim().optional(),
  /** `on` lets the model reason before answering (slower). Default off (ai/docs/ASSISTANT.md). */
  ASSISTANT_THINKING: z.string().trim().optional(),
  /** `off` for a model without image support: questions can't carry images then. Default on. */
  ASSISTANT_VISION: z.string().trim().optional(),
  /** Model call limits in seconds (ai/core/assistant-config `readTimeouts`): until the answer starts, silence, total. */
  ASSISTANT_TIMEOUT_FIRST_BYTE: z.string().trim().optional(),
  ASSISTANT_TIMEOUT_IDLE: z.string().trim().optional(),
  ASSISTANT_TIMEOUT_TOTAL: z.string().trim().optional(),
  /** Model calls at once (default 1, = LM Studio "Max Concurrent Predictions"); the rest queue in the app. */
  ASSISTANT_PARALLEL: z.string().trim().optional(),
  /**
   * Speech output (ai/docs/ASSISTANT.md "Speech output"): a text-to-speech server reachable from this server,
   * e.g. Piper `http://127.0.0.1:5005`. `ASSISTANT_TTS_KIND` is `piper` (default, `POST /synthesize`) or
   * `openai` (`POST <url>/audio/speech`). Voices per language, an optional model (openai kind) and speed.
   * Plain strings: a typo shows up on the assistant's card; without a URL the browser's voice is used.
   */
  ASSISTANT_TTS_URL: z.string().trim().optional(),
  ASSISTANT_TTS_KIND: z.string().trim().optional(),
  ASSISTANT_TTS_MODEL: z.string().trim().optional(),
  ASSISTANT_TTS_VOICE_NL: z.string().trim().optional(),
  ASSISTANT_TTS_VOICE_EN: z.string().trim().optional(),
  ASSISTANT_TTS_SPEED: z.string().trim().optional(),
  /**
   * Web search for the assistant (ai/docs/WEB-SEARCH.md): a self-hosted SearXNG with JSON output, e.g.
   * `http://127.0.0.1:8888`, and the search language (default `nl-BE`). Without the URL the web skill isn't
   * offered. Plain strings: a typo shows up on the assistant's card instead of stopping the app.
   */
  SEARCH_URL: z.string().trim().optional(),
  SEARCH_LANGUAGE: z.string().trim().optional(),
  /**
   * Home Assistant (docs/INTEGRATIONS.md): base URL, e.g. `http://192.168.1.10:8123`, and a long-lived access
   * token (HA → your profile → Security → Long-lived access tokens). Without both, Home Assistant shows
   * "not configured". Plain strings: a typo shows up as an error on the card instead of stopping the app.
   */
  HOME_ASSISTANT_URL: z.string().trim().optional(),
  HOME_ASSISTANT_TOKEN: z.string().trim().optional(),
  /** The household Home Assistant belongs to; only needed when the database has more than one household. */
  HOME_ASSISTANT_HOUSEHOLD_ID: z.string().trim().optional(),
  /**
   * Notifications (docs/NOTIFICATIONS.md): the Web Push (VAPID) key pair, base64url as `npx web-push
   * generate-vapid-keys` prints it. Optional: without it the app generates a pair once and keeps it in the
   * database (encrypted with INTEGRATIONS_KEY when that is set). Changing keys means every phone re-enables.
   */
  VAPID_PUBLIC_KEY: z.string().trim().min(1).optional(),
  VAPID_PRIVATE_KEY: z.string().trim().min(1).optional(),
  /** Contact the push services may use: a `mailto:` address or an https URL. Default: PUBLIC_URL. */
  VAPID_SUBJECT: z.string().trim().regex(/^(mailto:|https:\/\/)/).optional(),
  /** Runtime checks only: accept push endpoints on http://127.0.0.1 (a fake push service). Never in production. */
  WEB_PUSH_ALLOW_LOCAL_ENDPOINTS: z.stringbool().default(false),
});

const parsed = envSchema.safeParse(process.env);
if (!parsed.success) {
  console.error("Invalid environment configuration:\n" + z.prettifyError(parsed.error));
  process.exit(1);
}

// Everything that names the app's own address derives from PUBLIC_URL, so the hostname lives only in .env.
export const config = {
  ...parsed.data,
  GOOGLE_REDIRECT_URI: parsed.data.GOOGLE_REDIRECT_URI ?? `${parsed.data.PUBLIC_URL}/api/integrations/google/callback`,
  VAPID_SUBJECT: parsed.data.VAPID_SUBJECT ?? parsed.data.PUBLIC_URL,
};
export const isProduction = config.NODE_ENV === "production";
