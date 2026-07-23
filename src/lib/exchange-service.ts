import { db } from "@/db";
import { exchange } from "@/db/schema";
import { createBarcodePng } from "@/lib/barcode";
import { sendEmail } from "@/lib/email";
import {
  createConfirmationEmail,
  createInvitationEmail,
} from "@/lib/exchange-emails";
import {
  deriveInvitationToken,
  getExchangeSecret,
  hashInvitationToken,
} from "@/lib/exchange";
import { and, eq, ne } from "drizzle-orm";

export async function getExchangeByToken(token: string) {
  if (!token || token.length > 128) return null;
  return db.query.exchange.findFirst({
    where: eq(exchange.invitationTokenHash, hashInvitationToken(token)),
  });
}

export function getInvitationToken(exchangeId: string) {
  return deriveInvitationToken(exchangeId, getExchangeSecret());
}

export function getExchangeDetailUrl(exchangeId: string, appUrl: string) {
  return `${appUrl.replace(/\/$/, "")}/exchanges/${getInvitationToken(exchangeId)}`;
}

export async function deliverInvitationEmail(
  record: ExchangeRecord,
  appUrl: string,
) {
  if (record.invitationEmailStatus === "sent") {
    return { status: "sent" as const, id: record.invitationEmailId };
  }

  await db
    .update(exchange)
    .set({ invitationEmailStatus: "sending", updatedAt: new Date() })
    .where(
      and(
        eq(exchange.id, record.id),
        ne(exchange.invitationEmailStatus, "sent"),
      ),
    );

  const detailUrl = getExchangeDetailUrl(record.id, appUrl);
  const message = await createInvitationEmail({
    counterpartName: record.counterpartName,
    hostName: record.hostName,
    location: record.location,
    mealType: record.mealType,
    expiresAt: record.expiresAt,
    detailUrl,
  });

  try {
    const result = await sendEmail({
      to: record.counterpartEmail,
      ...message,
      idempotencyKey: `exchange-invitation/${record.id}`,
    });
    await db
      .update(exchange)
      .set({
        invitationEmailStatus: "sent",
        invitationEmailId: result?.id ?? null,
        updatedAt: new Date(),
      })
      .where(eq(exchange.id, record.id));
    return { status: "sent" as const, id: result?.id ?? null };
  } catch (error) {
    await db
      .update(exchange)
      .set({ invitationEmailStatus: "failed", updatedAt: new Date() })
      .where(
        and(
          eq(exchange.id, record.id),
          eq(exchange.invitationEmailStatus, "sending"),
        ),
      );
    throw error;
  }
}

export async function deliverConfirmationEmail(
  record: ExchangeRecord,
  appUrl: string,
) {
  if (record.confirmationEmailStatus === "sent") {
    return { status: "sent" as const, id: record.confirmationEmailId };
  }

  await db
    .update(exchange)
    .set({ confirmationEmailStatus: "sending", updatedAt: new Date() })
    .where(
      and(
        eq(exchange.id, record.id),
        ne(exchange.confirmationEmailStatus, "sent"),
      ),
    );

  const detailUrl = getExchangeDetailUrl(record.id, appUrl);
  const message = await createConfirmationEmail({
    counterpartName: record.counterpartName,
    hostName: record.hostName,
    location: record.location,
    mealType: record.mealType,
    expiresAt: record.expiresAt,
    detailUrl,
    barcodeValue: record.barcodeValue,
  });

  try {
    const barcode = await createBarcodePng(record.barcodeValue);
    const result = await sendEmail({
      to: record.counterpartEmail,
      ...message,
      attachments: [
        {
          content: barcode,
          filename: "meal-exchange-barcode.png",
          contentId: "exchange-barcode",
        },
      ],
      idempotencyKey: `exchange-confirmation/${record.id}`,
    });
    await db
      .update(exchange)
      .set({
        confirmationEmailStatus: "sent",
        confirmationEmailId: result?.id ?? null,
        updatedAt: new Date(),
      })
      .where(eq(exchange.id, record.id));
    return { status: "sent" as const, id: result?.id ?? null };
  } catch (error) {
    await db
      .update(exchange)
      .set({ confirmationEmailStatus: "failed", updatedAt: new Date() })
      .where(
        and(
          eq(exchange.id, record.id),
          eq(exchange.confirmationEmailStatus, "sending"),
        ),
      );
    throw error;
  }
}

export function appUrlFromRequest(request: Request) {
  return (
    process.env.NEXT_PUBLIC_APP_URL ??
    process.env.BETTER_AUTH_URL ??
    new URL(request.url).origin
  );
}

type ExchangeRecord = NonNullable<
  Awaited<ReturnType<typeof getExchangeByToken>>
>;
