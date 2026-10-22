# WickedHome — Architecture

One React application with its API in `src/api`, Prisma and PostgreSQL. One `package.json`, one install,
one process.

## Stack

| Concern | Choice | Why |
|---|---|---|
| Language | TypeScript everywhere | One language; contracts shared between screens and API |
| UI | React 19 + Vite | SPA, built to static files |
| Routing | React Router 7 (data mode) | Route `loader`/`action` → thin route files that render a screen |
| Styling | Tailwind CSS v4 + design tokens | Brand palette in one place, dark mode |
| Primitives | shadcn/ui (Radix) in `components/ui` | We own the atoms, accessible by default |
| Forms | React Router `<Form>` / `useFetcher` + zod | No form library; the same zod schema validates in the browser and the API |
| i18n | i18next, English + Dutch | Translations live per feature |
| API | Express 5 in `src/api` | Familiar; one router per feature folder |
| Auth | Own session cookies (Postgres-backed, `scrypt` hashes) | No auth library, no external service |
| ORM / DB | Prisma 7 + PostgreSQL 14 (local) | Same as other apps on the server |
| Catalogue | Storybook 10 | Every UI, shared, layout and feature component, in EN/NL and light/dark |

Everything runs on Node 20.19 (the server's system Node, shared with other apps). Node 20 is end of life;
upgrading is a server-wide decision for later.

## Folder structure

```
WickedHome/
├─ src/
│  ├─ api/                       SERVER (Node): one folder per feature
│  │  ├─ auth/                   auth.routes.ts + auth.service.ts        → /api/auth/*
│  │  ├─ household/              household.routes.ts + .service.ts       → /api/household/*
│  │  ├─ shops/                  built-in Belgian shop catalogue (seed data)
│  │  ├─ lib/                    config, db (Prisma), sessions, http errors, rate limiting
│  │  ├─ app.ts                  mounts every feature router under /api/<feature>
│  │  └─ server.ts               one process: API + Vite (dev) or the built app (prod)
│  │
│  ├─ components/
│  │  ├─ ui/                     1. primitives / atoms        (Button, Input, Dialog…)
│  │  ├─ shared/                 2. compositions / molecules  (PageHeader, Card, FormField…)
│  │  └─ layout/                 3. structure                 (AppShell, PageContainer, PageGrid, Stack…)
│  │
│  ├─ features/<feature>/        BROWSER: everything one domain needs
│  │  ├─ components/             4. feature components        (HabitantCard…)
│  │  ├─ screens/                5. full pages                (HabitantsScreen…)
│  │  ├─ types/                  zod schemas + types: the contract, also used by src/api/<feature>
│  │  ├─ data/                   API requests, route loaders and actions
│  │  ├─ locales/                en.json, nl.json
│  │  └─ index.ts                the feature's public API
│  │
│  ├─ routes/                    route files: loader/action + render one screen
│  ├─ app/                       composition root: router, app frame (nav, quick actions), providers, status screens
│  ├─ lib/                       browser infrastructure: api client, i18n, theme, forms, formatting
│  ├─ types/                     app-wide types (Locale, ApiError…)
│  ├─ locales/                   "common" translations (ui, shared, layout, app frame)
│  └─ styles/index.css           design tokens
├─ stories/                      Storybook stories + fixtures, mirroring the layers (ui, shared, layout, features/<f>)
├─ prisma/                       schema/<feature>.prisma, migrations, seed.ts
├─ .storybook/                   Storybook config + docs/introduction.mdx
├─ public/                       favicon, app icons, manifest, brand/ logos
├─ scripts/build-server.mjs      bundles src/api into dist/server.js
└─ ecosystem.config.cjs          pm2: wickedhome (prod), wickedhome-dev, wickedhome-storybook
```

## How a page is built

```tsx
// src/routes/habitants.tsx  — the whole route file
export const loader = habitantsLoader;   // from @/features/household
export const action = habitantsAction;

export function Component() {
  const user = useCurrentUser();
  return <HabitantsScreen overview={useLoaderData<typeof habitantsLoader>()} canManage={canManageHabitants(user.role)} />;
}
```

1. The **route** connects the URL to a feature's loader, action and screen.
2. The **loader** (`features/household/data`) calls `GET /api/household`.
3. **Express** routes it to `src/api/household/household.routes.ts`, which validates input with the
   feature's zod schema (`features/household/types`) and calls `household.service.ts`.
4. The **screen** receives the data and composes layout, shared and feature components.
5. Forms post to the route **action** with `<Form>` or `useFetcher`, are validated with the same zod
   schema, and React Router reloads the data.

### The app frame and quick actions

`src/app/app-frame.tsx` fills the generic `AppShell` (layout) with what only the composition root knows:
the navigation, the account and bell, and the **quick actions**. `AppShell` has a feature-agnostic
`quickActions` slot (`topBar` for phones, `sidebar` for desktop); the frame fills it with the shared
`QuickActionSheet` ("+" → bottom sheet of tiles) and `QuickActionMenu` ("+ Quick action" → menu), and
mounts the shared `CommandPalette` (Ctrl/Cmd + K, "/", "N"; `@/lib/command-palette-shortcuts`) with the
same actions plus every nav page. The one list lives in `src/app/quick-actions.ts`, filtered by role
(`quickActionsFor`). Each action is a URL that the target screen turns into an open form
(`?new=1`, `@/lib/open-from-url`), so features don't know about the frame. "Ask the assistant" opens the
floating Ask button's chat sheet in place (the round button stays bottom-right; the "+" is in the top bar,
so they don't overlap). How a feature adds one: [ADDING-A-FEATURE.md](ADDING-A-FEATURE.md#quick-actions).

## Layer rules (enforced by ESLint)

The rules live in `eslint.config.js`, not in a wiki. A violation is a lint error that explains itself.

| Folder | May import | May not import |
|---|---|---|
| `components/ui` | other primitives, `lib` | shared, layout, features, app, routes, api |
| `components/shared` | ui, layout, other shared, `lib` | features, app, routes, api |
| `components/layout` | ui, other layout, `lib` | shared, features, app, routes, api |
| `features/<x>` | all component layers, `lib`, own files, other features **via their index** | another feature's internals, app, routes, api |
| `features/<x>/types` | `@/types`, zod | React, components, lib (it must also run in Node) |
| `routes` | features (index), `app`, `lib` | components, feature internals, api |
| `app` | everything browser-side, features via index | api |
| `api` | its own files, `@/types`, `@/features/<x>/types/*` | components, lib, app, routes, any other feature code, React |

## Runtime

```
 Browser ──► nginx (home.example.be, TLS) ──► Node :3100  (pm2: wickedhome)
                                              ├─ /api/*  → Express feature routers → Prisma → PostgreSQL (local)
                                              └─ /*      → dist/client (SPA, index.html fallback)
             LAN later:  LM Studio (other PC) · Home Assistant (this server)
```

- Development: `pm2 start ecosystem.config.cjs --only wickedhome-dev` serves the API and Vite with hot
  reload on **http://192.168.1.10:3101**. Storybook runs on **:6006**.
- Production: `npm run build` → `pm2 start ecosystem.config.cjs --only wickedhome` on `127.0.0.1:3100`.
- One origin, so no CORS. The session cookie is `HttpOnly` and `SameSite=Strict`, and every mutating
  request must carry an `X-WickedHome` header (CSRF guard).
- Postgres, LM Studio and Home Assistant are never exposed to the internet.
- Scheduled work (waste sync, cleanups…) runs in the same process: a job scheduler (`src/api/jobs`,
  started by `server.ts`) with a Postgres advisory lock per job and a run log, shown under Settings →
  Automations. No system crontab. See [AUTOMATIONS.md](AUTOMATIONS.md).

### Why `db.ts` uses a wrapped adapter

`src/api/lib/db.ts` builds Prisma on `SerialTransactionPrismaPg` (`src/api/lib/prisma-adapter.ts`), a thin
subclass of `@prisma/adapter-pg`'s `PrismaPg`. A transaction holds one `pg` connection, but Prisma's query
interpreter loads the relations of an `include` concurrently, so an include of three or more relations inside
`$transaction` (interactive or array form) handed one busy `pg` client several queries at once. `pg` queues them
but prints "Calling client.query() when the client is already executing a query is deprecated and will be
removed in pg@9.0". The wrapper queues a transaction's `queryRaw` / `executeRaw` itself (one connection runs one
query at a time anyway, so nothing is lost). Queries outside transactions use the pool and stay parallel.

