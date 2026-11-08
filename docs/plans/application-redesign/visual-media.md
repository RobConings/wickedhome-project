# Images, banners and view modes

Photos are part of WickedHome's recognisable visual identity. Preserve the existing recipe/project banners and cover selection when simplifying page structure. A consistent application can still have generous, beautiful image cards.

## Presentation by context

| Context | Card mode | List mode | Detail page |
|---|---|---|---|
| Recipes | Food cover, title, useful facts and favourite action | Food thumbnail and the same facts | Recognisable wide recipe banner |
| Projects | Project cover, identity, progress and budget | Cover thumbnail, status and key figures | Existing wide project banner, clear title/actions and related records |
| Products | Actual product photo, name, unit and useful stock/shop information | Recognisable thumbnail with quantities beside it | Product identity image; use contain so packaging is not cropped |
| Devices/appliances | Saved device photo when available, identity and live state | Thumbnail, location and state | Device photo alongside context; source freshness and controls remain separate |
| Spaces | Room photo or floor-plan preview where available | Thumbnail/icon and room identity | Optional room cover plus the actual room information |
| Financial/activity records | Purposeful data cards | Compact factual rows | Clear amounts, provenance and actions |

The card/list switch remains available through `GeneralList`, remembers the chosen mode per view and keeps search/filters/context. Both modes preserve the same records, relationships and actions. Changing mode changes presentation only.

## Reuse and ownership

- Reuse and extend the existing `ProjectTile`, `RecipeTile`, their list rows, cover choosers and detail-image regions. The redesign does not replace these with generic icon-only cards.
- Product images already use the catalogue's image reference. Project/recipe covers retain their existing document links and access checks.
- Devices now persist a selected attached photo. `RecordImage` supplies shared card/banner/thumbnail fallbacks; `LinkedImagePicker` and `ImageChoiceGrid` serve device, project and recipe covers. Profile icons, live indicators and source freshness remain separate facts.
- Generous media cards should reuse the existing `PageGrid` cards layout through a small `GeneralList` layout option. Compact tiles remain useful for data-heavy contexts; the preview demonstrates the larger card geometry without changing production.
- Shared media treatment may standardise aspect ratio, crop/contain, loading, alt text and fallback. Domain owners still choose the image and provide record identity, state and actions.
- Reuse the same authorised image across overview, picker, relationship and detail contexts. Avoid duplicate uploads or a separate image per screen.

## Visual rules

Images help identify the record. Titles, status, counts and actions stay legible outside the image; a crop must not hide essential information. Use stable card image regions, larger banners on recipe/project details and compact thumbnails in lists. Product packaging uses contain; covers can crop around an appropriate focal point.

Missing or failed images use the existing domain icon and colour treatment. Missing images do not cause broken-image controls or a forced upload step. Use saved/approved images, not invented photos of the household. Respect keyboard access, alt text, reduced motion and both themes. Loading/failure states must retain the record's name and actions.

## Review examples

The walkthrough's **Photos and views** chapter demonstrates recipe covers and banners, project cards, product images and device photos, alongside intentional missing-image fallbacks. The example photographs are local design assets, not actual household pictures or verified product packshots. See [image credits](preview/media/README.md).

`preview/media-patterns.tsx` is design-only composition using the same image-region pattern as the existing feature cards. During implementation, extend the real owner components and extract only genuinely shared media behaviour; do not install the preview renderer as a second production component system.
