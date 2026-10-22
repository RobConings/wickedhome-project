import { GlobeIcon, MailIcon, PhoneIcon } from "lucide-react";
import { useTranslation } from "react-i18next";
import { cn } from "@/lib/utils";
import { mailtoHref, telHref, type Contact } from "../types/contacts";

type ContactLinksProps = {
  contact: Pick<Contact, "name" | "emails" | "phones" | "websiteUrl">;
  /** Every number and address (detail views); by default only the primary ones. */
  all?: boolean;
  /** Also the website. */
  website?: boolean;
  className?: string;
};

const pill =
  "inline-flex min-h-10 max-w-full min-w-0 items-center gap-2 rounded-full border bg-card px-3 py-1.5 text-sm font-medium outline-none hover:bg-accent focus-visible:ring-[3px] focus-visible:ring-ring/50 [&_svg]:size-4 [&_svg]:shrink-0 [&_svg]:text-primary";

/**
 * Tap to call or mail: the contact's phone numbers (`tel:`) and email addresses (`mailto:`) as pills showing the
 * number or address itself. Long addresses wrap instead of running out of the pill.
 */
export function ContactLinks({ contact, all = false, website = false, className }: ContactLinksProps) {
  const { t } = useTranslation("contacts");
  const phones = all ? contact.phones : contact.phones.slice(0, 1);
  const emails = all ? contact.emails : contact.emails.slice(0, 1);
  if (!phones.length && !emails.length && !(website && contact.websiteUrl)) return null;

  return (
    <div className={cn("flex flex-wrap gap-2", className)}>
      {phones.map((phone) => (
        <a key={phone} href={telHref(phone)} className={pill} aria-label={t("actions.call", { name: contact.name, phone })}>
          <PhoneIcon aria-hidden="true" />
          <span className="min-w-0 break-words">{phone}</span>
        </a>
      ))}
      {emails.map((email) => (
        <a key={email} href={mailtoHref(email)} className={pill} aria-label={t("actions.mail", { name: contact.name, email })}>
          <MailIcon aria-hidden="true" />
          <span className="min-w-0 break-all">{email}</span>
        </a>
      ))}
      {website && contact.websiteUrl && (
        <a href={contact.websiteUrl} target="_blank" rel="noopener noreferrer" className={pill}>
          <GlobeIcon aria-hidden="true" />
          <span className="min-w-0 break-all">{t("actions.visitWebsite")}</span>
        </a>
      )}
    </div>
  );
}
