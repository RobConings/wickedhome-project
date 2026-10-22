# WickedHome — Branding

**Your home. Together.** *(Jouw huis. Samen.)* Clean, organised, a calmer home.

## Logo

A house outline with a leaf inside and a dot above the roof. The word mark is "Wicked" in the primary
green and "Home" in sage, set in Inter Bold.

| File | Use |
|---|---|
| `public/brand/logo.svg` | Horizontal lockup with tagline, light backgrounds |
| `public/brand/logo-inverse.svg` | Horizontal lockup on the primary green |
| `public/brand/logo-mark.svg` / `logo-mark-inverse.svg` | The mark alone |
| `public/brand/app-icon.svg`, `icon-192.png`, `icon-512.png` | App icon (white tile) |
| `public/brand/icon-maskable-512.png`, `public/apple-touch-icon.png` | Home-screen icons |
| `public/favicon.svg`, `public/favicon-32.png` | Browser tab (green tile) |

In the app, use the `BrandMark` component. It follows the theme
and switches to the inverse colours in dark mode.

## Colour system

Calm and homely, with life: neutral surfaces, **one** call-to-action colour, the warm peach as the
highlight, clear status colours and one accent hue per area of the app. Accents are small, purposeful
touches (icons, chips, edges, active states, numbers), never full-colour backgrounds.

Components only use token names (`bg-primary`, `text-section`, `bg-danger-soft`…), never hex values. All
tokens live in `src/styles/index.css` (dark values under `.dark`); the Storybook page
**Foundations/Colours** shows every token in both themes (toolbar: Theme and Accent).

### Which colour when

| Need | Use | Not |
|---|---|---|
| The main action of a page ("Log expense", "Save") | `Button` default = `--primary` (deep green; luminous mint with dark text in dark mode, the brightest thing on the page) | Peach or a section hue for buttons |
| Secondary actions | `outline` / `secondary` / `ghost` buttons: quiet | A second primary button |
| Emphasis: today, selected, new, "needs you", counts | **Highlight** (peach): `Badge variant="highlight"`, `Card tone="attention"`, `SectionHeader attention`, `StatTile tone="highlight"` | Status colours |
| Which part of the app you are in | **Section accent** (`--section*`), set automatically: page header bar, icon chips, active nav item, tabs/segmented control, progress bars, list group marks, empty states | Picking a hue in a feature |
| Status: paid / done, due soon, overdue, on hold / at risk, info / waiting | **Semantic**: `success`, `soon`, `danger`, `warning`, `info` (Badge variants, StatTile tones, Card edges, `text-danger`…) | Section hues for status |
| Data series | `--chart-1…8` in order; `--chart-income` / `--chart-expense` | Status colours for categories |

### Brand and surfaces

| Token | Light | Dark | Use |
|---|---|---|---|
| `--brand-ink` / `--primary` (light) | `#124734` | — | Logo, primary actions |
| `--brand-leaf` | `#6B8F73` | `#8FB89A` | "Home" in the word mark, focus ring |
| `--brand-mint` / `--secondary` / `--accent` | `#E8F2EC` | `#252D2A` / `#232B28` | Secondary buttons, hover fills |
| `--background` | `#F6F7F8` | `#0E1211` | Page |
| `--card` | `#FFFFFF` | `#161B1A` | Cards |
| `--elevated` / `--popover` | `#FFFFFF` | `#1D2321` | Menus, popovers, raised chips |
| `--muted` | `#EEF0F2` | `#222927` | Tracks, inactive tabs |
| `--foreground` / `--muted-foreground` | `#0F172A` / `#5B6779` | `#ECF0EE` / `#9BA6A2` | Text |
| `--primary` / `--primary-foreground` | `#124734` / `#FFFFFF` | `#74DCA6` / `#062417` | The call to action |
| `--highlight` / `-foreground` / `-strong` / `-soft` | `#F4D7B5` / `#6B3F12` / `#C9702A` / `#FBEEDD` | `#3A2A1B` / `#F8D2A6` / `#F5B16F` / `#2E2216` | Peach emphasis; strong = edges, dots, icons |

### Semantic status

`--x` is the solid colour (icons, bars, edges) and is also AA as text on cards and the page;
`--x-soft` is the badge fill, `--x-border` its border, `--x-foreground` the badge text.
`--danger` = `--destructive`.

