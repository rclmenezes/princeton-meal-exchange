import { describe, expect, it } from "vitest";
import {
  createConfirmationEmail,
  createInvitationEmail,
} from "./exchange-emails";

const details = {
  counterpartName: "Julian <Park>",
  hostName: "Maya Hernandez",
  location: "Cottage & Club",
  mealType: "dinner" as const,
  expiresAt: new Date("2030-05-12T23:00:00.000Z"),
  detailUrl: "https://example.test/exchanges/token",
  barcodeValue: "ME-ABCD-EFGH-JKLM",
};

describe("exchange emails", () => {
  it("creates an invitation with the review link and no barcode", async () => {
    const email = await createInvitationEmail(details);
    expect(email.text).toContain(details.detailUrl);
    expect(email.text).not.toContain(details.barcodeValue);
    expect(email.html).toContain("Julian &lt;Park&gt;");
    expect(email.html).toContain("Cottage &amp; Club");
  });

  it("uses the same barcode in confirmation text, HTML, and image alt text", async () => {
    const email = await createConfirmationEmail(details);
    expect(email.text).toContain(details.barcodeValue);
    expect(email.html).toContain(details.barcodeValue);
    expect(email.html).toContain('src="cid:exchange-barcode"');
  });

  it("requires a barcode for confirmation", async () => {
    await expect(
      createConfirmationEmail({ ...details, barcodeValue: undefined }),
    ).rejects.toThrow("A barcode value is required");
  });

  it("includes the Hoagie Club Princeton footer in both templates", async () => {
    const [invitation, confirmation] = await Promise.all([
      createInvitationEmail(details),
      createConfirmationEmail(details),
    ]);
    expect(invitation.text).toContain(
      "Built by Hoagie Club for Princeton students.",
    );
    expect(confirmation.text).toContain(
      "Built by Hoagie Club for Princeton students.",
    );
    expect(invitation.text).not.toContain("A simpler way");
    expect(confirmation.text).not.toContain("A simpler way");
  });
});
