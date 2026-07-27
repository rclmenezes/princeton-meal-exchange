import bwipjs from "bwip-js/node";

const barcodeOptions = (text: string) => ({
  bcid: "code128" as const,
  text,
  scale: 3,
  height: 16,
  includetext: false,
  backgroundcolor: "FBF9F4",
  barcolor: "211E18",
  paddingwidth: 8,
  paddingheight: 8,
});

export function createBarcodeSvg(text: string) {
  return bwipjs.toSVG(barcodeOptions(text));
}

export function createBarcodePng(text: string) {
  return bwipjs.toBuffer(barcodeOptions(text));
}
