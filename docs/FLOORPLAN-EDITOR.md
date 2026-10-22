# Floor plan editor

How the places editor works and what it takes from the user's earlier garden zone editor in `home-garden-case`
(`apps/web/app/features/gardens/components/garden-editor.tsx`).

## The reference

- **Rendering**: Konva/react-konva. The board auto-fits with 56 px padding and follows light and dark mode
  through CSS variables. There is no zoom or pan.
- **Modes**:
  - *Create*: clicks add grid-snapped points, drawn as a dashed line with dots. *Complete shape* (from 3
    points), *Undo point* and *Clear draft* sit next to it. The finished shape is selected and *Select* takes
    over.
  - *Select*: drag the vertex handles (r 6, or 7 when active; the active one is orange).
- **Grid**: snapping is always on and uses the document's `gridSizeCm` (25). There are no shortcuts and no undo.
  Saving is explicit and replaces everything.
- **Tools window**: floats top right over the canvas, 16 px in.
  - You drag it by a grip (pointer capture, so mouse, touch and pen all work). It is clamped inside the board
    and follows the corner until you move it.
  - It has *reset* and *compact* buttons. Compact turns the text into `sr-only`, leaving an icon strip.
  - Contents, top to bottom: window controls, a segmented mode switch (`aria-pressed`), then context for the
    active mode or selection.
- **Small screens**: the editor is hidden below `xl`.

## WickedHome

| Reference | WickedHome |
|---|---|
| Konva | **SVG**, so no dependency. It uses token classes (`fill-foreground`, `stroke-primary`), so dark mode is free. Strokes don't scale with zoom. Labels and handles are drawn in screen space. |
| Create / Select / Plant | **Select · Room (Zone outside) · Fill · Wall · Door · Window**, in the same segmented switch. |
| Create flow | Identical, plus: close by clicking the first point, double-clicking or pressing Enter. The draft survives a tool switch. |
| Vertex handles | Same, plus: drag a whole shape, drag an edge's midpoint dot to insert a corner, delete a corner. |
| Floating panel | Same behaviour, as the generic floating panel component. Position and compact state are also remembered per device. |
| Auto-fit | Fits on load and on resize until the user zooms or pans. Added: wheel zoom at the cursor, pinch, and pan by dragging empty space (also Space+drag or the middle button). The shared `ZoomControl` gives − / % / + / fit. Zoom runs from 5 to 500 % (100 % = 1 px/cm). |
| `gridSizeCm` | `Floor.gridSize` (5, 10, 25, 50 or 100), set in the panel. Points also snap to existing corners within 10 px (drawing rooms and face-aligned walls also to the corners of wall faces); **Alt** turns snapping off. |
| Hidden below `xl` | Below `lg`, and for children, the plan is **read-only**: tap a place to open it. Places are list-first, so drawing is never required. |

## Data (centimetres, y down, integers)

- `Place.polygon` is `[{x, y}…]` or null. The area (shoelace formula) is computed, never stored.
- `PlanElement` holds `kind` plus JSON geometry:
  - wall: `{a, b, thickness}`
  - door: `{wallId, offset, width, hingeAtEnd, swingFlipped}`
  - window: `{wallId, offset, width}`
- Openings sit in a wall at an offset from its start, so they move with it. Dragging a corner moves every wall
  joined there.
- `Floor.underlay` (JSON, or null) holds the imported plan's settings, validated by `floorUnderlaySchema` on
  the way in and out (an invalid stored value reads as null). See *Importing a plan*.
- North is the household's (`Household.planNorthDegrees`), shared by every floor. See *Orientation and sun*.
- Saving is explicit (button or Ctrl+S, disabled while a shape is half drawn) and calls
  `PUT /api/places/floors/:id/plan`. It replaces the elements and updates or creates the listed places.
  Removing an outline keeps the place. `underlay`: an object replaces it, null removes it, absent leaves it.

## Interaction

- **Tool shortcuts**: V select, R room/zone, F fill room, W wall, D door, N window.
- **Walls**: click every corner. Double-click, Enter or Esc stops; clicking the start point closes the loop.
  Thickness presets 9 · 14 · 20 · 30 · 34 cm plus any other. *The line you click is* the wall's centre, or its
  left or right face (seen in the drawing direction; the preview shows the wall, **X** flips the side). Face
  walls are offset by half the thickness and mitred at the corners, so the chain stays joined.
