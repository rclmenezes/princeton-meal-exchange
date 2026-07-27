import { Resend } from "resend";

export type EmailAttachment = {
  content: Buffer | string;
  filename: string;
  contentId?: string;
};

type SendEmailInput = {
  to: string | string[];
  subject: string;
  text: string;
  html?: string;
  attachments?: EmailAttachment[];
  idempotencyKey?: string;
};

export async function sendEmail({
  to,
  subject,
  text,
  html,
  attachments,
  idempotencyKey,
}: SendEmailInput) {
  if (!process.env.RESEND_API_KEY) {
    if (process.env.NODE_ENV !== "production") {
      console.warn(
        `RESEND_API_KEY is not set. Skipping email to ${Array.isArray(to) ? to.join(", ") : to}: ${subject}`,
      );
      return { id: "development-skipped" };
    }

    throw new Error("RESEND_API_KEY is not set.");
  }

  const resend = new Resend(process.env.RESEND_API_KEY);
  const { data, error } = await resend.emails.send(
    {
      from:
        process.env.RESEND_FROM_EMAIL ??
        "Princeton Meal Exchange <onboarding@resend.dev>",
      to,
      subject,
      text,
      html,
      attachments,
    },
    idempotencyKey ? { idempotencyKey } : undefined,
  );

  if (error) {
    throw error;
  }

  return data;
}
