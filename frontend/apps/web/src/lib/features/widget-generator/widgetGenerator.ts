export type Theme = "light" | "dark";

export type ColorKey = "headerBg" | "headerText" | "bodyBg" | "bodyText";

/**
 * Två förinställda teman som känns “Eneo-ish”:
 * - Light: ren header + mjuk ljus body
 * - Dark: djup mörk ton med bra kontrast (inte kolsvart)
 */
export const LIGHT_PRESET: Record<ColorKey, string> = {
  headerBg: "#F1F5F9", // slate-100
  headerText: "#0F172A", // slate-900
  bodyBg: "#F8FAFC", // slate-50
  bodyText: "#0F172A"
};

export const DARK_PRESET: Record<ColorKey, string> = {
  headerBg: "#0B1220", // djup blåsvart
  headerText: "#E5E7EB", // gray-200
  bodyBg: "#070B14", // ännu mörkare
  bodyText: "#E5E7EB"
};

export const colorInputIds: Record<ColorKey, string> = {
  headerBg: "widget-color-headerBg",
  headerText: "widget-color-headerText",
  bodyBg: "widget-color-bodyBg",
  bodyText: "widget-color-bodyText"
};

/**
 * Normaliserar hex:
 * - accepterar "fff" eller "#fff" -> "#ffffff"
 * - accepterar "#ffffff"
 * - fallback: returnerar originalvärde om det inte går att normalisera
 */
export function normalizeHex(value: string): string {
  const v = (value ?? "").trim();

  // matcha 3 eller 6 hex (med eller utan #)
  const m = v.match(/^#?([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/);
  if (!m) return v;

  let hex = m[1].toLowerCase();
  if (hex.length === 3) {
    hex = hex
      .split("")
      .map((c) => c + c)
      .join("");
  }
  return `#${hex}`;
}
