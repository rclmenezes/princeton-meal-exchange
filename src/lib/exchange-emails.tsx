import type { MealType } from "@/lib/exchange";
import {
  Body,
  Button,
  Column,
  Container,
  Head,
  Heading,
  Hr,
  Html,
  Img,
  Preview,
  Row,
  Section,
  Text,
  render,
  toPlainText,
} from "react-email";
import type { ReactNode } from "react";

export type ExchangeEmailDetails = {
  counterpartName: string;
  hostName: string;
  location: string;
  mealType: MealType;
  exchangeDate: string;
  expiresAt: Date;
  detailUrl: string;
  barcodeValue?: string;
  barcodeImageSrc?: string;
};

const formatter = new Intl.DateTimeFormat("en-US", {
  dateStyle: "full",
  timeStyle: "short",
  timeZone: "America/New_York",
});
const mealDateFormatter = new Intl.DateTimeFormat("en-US", {
  dateStyle: "full",
  timeZone: "UTC",
});

export async function createInvitationEmail(details: ExchangeEmailDetails) {
  const subject = `${details.hostName} invited you to ${titleCase(details.mealType)}`;
  const html = await render(<InvitationEmail {...details} />);
  return { subject, html, text: toPlainText(html) };
}

export async function createConfirmationEmail(details: ExchangeEmailDetails) {
  if (!details.barcodeValue) {
    throw new Error("A barcode value is required for a confirmation email.");
  }
  const subject = `Confirmed: ${titleCase(details.mealType)} at ${details.location}`;
  const html = await render(<ConfirmationEmail {...details} />);
  return { subject, html, text: toPlainText(html) };
}

export function InvitationEmail(details: ExchangeEmailDetails) {
  const meal = titleCase(details.mealType);
  return (
    <EmailLayout
      preview={`${details.hostName} invited you to ${meal} at ${details.location}`}
      eyebrow="Meal invitation"
      title="You’re invited to a meal exchange."
    >
      <Text style={paragraph}>Hi {details.counterpartName},</Text>
      <Text style={paragraph}>
        <strong>{details.hostName}</strong> invited you to {meal.toLowerCase()}{" "}
        at <strong>{details.location}</strong>. Review the details and accept
        the exchange before it expires.
      </Text>
      <ExchangeDetails {...details} />
      <Button href={details.detailUrl} style={primaryButton}>
        Review and accept
      </Button>
      <Text style={supportingText}>
        Sign in with the Princeton account that received this invitation.
      </Text>
    </EmailLayout>
  );
}

export function ConfirmationEmail(details: ExchangeEmailDetails) {
  if (!details.barcodeValue) return null;
  return (
    <EmailLayout
      preview={`Your ${details.mealType} exchange at ${details.location} is confirmed`}
      eyebrow="Exchange confirmed"
      title="Your door pass is ready."
    >
      <Text style={paragraph}>Hi {details.counterpartName},</Text>
      <Text style={paragraph}>
        Your meal exchange with <strong>{details.hostName}</strong> is
        confirmed. Keep this email ready to show at the door.
      </Text>
      <ExchangeDetails {...details} />
      <Section style={barcodeCard}>
        {/*details.barcodeImageSrc is for Test Email*/}
        <Img
          src={details.barcodeImageSrc ?? "cid:exchange-barcode"}
          alt={`Door barcode ${details.barcodeValue}`}
          style={barcodeImage}
        />
        <Text style={barcodeLabel}>Door code</Text>
        <Text style={barcodeValue}>{details.barcodeValue}</Text>
      </Section>
      <Text style={supportingText}>
        Show this barcode at the door. If it cannot be scanned, read the printed
        code above.
      </Text>
      <Button href={details.detailUrl} style={secondaryButton}>
        View details
      </Button>
    </EmailLayout>
  );
}

function EmailLayout({
  preview,
  eyebrow,
  title,
  children,
}: {
  preview: string;
  eyebrow: string;
  title: string;
  children: ReactNode;
}) {
  return (
    <Html lang="en">
      <Head />
      <Preview>{preview}</Preview>
      <Body style={body}>
        <Container style={outerContainer}>
          <Section style={brandHeader}>
            <Row>
              <Column style={brandTileColumn}>
                <Section style={brandTile}>
                  <Text style={brandTileText}>ME</Text>
                </Section>
              </Column>
              <Column>
                <Text style={brandName}>Meal Exchange</Text>
                <Text style={brandSubtitle}>Princeton Dining</Text>
              </Column>
            </Row>
          </Section>

          <Section style={card}>
            <Text style={eyebrowText}>{eyebrow}</Text>
            <Heading as="h1" style={heading}>
              {title}
            </Heading>
            {children}
          </Section>

          <Section style={footer}>
            <Text style={footerText}>
              Built by <strong>Hoagie Club</strong> for Princeton students.
            </Text>
          </Section>
        </Container>
      </Body>
    </Html>
  );
}

function ExchangeDetails(details: ExchangeEmailDetails) {
  return (
    <Section style={detailsCard}>
      <DetailRow label="Inviter" value={details.hostName} />
      <DetailRow label="Where" value={details.location} />
      <DetailRow label="Meal" value={titleCase(details.mealType)} />
      <DetailRow
        label="Date"
        value={mealDateFormatter.format(
          new Date(`${details.exchangeDate}T12:00:00Z`),
        )}
      />
      <DetailRow
        label="Expires"
        value={formatter.format(details.expiresAt)}
        last
      />
    </Section>
  );
}

