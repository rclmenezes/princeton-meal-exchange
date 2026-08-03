import {
  ConfirmationEmail,
  type ExchangeEmailDetails,
} from "../src/lib/exchange-emails";
import { createBarcodeSvg } from "../src/lib/barcode";

const previewProps = {
  counterpartName: "Julian Park",
  hostName: "Maya Hernandez",
  location: "Cottage Club",
  mealType: "dinner",
  exchangeDate: "2030-05-10",
  expiresAt: new Date("2030-05-12T23:00:00.000Z"),
  detailUrl: "http://localhost:3000/exchanges/example-invitation-token",
  barcodeValue: "ME-ABCD-EFGH-JKLM",
} satisfies ExchangeEmailDetails;

export default function ExchangeConfirmationPreview(
  props: Partial<ExchangeEmailDetails> = {},
) {
  const details = { ...previewProps, ...props };
  const barcodeValue = details.barcodeValue ?? previewProps.barcodeValue;
  const barcodeSvg = createBarcodeSvg(barcodeValue);
  return (
    <ConfirmationEmail
      {...details}
      barcodeValue={barcodeValue}
      barcodeImageSrc={`data:image/svg+xml;charset=utf-8,${encodeURIComponent(barcodeSvg)}`}
    />
  );
}

ExchangeConfirmationPreview.PreviewProps = previewProps;