- **Doors and windows**: hover a wall for a preview, click to place, then drag along the wall. The panel sets
  the width and has *flip hinge* and *flip swing*.
- **Esc** clears the draft, then the selection, then returns to Select. **Del** deletes the selected corner or
  element, or removes the outline.
- **Undo/redo** is Ctrl+Z / Ctrl+Shift+Z, with 100 snapshot steps. A drag, or typing a name, is one step.
- **Labels**: name, icon and area at the centroid. Edge lengths show on the selection and while drawing.

## Importing a plan

*Set the scale, then trace over it, so the metres are automatic.* Walls and rooms stay two concepts: walls
are the structure (thickness, doors, windows), rooms are `Place` polygons (area, tasks, stock, devices). The
fast path is: trace the walls, then **Fill room** each room with one click.

**How the user does it**

1. Tools window → *Architect's plan* → **Import plan…** Choose the PDF (or PNG/JPG). The original goes to
   Documents, linked to the floor (`DocumentLink` entity type `floor`).
2. Several pages: pick one from the thumbnails. Then drag a rectangle around one drawing (e.g. *GELIJKVLOERS –
   nieuwe toestand*); zoom with the buttons or Ctrl + scroll. *Whole page* skips the crop. The ↺ / ↻ buttons
   turn the preview a quarter at a time; the selection is still stored on the page itself, and the turn
   becomes the underlay's `rotation` (on *Change crop* it starts at the current quarter turn, and only a
   change is added, so a fine rotation is kept). Once north is known, a small compass shows where it points.
3. The crop is rendered in high resolution (≈ 6000 px on the long side, at most 16 MP) and stored in Documents
   as `<name> – page N (plan underlay).png`. pdf.js reads the PDF's text: room labels (*Keuken 12,65 m2*, a
   name over an area, `m2`/`m²`, a raised 2) are kept with the underlay.
4. The calibrate tool opens. Click two points whose real distance you know and type it (`12,00 m`,
   `1200 cm`, or Belgian plan notation `1.200` = 1200 cm), **or** for a vector PDF choose the drawing scale
   (1:50, 1:100…; 1 pt = 1/72 inch). The measuring line keeps showing its length, so it can be checked against
   any wall or dimension ("this line measures 12,00 m").
