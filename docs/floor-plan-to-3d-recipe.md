# Floor Plan → 3D Dollhouse Recipe (plan-based, most accurate)

This is the **most accurate** way to produce a furnished 3D dollhouse for a Nook tour:
build it from a real **2D floor plan** in a CAD interior-design tool, style it to match the
client's render, export a **GLB**, and upload it through Nook's **Upload 3D Model** flow.

> **Why this beats an object-generator (Meshy/Rodin/Tripo):** those reconstruct a model by
> *guessing* from a single image, so geometry is approximate and blobby. A CAD tool builds
> from the actual floor-plan geometry — correct walls, proportions, and room layout. Use the
> object-generator path only when the client has a **render but no 2D plan** (see bottom).

---

## Inputs

- **Required:** a 2D floor plan (the top-down line drawing with walls/rooms; dimensions help).
- **Optional but valuable:** a 3D render of the unit. This is your **look-&-feel reference** —
  the correct furniture, floor color, and finishes. Keep it open side-by-side while you style.
  (The render is a *reference you match to by eye* — no tool ingests it as a direct input.)

---

## Path A — Coohom (primary)

Coohom has the largest real-brand furniture/material libraries and exports GLB.

1. **Create a free account** at [coohom.com](https://www.coohom.com) → start a new project → Floorplan.
2. **Upload the 2D plan.** Use auto / AI wall-detection to trace the walls (or trace manually).
3. **Set the scale.** Enter one known real dimension (e.g. a wall length or the stated sq ft) so
   proportions come out correct. *Skipping this is the #1 cause of a warped dollhouse.*
4. **Set ceiling height** and place **doors and windows** where the plan shows them.
5. **Furnish each room** to match the render — same furniture types and rough layout
   (bed/nightstands in the bedroom, sofa/coffee table in the living room, etc.).
6. **Apply materials** to match the render: floor tone (wood/tile), wall paint/finish, counters.
7. **Preview in 3D** and compare against the render until the look & feel matches.
8. **Export the model as GLB.**
   ⚠️ GLB/model export may require a paid Coohom tier — check before relying on it.
9. **Upload to Nook:** go to **Upload 3D Model**, drop the GLB, give it a title → the dollhouse
   tour is created instantly and gets a shareable link.

---

## Path B — Planner 5D (alternative)

Same shape, simpler libraries, built-in walkthroughs.

1. Free account at [planner5d.com](https://planner5d.com) → new project.
2. Upload/import the 2D plan → auto-furnish, or place rooms and furniture yourself.
3. Set scale, ceiling height, doors/windows.
4. Style furniture + materials to match the render.
5. Export the 3D model as **GLB** (check whether export is gated behind a paid tier).
6. Upload to Nook via **Upload 3D Model**.

---

## Caveats & honest limits

- **GLB export is sometimes a paid feature** on these platforms — confirm your plan tier.
- **Furniture/material matching is manual.** That hands-on step is exactly *why* the result is
  accurate; there is no one-click "match this render" button.
- **Always set the scale.** Without it the geometry is proportionally wrong.
- **No single AI tool** takes "2D plan as geometry + render as style" and auto-outputs a styled
  dollhouse. The plan drives geometry; you match the render by eye using the tool's library.

---

## Fallback — render only, no 2D plan

If the client has *only* a render (no plan), skip the CAD tools and use an **object-generator**:

1. Run the render through **Meshy**, **Rodin Gen-2** (best fidelity), or **Tripo** (fast). All have
   free tiers; **Rodin** generally gives the cleanest result.
2. Export **GLB** → upload to Nook via **Upload 3D Model**.

This preserves the render's look but the geometry is approximate (a single-view dollhouse —
great to orbit, not a true eye-level walk-through). A true walk-through is the Scaniverse
Gaussian-splat path, not this one.
