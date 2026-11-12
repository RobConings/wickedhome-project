# Shopping and purchases

**Different records:** inventory_products = catalogue identity; inventory_stock = quantity at home; shopping_list = things needed; shopping_session = an optional visit/checklist; stock purchases = actual acquired goods; receipts/payments = evidence and finances. Do not conflate them. Search and reuse existing products and shared-stock alternatives before creating new ones. If a one-off genuinely lacks a matching catalogue product, provide unlinkedReason. A package counts in its known household stock unit (one jar is one); never invent grams, volume or conversions.

**Regular shopping list:** Below minimum = out; essential at minimum = out / "Op"; nonessential at minimum = nearly_out / "Bijna op". These are forecasts, not necessarily zero on hand. The person decides what to buy. Recipe requirements and explicit needs can coexist with minimum restocking. Skip / "Not now" without changing inventory or minimums; reopening restores a need. When buying, record known stock exactly once and suppress a duplicate immediate replenishment. Do not create duplicate list rules merely because minimum-stock forecasting produces a new suggestion.

**Choose the retailer channel:** Xtra/Colruyt is the in-store shopping list for a physical store visit
(winkellijstje / zelf naar de winkel). Collect&Go is the online ordering basket (online bestellen),
including orders collected at a pickup point. They belong to the same retail group but have separate
lists/baskets, connections and account access. For an in-store list use `shopping_xtra_search/list/add/remove`;
for an online basket use `shopping_collectandgo_search/basket`. If the intended channel is unclear,
ask which one before changing an external list or basket. Never copy or transfer items between channels
without an explicit request and confirmation. WickedHome's own needs remain a third, independent record.

**Separate promotion research:** When building or updating a shopping list, proactively search online
for current promotions at the relevant retailers as a separate lookup, including when using Xtra.
Xtra product search supplies product matches and observed prices, not a complete promotions feed.
Use the connected assistant's own browsing, or `web_search` then `web_read` when available. Prefer
retailer promotion pages and leaflets; verify the requested shopping date, exact brand/variant and
package, minimum quantities, multi-buy rules, Xtra membership and any coupon/activation requirements.
Verify the channel too: a Colruyt in-store offer or price does not establish the Collect&Go online price
or eligibility, and an online promotion does not establish an in-store discount.
Report source links, validity dates and conditions with each suggested deal. Keep ordinary prices,
verified offers and estimated savings distinct; never invent eligibility, stack discounts or imply
a promotion is already applied to the Xtra list. Suggest substitutions or extra quantities only with
the person's agreement. If browsing is unavailable or the conditions cannot be verified, explicitly
report that promotions were not checked or remain unverified, then continue with known product data.

**Units and recipe needs:** inventory_units reads central household reference units, factors, aliases and rounding, independently of products. Never assume one bag is one piece or infer a bottle's volume/head's weight. Recorded stock 0 is empty in every unit; positive unknown_amount is not a shortage. Check recipes_list before recipes_plan. If purchaseQuantityRequired, ask how much to buy in purchaseUnit and pass recipes_plan quantities keyed by ingredientId. Do not silently buy 1 kg/package, skip a confirmed zero-stock need, or invent product-specific unit rules. Preserve unrelated definitions and confirm the exact central catalogue before inventory_save_units.

**End units:** central isTerminal units are allowed as conversion endpoints, never as intermediate nodes, including between sibling branches. inventory_units returns permitted paths and blockedByTerminal. Never bypass a boundary with arithmetic, a different alias or a shortcut definition; request explicit quantities instead. Preserve built-in end-unit settings as well as custom definitions when saving units.

**Shopping sessions:** Start for a shop or shop group with matching needs, or explicitly selected requirement IDs; includeLowStock controls optional automatic replenishment. It is a convenience while shopping, not a contractual checklist. Products may be added, created, linked to the catalogue or left as genuine one-offs. You can buy none, some or extra products. Before any purchase on an item, productId may be substituted by ANY catalogue product, without globally merging their inventories. After partial purchase, only real shared-stock variants may replace it; for unrelated extra goods add another visit row. The original need is preserved, and the actual bought product identity is recorded in the acquisition. A product can be offered in multiple shops: planned shop/default shop is not a hard purchasing restriction.

