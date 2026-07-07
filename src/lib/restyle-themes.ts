// Curated interior-design styles for "Stage this room" (GenerateBar's ⋯ menu). Each pairs a
// short picker-card description with a furnish/add-oriented `stagingInstruction` — NOT a
// "restyle existing furniture" instruction. Staging always composes this alongside a whole-room
// `kind:"remove"` edit (target_label: null) in the SAME composeEdits call (see gemini.ts's
// `case "style"` + `case "remove"`), so Gemini must understand new furniture should APPEAR in
// the now-empty room, not that the (empty) room should just be recolored.
//
// Deliberately a separate type from gemini.ts's `RestyleTheme` (used only by the unused,
// untouched `restyleRoom()`/`THEME_DESC`, which assumes existing furniture being restyled in
// place — the wrong framing here) — same-sounding names with different meanings is a footgun.
export type RestyleThemeKey =
  | "modern"
  | "scandinavian"
  | "mid-century"
  | "industrial"
  | "coastal"
  | "japandi"
  | "minimalist"
  | "luxe";

export interface RestyleThemeDef {
  key: RestyleThemeKey;
  /** Picker card title. */
  label: string;
  /** One-line picker card description. */
  blurb: string;
  /** Becomes the whole-room "style" edit's `instruction` — composed with a whole-room "remove"
   *  edit into one Gemini call, so this must read as "add new furniture in this style". */
  stagingInstruction: string;
}

export const RESTYLE_THEMES: Record<RestyleThemeKey, RestyleThemeDef> = {
  modern: {
    key: "modern",
    label: "Modern",
    blurb: "Clean lines, neutral palette, a few bold accents.",
    stagingInstruction:
      "Furnish and decorate this now-empty room in a modern contemporary style — add " +
      "appropriate furniture, a rug, lighting, and decor for this room's type. Favor clean-lined " +
      "furniture, a neutral base palette (white, grey, warm wood) with one or two bold accent " +
      "colors, minimal ornamentation, and a few statement pieces rather than clutter.",
  },
  scandinavian: {
    key: "scandinavian",
    label: "Scandinavian",
    blurb: "Light woods, soft neutrals, cozy minimalism.",
    stagingInstruction:
      "Furnish and decorate this now-empty room in a Scandinavian style — add appropriate " +
      "furniture, a rug, lighting, and decor for this room's type. Favor light woods, soft " +
      "neutral and off-white tones, simple functional furniture forms, natural textiles (wool, " +
      "linen), and a few cozy layered textures (throws, woven baskets) without clutter.",
  },
  "mid-century": {
    key: "mid-century",
    label: "Mid-Century Modern",
    blurb: "Warm woods, retro silhouettes, tapered legs.",
    stagingInstruction:
      "Furnish and decorate this now-empty room in a mid-century modern style — add appropriate " +
      "furniture, a rug, lighting, and decor for this room's type. Favor warm walnut/teak wood " +
      "tones, tapered furniture legs, retro-inflected silhouettes, mustard/burnt-orange/olive " +
      "accent colors, and simple geometric decor.",
  },
  industrial: {
    key: "industrial",
    label: "Industrial",
    blurb: "Exposed materials, metal and leather, moody tones.",
    stagingInstruction:
      "Furnish and decorate this now-empty room in an industrial style — add appropriate " +
      "furniture, a rug, lighting, and decor for this room's type. Favor raw/exposed materials " +
      "(metal, reclaimed wood, leather), dark and moody color tones, black metal fixtures, and " +
      "utilitarian furniture forms.",
  },
  coastal: {
    key: "coastal",
    label: "Coastal",
    blurb: "Airy light blues and whites, natural textures.",
    stagingInstruction:
      "Furnish and decorate this now-empty room in a coastal style — add appropriate furniture, " +
      "a rug, lighting, and decor for this room's type. Favor an airy, light palette of whites " +
      "and soft blues, natural woven textures (rattan, jute, linen), whitewashed or light wood " +
      "furniture, and a relaxed, breezy feel with plenty of natural light.",
  },
  japandi: {
    key: "japandi",
    label: "Japandi",
    blurb: "Japanese-Scandinavian, warm minimal, natural materials.",
    stagingInstruction:
      "Furnish and decorate this now-empty room in a Japandi (Japanese-Scandinavian) style — " +
      "add appropriate furniture, a rug, lighting, and decor for this room's type. Favor low-" +
      "profile furniture, warm neutral and earthy tones, natural materials (light wood, stone, " +
      "linen), clean uncluttered lines, and a calm, intentional feel with minimal decor.",
  },
  minimalist: {
    key: "minimalist",
    label: "Minimalist",
    blurb: "Uncluttered, neutral palette, clean simple forms.",
    stagingInstruction:
      "Furnish and decorate this now-empty room in a minimalist style — add only the essential " +
      "appropriate furniture and lighting for this room's type, kept deliberately sparse. Favor " +
      "a neutral monochrome palette, clean simple furniture forms with no ornamentation, and an " +
      "open, uncluttered feel — every piece should feel necessary, nothing decorative for its " +
      "own sake.",
  },
  luxe: {
    key: "luxe",
    label: "Luxe",
    blurb: "High-end finishes, rich materials, elegant statement pieces.",
    stagingInstruction:
      "Furnish and decorate this now-empty room in a luxe style — add appropriate furniture, a " +
      "rug, lighting, and decor for this room's type. Favor high-end finishes (marble, brass, " +
      "velvet), rich jewel-toned or deep neutral colors, elegant statement furniture pieces, and " +
      "polished, well-appointed styling throughout.",
  },
};
