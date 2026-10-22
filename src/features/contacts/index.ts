// Public API of the contacts feature. Routes, the app frame and other features import from here only.
//
// - Project page: the route composes `<ProjectContactsPanel projectId={…} canManage={…} />` in the project screen's
//   `contacts` slot (projects never imports contacts). It loads its own data and posts to the `/contacts` action.
// - Other forms: `<ContactPicker contacts={await fetchContacts()} name="contactId" />` with favourites and recents.
export { ContactPicker } from "./components/contact-picker";
export { ProjectContactsPanel } from "./components/project-contacts-panel";
export { contactsAction, contactsLoader, type ContactActionResult, type ContactsPageData } from "./data/contacts-loaders";
export { fetchContact, fetchContacts } from "./data/contacts-requests";
export { useContactSelections } from "./data/use-contact-selections";
export { ContactsScreen } from "./screens/contacts-screen";
export { canManageContacts, contactSubtitle, mailtoHref, telHref, type Contact, type ContactProjectLink } from "./types/contacts";
