- The drive holds folders and files (PDFs, photos, manuals, invoices). Documents can be attached to a room, an appliance, a task, a project, an expense or a recurring expense.
- Find by words in the file name: "Where is the dishwasher manual?" → `documents_linked` on appliance, name dishwasher; nothing there → `documents_search` "dishwash".
- General document uploading or scanning uses the app. Shopping receipts are an exception: shopping_session_upload_receipt accepts an explicitly provided PDF/image as base64, stores it via the existing documents backend, and attaches it to a visit. No receipt is needed to buy products. You can't read a document's contents, only its name and details.
- Trash: moving to the trash can be undone (restore). Emptying the trash or deleting for good is only in the app.
- Children can look, not change.

- For a subscription, insurance schedule or loan: use `documents_linked` with `on: "recurring_expense"` and its name/id. This includes the original subscription’s attachments after migration. `documents_attach` uses the current schedule; detaching removes that file’s links to the schedule and its original subscription, while keeping the file.
