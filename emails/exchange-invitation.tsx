import {
  InvitationEmail,
  type ExchangeEmailDetails,
} from "../src/lib/exchange-emails";

const previewProps = {
  counterpartName: "Julian Park",
  hostName: "Maya Hernandez",
  location: "Cottage Club",
  mealType: "dinner",
  exchangeDate: "2030-05-10",
  expiresAt: new Date("2030-05-12T23:00:00.000Z"),
  detailUrl: "http://localhost:3000/exchanges/example-invitation-token",
} satisfies ExchangeEmailDetails;

export default function ExchangeInvitationPreview(
  props: Partial<ExchangeEmailDetails> = {},
) {
  return <InvitationEmail {...previewProps} {...props} />;
}

ExchangeInvitationPreview.PreviewProps = previewProps;