| Name | Meaning | Light solid / fg / soft / border | Dark solid / fg / soft / border |
|---|---|---|---|
| `success` | Paid, done, all good, savings | `#13733A` / `#166534` / `#E6F4EA` / `#B5DCC0` | `#4ADE80` / `#86EFAC` / `#13291C` / `#23543A` |
| `soon` | Due soon, expiring | `#B13B0B` / `#9A3412` / `#FDEADD` / `#F6C3A1` | `#FB923C` / `#FDBA74` / `#331F10` / `#63391A` |
| `warning` | On hold, paused, at risk, offline | `#A14A08` / `#92400E` / `#FDF1DC` / `#F2CF8F` | `#FBBF24` / `#FCD34D` / `#2E2410` / `#5C4613` |
| `danger` | Overdue, over budget, failed, alarm | `#C81E1E` / `#991B1B` / `#FCE8E8` / `#F3B8B8` | `#F87171` / `#FCA5A5` / `#351718` / `#6A2A2B` |
| `info` | Upcoming, next period, waiting, running | `#1F5BD8` / `#1E40AF` / `#E7EFFD` / `#B9CDF8` | `#60A5FA` / `#93C5FD` / `#142339` / `#274A7A` |

### Section accents

Each area has a hue with `solid` (icons, bars, active marks), `soft` (chip/tint), `border` and
`foreground` (text). The frame sets `data-accent="<name>"` on the page from the URL
(`src/app/section-accents.ts`) and on every nav item; the `--section`, `--section-soft`,
`--section-border`, `--section-foreground` tokens (`bg-section-soft`, `text-section`…) then resolve to
that hue for everything inside. Any element can set `data-accent` to show another section's colour (the
dashboard's tiles, an expense category icon).

| Accent | Areas | Light solid / soft / border / fg | Dark solid / soft / border / fg |
|---|---|---|---|
| `home` | Home, house, habitants, places | `#2A7650` / `#E8F2EC` / `#BCD9C6` / `#124734` | `#6FCF97` / `#17281F` / `#2B4A38` / `#A3E2BD` |
| `tasks` | Tasks | `#2563EB` / `#E8EFFD` / `#BED0FA` / `#1D4ED8` | `#60A5FA` / `#162238` / `#284270` / `#A9CBFC` |
| `shopping` | Shopping, shops, inventory | `#E2530B` / `#FDEEE3` / `#F8CDAA` / `#B3410A` | `#FB923C` / `#33210F` / `#5E3A1A` / `#FDBB85` |
| `calendar` | Calendar | `#7C3AED` / `#F1EAFD` / `#D9C7FB` / `#6427CF` | `#A78BFA` / `#221C39` / `#3F3569` / `#CBBAFD` |
| `energy` | Energy | `#C26A05` / `#FDF3D9` / `#F3D68A` / `#92510A` | `#FBBF24` / `#30270F` / `#5B4716` / `#FCD875` |
| `finance` | Expenses, income, money, projects | `#0D9488` / `#E0F3F0` / `#A3DBD2` / `#0B6B62` | `#2DD4BF` / `#0F2C29` / `#1E514A` / `#8FE8DB` |
| `documents` | Documents | `#0284C7` / `#E2F1FA` / `#ACD6EF` / `#0369A1` | `#38BDF8` / `#0E2937` / `#1C4B63` / `#98D9FB` |
| `devices` | Devices, Home Assistant | `#0891B2` / `#DFF3F7` / `#A4DAE5` / `#0E6A80` | `#22D3EE` / `#0D2C32` / `#1B525B` / `#8FE6F4` |
| `assistant` | Assistant | `#DB2777` / `#FCE8F1` / `#F4BCD5` / `#B0215F` | `#F472B6` / `#341A29` / `#602D4A` / `#F9AED6` |
| `integrations` | Integrations, notifications, settings | `#52607A` / `#EEF1F5` / `#CCD4DF` / `#3B4759` | `#94A3B8` / `#1E242D` / `#374255` / `#CDD5E0` |

**A new feature** adds its first URL segment to `ACCENT_BY_SEGMENT` in `src/app/section-accents.ts`
(a new hue: add it to `SECTION_ACCENTS` in `src/lib/section-accent.ts` and to `index.css`). Its nav item
and every shared component on its pages follow; the feature's own code never names a colour.

### Shared components that carry colour