- After upgrading Prisma: run `npm test` (`prisma-adapter.test.ts` runs the real adapter on a fake pool and
  fails if the wrapper no longer intercepts the transaction's queries) and
  `npx tsx scripts/pg-concurrency-check.ts` (a throwaway copy of the dev database, stock vs wrapped adapter).
- Remove the wrapper once Prisma serialises include loading in transactions itself: the test "the stock
  adapter hands one connection several queries at once" then fails and says so.
- Still keep transaction bodies sequential (`await` one query after the other on `tx`).

## Conventions

- **Money** is integer cents in EUR. Never floats.
- **Recurrence** is stored as an RFC 5545 RRULE.
- **Audit log**: sensitive mutations and every assistant/MCP write are recorded with the person and channel
  (`app`, `assistant`, `mcp`, `job`) via `audit()` (`src/api/audit`), shown under Settings → Activity. See [AUDIT.md](AUDIT.md).
- **Assistant safety**: AI tools are tagged `read`, `write` or `sensitive`. Sensitive ones (money,
  deletes, arming the alarm) need a human confirmation. Disarming is never exposed.
- **The assistant lives in `ai/`** (top level, next to `src/`): `ai/core` (registry, skills, routing,
  resolvers, loop, LLM client, MCP), `ai/skills/<skill>` (tools + guide per area), `ai/eval`, `ai/docs`.
  `ai/` may import the features' API services and contracts; features never import `ai/` (lint-enforced);
  only `src/api/app.ts` mounts it. Start at [ai/README.md](../ai/README.md); the chat UI stays in
  `src/features/assistant`.
- **Naming**: kebab-case files that say what they are (`habitant-card.tsx`, `household.service.ts`).
- **Stories**: every component in `ui`, `shared`, `layout` and a feature's `components`/`screens` gets
  a story in `stories/` (mirroring its layer), never next to the component.

## Working on the code

The repo lives on the server at `/var/www/WickedHome` and is edited from the Mac over SMB. Run Node
commands **on the server** (`ssh wicked@192.168.1.10`, `cd /var/www/WickedHome`). Running `npm install`
from the Mac would put macOS binaries on the share.
