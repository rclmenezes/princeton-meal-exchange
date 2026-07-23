import { describe, expect, it } from "vitest";
import { createBarcodePng, createBarcodeSvg } from "./barcode";

describe("barcode rendering", () => {
  it("renders a Code 128 SVG", () => {
    const svg = createBarcodeSvg("ME-ABCD-EFGH-JKLM");
    expect(svg).toContain("<svg");
    expect(svg).toContain("viewBox");
  });

  it("renders a PNG for the confirmation email", async () => {
    const png = await createBarcodePng("ME-ABCD-EFGH-JKLM");
    expect(png.subarray(0, 8).toString("hex")).toBe("89504e470d0a1a0a");
  });
});
