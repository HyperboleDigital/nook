import type { RestyleEdit } from "@/types";

// Whole-room style presets (deferred as a primary guided goal; still used in Advanced).
export const THEMES = [
  { label: "Modern", desc: "modern contemporary style" },
  { label: "Scandinavian", desc: "Scandinavian style — light woods, neutral tones, cozy minimalism" },
  { label: "Mid-Century", desc: "mid-century modern — warm woods, retro furniture, clean lines" },
  { label: "Industrial", desc: "industrial — exposed materials, metal, leather, moody tones" },
  { label: "Coastal", desc: "coastal — airy, light blues and whites, natural textures" },
  { label: "Japandi", desc: "Japandi — warm minimal, natural materials" },
  { label: "Minimalist", desc: "minimalist — uncluttered, neutral palette, clean forms" },
  { label: "Luxe", desc: "luxury — high-end finishes, rich materials, statement pieces" },
];

export const ITEM_SUGGESTIONS: Record<string, string[]> = {
  seating: ["tan leather", "dark fabric", "lighter color", "sectional shape"],
  chair: ["different style", "leather", "lighter fabric", "matching the sofa"],
  console: ["low and wide floating", "darker wood tone", "light oak finish", "open shelving"],
  tv: ["larger screen", "wall-mounted, no stand", "sleeker thinner frame"],
  lamp: ["black metal finish", "brass finish", "taller and slimmer", "shorter with wide shade"],
  fixture: ["matte black", "brass/gold finish", "modern minimalist", "pendant replacement"],
  rug: ["solid neutral", "geometric pattern", "larger size", "lighter color"],
  curtains: ["linen sheer white", "blackout drapes", "floor-length neutral", "remove curtains"],
  bed: ["upholstered headboard", "wooden platform frame", "darker color", "lighter/white frame"],
  table: ["lower and wider", "round shape", "glass top", "marble top"],
  storage: ["dark stained", "white painted", "floating shelves", "taller unit"],
  cabinet: ["white painted", "dark navy", "natural wood tone", "open shelving"],
  "dining-table": ["round shape", "lighter wood", "darker stain", "marble top"],
  "dining-chair": ["upholstered seat", "metal legs", "matching set", "different style"],
  floor: ["lighter wood", "darker stained wood", "large format tile", "herringbone pattern"],
  wall: ["white painted", "dark accent wall", "exposed brick texture", "geometric wallpaper"],
};

export function normalizeToCategory(label: string): string {
  const l = label.toLowerCase();
  if (/sofa|couch|sectional/.test(l)) return "seating";
  if (/dining chair/.test(l)) return "dining-chair";
  if (/dining table/.test(l)) return "dining-table";
  if (/chair|armchair/.test(l)) return "chair";
  if (/tv stand|media console|console/.test(l)) return "console";
  if (/\btv\b|television/.test(l)) return "tv";
  if (/\blamp\b|floor lamp|table lamp/.test(l)) return "lamp";
  if (/ceiling fan|chandelier|pendant|light fixture/.test(l)) return "fixture";
  if (/\brug\b|carpet/.test(l)) return "rug";
  if (/curtain|drape/.test(l)) return "curtains";
  if (/\bbed\b|headboard/.test(l)) return "bed";
  if (/coffee table|side table|end table|nightstand/.test(l)) return "table";
  if (/bookshelf|bookcase/.test(l)) return "storage";
  if (/cabinet|kitchen cabinet/.test(l)) return "cabinet";
  if (/\bfloor\b/.test(l)) return "floor";
  if (/\bwall\b/.test(l)) return "wall";
  return "";
}

// Fixed/structural parts of a room. They can be restyled or swapped, but "removing"
// them to stage an empty room makes no sense — exclude from declutter removal.
const NON_REMOVABLE = /\b(wall|ceiling|floor|counter|countertop|backsplash|cabinet|cupboard|window|door|sink|fireplace|stair|column|beam|built[\s-]?in|molding|moulding|baseboard|island)\b/i;

export function isRemovable(label: string): boolean {
  return !NON_REMOVABLE.test(label);
}

export function editSummary(e: RestyleEdit): string {
  switch (e.kind) {
    case "item": return `${e.target_label ?? "Item"} → ${e.reference_url ? "photo ref" : e.instruction ?? "changed"}`;
    case "style": return `Style: ${e.instruction ?? ""}`.slice(0, 40);
    case "remove": return "Remove all furniture";
    case "add": return `Add: ${e.target_label ?? "item"}`;
    default: return e.instruction ?? "Refinement";
  }
}

// ── Light-theme style helpers (match the app shell) ──
export const card = "bg-[var(--card)] border border-[var(--border)] rounded-xl";
export const inp = "w-full bg-white border border-[var(--border)] rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-900/10 placeholder:text-slate-400";
export const sectionLabel = "text-[11px] font-semibold uppercase tracking-wide text-[var(--muted-foreground)]";
export const stageBtn = "w-full bg-[var(--primary)] text-[var(--primary-foreground)] py-2 rounded-lg text-xs font-medium disabled:opacity-30 hover:opacity-90 transition-opacity";
export const ghostExpand = "text-xs px-2.5 py-1.5 rounded-lg border border-dashed border-[var(--border)] text-[var(--muted-foreground)] hover:border-slate-400 hover:text-slate-700 transition-colors w-full text-left";

export const chip = (active: boolean) =>
  `text-xs px-2.5 py-1 rounded-full border transition-colors capitalize ${
    active
      ? "bg-[var(--primary)] text-[var(--primary-foreground)] border-[var(--primary)] font-medium"
      : "border-[var(--border)] text-[var(--muted-foreground)] hover:border-slate-400 hover:text-slate-700"
  }`;
