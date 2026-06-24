import { html, css, js } from "@playcanvas/supersplat-viewer";
import { NextResponse } from "next/server";

// Serves the SuperSplat viewer as a full HTML page.
// The caller embeds this in an iframe with ?content=<ply_url>
export async function GET() {
  // Inject CSS and JS inline to make the page fully self-contained
  const page = (html as string)
    .replace('<link rel="stylesheet" href="index.css">', `<style>${css}</style>`)
    .replace('<script type="module" src="index.js"></script>', `<script type="module">${js}</script>`);

  return new NextResponse(page, {
    headers: { "Content-Type": "text/html; charset=utf-8" },
  });
}