| Component | What it does with colour |
|---|---|
| `AppShell` nav | Icon in the item's section colour; active item: section-soft fill, accent bar, bold text; titled groups (Finance) get their accent dot |
| `PageHeader` | A short bar in the section colour above the title; optional `icon` chip |
| `StatTile` | Filled icon chip, top wash + edge, hint in the tone's colour. `tone`: `default` (section), `featured` (the page's key figure), `positive`, `negative`, `warning`, `soon`, `info`, `highlight`, `neutral`; `iconTone="tasks"` etc. colours a tile about another section |
| `IconChip` | `primary` = section; `brand` = mint; semantic tones; or a section name |
| `Badge` | `success`, `soon`, `warning`, `danger`, `info`, `highlight`, `section`, `neutral` for every status |
| `Card` | `tone`: `attention` (peach edge), `section`, `featured`, `danger`, `warning`, `success` |
| `SectionHeader` | `accent` mark, `attention` (peach), optional `icon` chip; `GeneralList` group headers use `accent` |
| `SegmentedControl`, `Tabs` | Selected option raised, icon in the section colour |
| `Progress`, `BreakdownBars`, `EmptyState`, `InlineAlert` | Section-coloured bars and illustrations; alerts in `info` / `success` / `warning` / `error` |

### Charts

Fixed order, never cycled; adjacent slots differ in hue and lightness. Income is green, expenses coral.

| Slot | 1 | 2 (income) | 3 (expense) | 4 | 5 | 6 | 7 | 8 |
|---|---|---|---|---|---|---|---|---|
| Light | `#2A78D6` | `#1A9B6C` | `#E5604A` | `#E0A000` | `#D6589A` | `#1597B8` | `#6A4FD6` | `#C93A3A` |
| Dark | `#4A94EC` | `#34C48C` | `#F47C66` | `#F2B729` | `#EC7FB8` | `#3AC0DD` | `#9D8CF2` | `#EF6B6B` |

Light slots 4–6 are below 3:1 on white: charts using them print the values in a legend or table.

### Contrast (WCAG 2.1)

Text needs 4.5:1, icons and edges 3:1. Computed with the WCAG relative-luminance formula.

| Pair | Light | Dark |
|---|---|---|
| Foreground on page / card | 16.6 / 17.9 | 16.4 / 15.2 |
| Muted text on page / card / muted | 5.35 / 5.74 / 5.02 | 7.52 / 6.94 / 5.92 |
| Muted text on any section soft / highlight-soft (stat tile labels) | ≥ 4.90 | ≥ 5.88 |
| Highlight tile: hint text / icon on highlight-soft | 7.84 / 3.15 | 10.9 / 8.40 |
| Primary button text | 10.6 | 9.85 |
| Highlight text on peach | 6.50 | 9.67 |
| Highlight strong (edge, icon) on card | 3.60 | 9.46 |
| Destructive button text | 5.74 | 5.70 |
| success solid on card / page / soft · fg on soft | 5.93 / 5.53 / 5.22 · 6.28 | 9.99 / 10.8 / 8.85 · 11.0 |
| soon | 6.00 / 5.59 / 5.14 · 6.26 | 7.69 / 8.33 / 6.90 · 9.26 |
| warning | 6.00 / 5.60 / 5.37 · 6.34 | 10.4 / 11.3 / 9.14 · 10.6 |
| danger | 5.74 / 5.35 / 4.88 · 7.06 | 6.30 / 6.82 / 5.90 · 8.60 |
| info | 5.92 / 5.52 / 5.12 · 7.54 | 6.85 / 7.42 / 6.21 · 8.76 |
| Section fg on soft (lowest: shopping) | ≥ 5.04 | ≥ 9.09 |
| Section fg on card (lowest: shopping) | ≥ 5.71 | ≥ 9.94 |
| Section solid on card, icons (lowest: devices) | ≥ 3.68 | ≥ 6.40 |
| Card-coloured icon on solid section (featured chip) | ≥ 3.68 | ≥ 6.40 |
| Nav active text on section soft | ≥ 12.9 | ≥ 11.9 |

Semantic solids also stay ≥ 4.5:1 on their own 12 % tint (`bg-success/12` etc.), so older
`text-success` + tint combinations remain readable.

## Typography

Inter (variable), loaded locally from `@fontsource-variable/inter`.
