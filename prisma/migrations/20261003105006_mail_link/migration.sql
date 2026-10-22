-- AlterEnum
ALTER TYPE "MailSuggestionStatus" ADD VALUE 'LINKED';

-- AlterTable
ALTER TABLE "mail_bill_rules" ADD COLUMN     "recurringExpenseId" TEXT;