Use shopping_sessions and shopping_session to obtain IDs and latest session/item revisions. An item update's purchasedQuantity means the TOTAL purchased so far, not the additional amount. Use stable operationId for idempotent retries, reread when revisions conflict, and never replay an independent purchase. Recording a real purchase credits a known stock location once. Adjusting planned quantity or chosen product alone creates no purchase. Close a session even if suggestions remain OPEN; they stay on the ordinary list. An ACTIVE session can be removed without closing or checking anything off, but do not remove genuine purchases, stock movements, receipts or payments. Closed sessions are not deletable through this workflow.

**Kassabonnen are optional.** You may buy, finish and pay without any receipt. If supplied, shopping_session_upload_receipt accepts the actual base64 contents of a PDF or image (max 4 MB) and stores it in household documents; otherwise attach a document already uploaded with shopping_session_attach_receipt. Use the date printed on the receipt. Match individual printed lines with stable receipt references using shopping_session_match_receipt. Link earlier acquisitions (including purchases through the ordinary shopping list before sessions existed) rather than adding the goods again. A receipt's actual retailer may supersede the originally planned shop; an item sold at another shop is not an error. Do not assume that a quantity discrepancy, old stock count, or unmatched item should add more stock without confirming it.

**Payments:** Get valid expenses, payment accounts and payers from shopping_payment_options. Record each actual split with shopping_session_record_payment and a distinct stable reference, correct payer, method, and date. Linking an existing paid expense must not create another one. Receipts alone do not create expenses. Do not infer a paid amount from stock quantities. Preserve unrelated recurring expenses and household cost allocations.


## Xtra / Colruyt — in-store shopping

Use `shopping_xtra_search` and `shopping_xtra_list` for the household's shared retailer connection.
Only accounts explicitly selected by a household owner have access. On access/expiry errors, refer
the person to Settings → Xtra; never ask for cookies, API keys, passwords or connection files in chat.
Search uses Dutch product words and returns store-specific observed prices, package sizes and opaque
offer IDs. Perform the separate online promotion research described above before proposing the list.
Ask the person to choose an exact product; never assume dietary equivalence. `shopping_xtra_add`
adds the specified quantity (not a final total) of an observed whole-piece product after confirmation.
`shopping_xtra_remove` removes a recently read item after confirmation. Preserve operationId on retries;
after an uncertain result, inspect the list before attempting a new operation. Xtra shopping lists are
separate from Collect&Go baskets/orders and WickedHome needs. Never record purchases or change stock
just because you prepared a retailer list. See docs/XTRA.md.

## Collect&Go — online ordering

When the browser integration is enabled and a household owner has selected your account, use `shopping_collectandgo_search` for live product matches or
promotion-page results. Use Dutch product search words for the Dutch storefront. Read the observed date, price context, package name and conditions. A lexical
match is not a dietary or quantity equivalence guarantee. Never invent savings from mix-and-match,
service costs or loyalty offers. Show the products and ask the person to choose an offer. Use
`shopping_collectandgo_basket` only for that observed offer and an explicit final quantity; it always
asks for confirmation and never places an order. If an offer expired or the price changed, search again.
The session is shared across selected accounts. Only owners can import, share an older personal session,
change grants or disconnect everyone in Settings → Collect&Go. Selected children can only search/read.
On CAPTCHA/login errors, ask an owner to renew the shared session from their normal browser.
An imported cookie session is not proof of signed-in basket access, and a retailer block may still prevent server access.
On an unverified write, say the basket may have changed and ask them to inspect it before retrying.
Preparing a basket does not mark WickedHome needs bought or create a purchase, expense or stock entry.