function DetailRow({
  label,
  value,
  last = false,
}: {
  label: string;
  value: string;
  last?: boolean;
}) {
  return (
    <Section style={detailRow}>
      <Row>
        <Column style={detailLabelColumn}>
          <Text style={detailLabel}>{label}</Text>
        </Column>
        <Column>
          <Text style={detailValue}>{value}</Text>
        </Column>
      </Row>
      {!last ? <Hr style={detailRule} /> : null}
    </Section>
  );
}

function titleCase(value: string) {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

const colors = {
  background: "#efeae0",
  surface: "#fbf9f4",
  surface2: "#f2ede3",
  ink: "#211e18",
  ink2: "#544f47",
  ink3: "#6a655b",
  border: "#a39b8a",
  borderStrong: "#6a655b",
  orange: "#e77500",
  orangeEdge: "#b85c00",
};

const body = {
  margin: "0",
  backgroundColor: colors.background,
  color: colors.ink,
  fontFamily: 'Arial, "Helvetica Neue", sans-serif',
};
const outerContainer = {
  width: "100%",
  maxWidth: "620px",
  padding: "32px 16px",
};
const brandHeader = { padding: "0 4px 18px" };
const brandTileColumn = { width: "50px" };
const brandTile = {
  width: "42px",
  height: "42px",
  borderRadius: "9px",
  backgroundColor: colors.ink,
  textAlign: "center" as const,
};
const brandTileText = {
  margin: "0",
  padding: "12px 0 0",
  color: colors.orange,
  fontSize: "13px",
  fontWeight: "800",
  letterSpacing: "1px",
};
const brandName = {
  margin: "2px 0 0",
  color: colors.ink,
  fontSize: "16px",
  fontWeight: "700",
  lineHeight: "20px",
};
const brandSubtitle = {
  margin: "1px 0 0",
  color: colors.ink2,
  fontSize: "10px",
  fontWeight: "700",
  letterSpacing: "1px",
  lineHeight: "14px",
  textTransform: "uppercase" as const,
};
const card = {
  padding: "36px",
  backgroundColor: colors.surface,
  border: `1px solid ${colors.borderStrong}`,
  borderRadius: "10px",
};
const eyebrowText = {
  margin: "0 0 8px",
  color: colors.ink2,
  fontSize: "12px",
  fontWeight: "800",
  letterSpacing: "1.2px",
  lineHeight: "16px",
  textTransform: "uppercase" as const,
};
const heading = {
  margin: "0 0 22px",
  color: colors.ink,
  fontSize: "30px",
  fontWeight: "750",
  letterSpacing: "-0.4px",
  lineHeight: "35px",
};
const paragraph = {
  margin: "0 0 18px",
  color: colors.ink,
  fontSize: "16px",
  lineHeight: "25px",
};
const supportingText = {
  margin: "16px 0 0",
  color: colors.ink2,
  fontSize: "13px",
  lineHeight: "20px",
};
const detailsCard = {
  margin: "24px 0",
  padding: "4px 18px",
  backgroundColor: colors.surface2,
  border: `1px solid ${colors.border}`,
  borderRadius: "8px",
};
const detailRow = { margin: "0", padding: "11px 0 0" };
const detailLabelColumn = { width: "88px", verticalAlign: "top" as const };
const detailLabel = {
  margin: "0",
  color: colors.ink3,
  fontSize: "12px",
  fontWeight: "700",
  lineHeight: "20px",
};
const detailValue = {
  margin: "0",
  color: colors.ink,
  fontSize: "14px",
  fontWeight: "700",
  lineHeight: "20px",
};
const detailRule = { margin: "11px 0 0", borderColor: "#d8d1c4" };
const primaryButton = {
  display: "block",
  padding: "15px 20px",
  backgroundColor: colors.orange,
  border: `1px solid ${colors.orangeEdge}`,
  borderRadius: "7px",
  color: colors.ink,
  fontSize: "15px",
  fontWeight: "700",
  lineHeight: "20px",
  textAlign: "center" as const,
  textDecoration: "none",
};
const secondaryButton = {
  ...primaryButton,
  marginTop: "20px",
  backgroundColor: colors.surface,
  border: `1px solid ${colors.borderStrong}`,
};
const barcodeCard = {
  margin: "24px 0 0",
  padding: "22px 18px",
  backgroundColor: "#ffffff",
  border: `1px solid ${colors.borderStrong}`,
  borderRadius: "8px",
  textAlign: "center" as const,
};
const barcodeImage = {
  width: "100%",
  maxWidth: "460px",
  height: "auto",
  margin: "0 auto",
};
const barcodeLabel = {
  margin: "14px 0 2px",
  color: colors.ink3,
  fontSize: "10px",
  fontWeight: "800",
  letterSpacing: "1.2px",
  lineHeight: "14px",
  textTransform: "uppercase" as const,
};
const barcodeValue = {
  margin: "0",
  color: colors.ink,
  fontFamily: '"Courier New", monospace',
  fontSize: "18px",
  fontWeight: "700",
  letterSpacing: "1px",
  lineHeight: "24px",
};
const footer = { padding: "20px 12px 0", textAlign: "center" as const };
const footerText = {
  margin: "0",
  color: colors.ink2,
  fontSize: "12px",
  lineHeight: "18px",
};
