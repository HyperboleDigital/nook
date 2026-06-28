import { html, css, js } from "@playcanvas/supersplat-viewer";
import { NextResponse } from "next/server";

// Serves the SuperSplat *viewer* (clean look-around, not the editor) as a
// self-contained page. The caller embeds it in an iframe:
//   /viewer?content=<ply_url>&settings=<inline json>&webgl&noui
//
// The packaged HTML references two sibling files with RELATIVE paths:
//   <link rel="stylesheet" href="./index.css">
//   <script type="module"> import { main } from './index.js'; ... </script>
// On this route those resolve to /index.css and /index.js, which 404 — so the
// viewer never boots (blank screen / endless spinner). We fix that by:
//   - inlining the CSS (it has no external url() refs, all icons are data URIs)
//   - serving the 3 MB JS bundle from /viewer?asset=js and rewriting the import
//     to point at it (the bundle has no import.meta.url asset resolution and
//     creates its workers via blob URLs, so it runs fine when served standalone)
export async function GET(req: Request) {
  const url = new URL(req.url);
  const asset = url.searchParams.get("asset");

  if (asset === "js") {
    return new NextResponse(js as string, {
      headers: {
        "Content-Type": "text/javascript; charset=utf-8",
        "Cache-Control": "public, max-age=31536000, immutable",
      },
    });
  }

  const page = (html as string)
    .replace(
      '<link rel="stylesheet" href="./index.css">',
      `<style>${css}</style>`
    )
    .replace("'./index.js'", "'/viewer?asset=js'");

  return new NextResponse(page, {
    headers: { "Content-Type": "text/html; charset=utf-8" },
  });
}