5. Trace the walls (thickness preset, alignment *left/right face* to click along the architect's line).
6. **Fill room** (F): click inside each room. The outline follows the walls' inner faces, the name comes from
   the PDF label inside it (or a listed room with that name gets the outline), and the tools window shows the
   check: *17,32 m² · plan says 17,32 m² ✓*, or a warning above 3 % difference. Nothing is created without a
   click; freehand rooms (R) also pick up the label's name, and a selected room shows the same check.

**Underlay settings** (`FloorUnderlay`): source and image document ids, source name/type, `unit` (`pt` for a
PDF, `px` for an image), page, `crop` (in those units, y down, pdf.js viewport at scale 1, so it can be
re-rendered), `scale` (cm per unit), `calibrated`, `rotation` (degrees clockwise, around the crop's centre),
`center` (plan cm), `opacity`, `visible`, `locked`, `labels` (`{name, areaM2, u, v}` relative to the crop). The
plan itself never changes when calibrating: only the underlay's scale does. Placement maths lives in
`underlay-geometry.ts`.

**Panel**: show/hide, lock (locked: clicks go to the drawing; unlocked: drag it with Select to line it up with
what is drawn), opacity, rotate 90° and fine rotation (±10°), *Set scale*, *Change crop* (re-opens the stored
original with the old crop; the drawing stays aligned), *Replace*, *Remove* (the files stay in Documents). All
of it is part of the plan document: undo/redo and explicit save.

**Fill room** (`room-from-walls.ts`, unit tested): each wall becomes a solid quadrilateral; ends that meet
another wall's end get a square cap, ends inside another wall (T-junctions) stay, loose ends are bridged to a
wall within the gap tolerance (default 5 cm, set in the panel). The exact union of those shapes is built
(edges split where they cross; pieces inside another wall or shared by two walls dropped), then walked as a
planar graph with free space on the left. Closed walks with positive area are rooms; the smallest one around
the click wins. Doors and windows sit in walls, so they never leak. When the area isn't closed, the loose wall
ends nearest to the click are marked in red. Free-standing walls inside a room are not cut out.

**Rendering**: the underlay is an SVG `<image>` at the bottom of the plan (rooms, walls, openings and device
markers are drawn over it), `mix-blend-multiply` (white paper disappears; inverted in dark mode). In the
read-only plan (phones, children, `/house`) it is off until the *Architect's plan* button turns it on.

**pdf.js** (`pdfjs-dist` 5.6, pinned to a version that supports Node 20.19) is imported dynamically from
`plan-pdf.ts`, and the import dialog is `React.lazy`: pdf.js and its worker (`?url` import, a separate asset
in the build) only download when someone imports a plan.

**Privacy**: architects' plans carry names, addresses and phone numbers. They live only in the household's
Documents; stories and tests use the synthetic plan in `stories/features/places/plan-import-fixtures.ts`.

## Orientation and sun

*Every plan shows N, E, S and W, so the sun can be placed later.* The house has **one** true north:
`Household.planNorthDegrees` (Float, null until set), degrees clockwise from the plan's "up" (0 = north is up,
90 = north points right). All floors share the plan's coordinate system, so there is no per-floor value; a
sheet that is turned differently is lined up with the underlay's rotation instead. The plan API returns it
as `FloorPlan.north`, with `FloorPlan.location` (the household's latitude/longitude) for the sun. It is part
of the plan document: `PUT /api/places/floors/:id/plan` takes `north` (a number sets it, null clears it,
absent leaves it), so it has undo/redo and explicit save like everything else in the editor.

**How the owner sets north** (editor, tools window → *Orientation*):

- type the degrees (0–359), or press where the *top of the plan faces* (N, NE, E… — "top faces NE" is
  north = 315°);
- **Point north on the plan**: click the tail, then the tip of the architect's north arrow on the underlay.
  The arrow is read on the sheet (underlay units) and the underlay's rotation is added
  (`northFromArrow` in `plan-orientation.ts`), then *Use this*. Without an underlay any line pointing north
  works. Esc clears the clicks; a third click starts over;
- or drag the **compass dial** bottom right on the canvas (Shift: 15° steps). It is a slider for the
  keyboard too: arrow keys ±1° (Shift ±15°), Page Up/Down ±45°, Home = north up. A drag is one undo step.

**Where it shows**: the compass rose (`PlanCompass`) is on the editor canvas (a dial; "?" until set), on the
read-only `FloorPlanView` (top right on `/house`, phones and children's view), on a place's plan thumbnail,
and in the import dialog's crop step once known. The read-only view adds:

- **North up** (off by default, remembered per device in `localStorage` `wh-plan-north-up`): the whole plan
  is drawn turned by −north. The canvas has a `rotation` prop: screen = turn(world) × scale + offset, so
  hit-testing, zoom, pan, pinch and fitting work as before, the grid turns with the plan, and labels, edge
  lengths and device markers (screen space) stay upright. The editor never turns the drawing.
- **Sun** (needs north and the home's coordinates): light comes in as a soft wedge from the sun's side of
  the board, a sun dot sits on the compass ring, and a slider picks the time of today (5-minute steps,
  *Now* resets) with "Sun in the south-west (235°), 35° above the horizon" or "below the horizon".

**Sun position** (`src/lib/sun-position.ts`, pure, unit tested): the NOAA solar position formulas (Meeus):
`sunPosition(date, latitude, longitude)` gives the azimuth (clockwise from true north) and geometric
elevation (no refraction); `solarNoon(date, longitude)`. On the plan the sun stands at
`screenAngle(north, azimuth, viewRotation)` = north + azimuth + view turn. Tests check Brussels: solar noon
≈ 13:44 summer time on 21 June at 62,6°, 15,7° on 21 December, ≈ 39,2° at the March equinox, always due
south, and sunrise azimuths of ≈ 51° / 90° / 129°.

**Code**: `plan-orientation.ts` (angles, `northFromArrow`, compass points, the crop step's quarter-turn
maps; unit tested in `plan-orientation.test.ts`), `plan-compass.tsx`, `floor-plan-orientation-panel.tsx`
(the *Orientation* section and the north tool), and the `north` tool and `northArrow` in the editor state.
