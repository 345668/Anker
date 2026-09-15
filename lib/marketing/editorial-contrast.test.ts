import { readFileSync } from "node:fs";
import { expect, it } from "vitest";

const css = readFileSync(
  new URL("../../app/globals.css", import.meta.url),
  "utf8",
);
function tokens(selector: string) {
  const block = css.slice(css.indexOf(`${selector} {`)).split("}")[0];
  return Object.fromEntries(
    [...block.matchAll(/(--[\w-]+):\s*(#[\da-f]{6})/gi)].map((m) => [
      m[1],
      m[2],
    ]),
  );
}
function luminance(hex: string) {
  const rgb = [1, 3, 5]
    .map((i) => parseInt(hex.slice(i, i + 2), 16) / 255)
    .map((v) => (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  return rgb[0] * 0.2126 + rgb[1] * 0.7152 + rgb[2] * 0.0722;
}
function contrast(a: string, b: string) {
  const values = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (values[0] + 0.05) / (values[1] + 0.05);
}
for (const selector of [".marketing-site", ".dark .marketing-site"]) {
  it(`${selector} keeps text and focus distinguishable on editorial surfaces`, () => {
    const t = { ...tokens(".marketing-site"), ...tokens(selector) };
    for (const background of ["--background", "--muted", "--secondary"]) {
      for (const ink of [
        "--foreground",
        "--muted-foreground",
        "--editorial-link",
      ]) {
        expect(
          contrast(t[ink], t[background]),
          `${ink} on ${background}`,
        ).toBeGreaterThanOrEqual(4.5);
      }
      expect(contrast(t["--ring"], t[background])).toBeGreaterThanOrEqual(3);
    }
    for (const background of ["--primary", "--editorial-hover"]) {
      expect(
        contrast(t["--primary-foreground"], t[background]),
      ).toBeGreaterThanOrEqual(4.5);
    }
    expect(
      contrast(t["--editorial-inverse-muted"], t["--editorial-inverse"]),
    ).toBeGreaterThanOrEqual(4.5);
  });
}
