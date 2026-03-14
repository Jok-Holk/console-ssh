import type { APIRoute } from "astro";
import { readFileSync } from "fs";
import { join } from "path";
import { marked } from "marked";

export const prerender = false;

// GET /api/render?lang=vi&md=<optional_override>
// Returns full HTML page (CV preview) rendered from markdown
export const GET: APIRoute = async ({ url }) => {
  const lang = url.searchParams.get("lang") ?? "vi";
  const mdOverride = url.searchParams.get("md");

  if (!["vi", "en"].includes(lang)) {
    return new Response("Invalid lang. Use vi or en.", { status: 400 });
  }

  let mdContent: string;

  if (mdOverride) {
    // Live preview — use markdown sent from editor
    mdContent = decodeURIComponent(mdOverride);
  } else {
    // Serve saved file
    try {
      const filePath = join(
        process.cwd(),
        "public",
        "resumes",
        lang,
        `resume-${lang}.md`,
      );
      mdContent = readFileSync(filePath, "utf8");
    } catch {
      return new Response(`Resume file not found for lang: ${lang}`, {
        status: 404,
      });
    }
  }

  // Read CSS
  let css = "";
  try {
    const cssPath = join(process.cwd(), "public", "resumes", "styles.css");
    css = readFileSync(cssPath, "utf8");
  } catch {}

  const body = await marked.parse(mdContent);

  const html = `<!DOCTYPE html>
<html lang="${lang}">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>CV Preview — ${lang.toUpperCase()}</title>
  <style>
${css}
  </style>
</head>
<body>
${body}
</body>
</html>`;

  return new Response(html, {
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      // Allow VPS Manager to iframe this
      "X-Frame-Options": "SAMEORIGIN",
      "Access-Control-Allow-Origin": process.env.VPS_MANAGER_URL ?? "*",
    },
  });
};

// POST /api/render — body: { lang, md }
// Used by live editor to preview without URL length limits
export const POST: APIRoute = async ({ request }) => {
  const { lang = "vi", md } = await request.json();

  if (!["vi", "en"].includes(lang)) {
    return new Response("Invalid lang", { status: 400 });
  }
  if (!md) return new Response("Missing md", { status: 400 });

  let css = "";
  try {
    const cssPath = join(process.cwd(), "public", "resumes", "styles.css");
    css = readFileSync(cssPath, "utf8");
  } catch {}

  const body = await marked.parse(md);

  const html = `<!DOCTYPE html>
<html lang="${lang}">
<head>
  <meta charset="UTF-8" />
  <title>CV — ${lang.toUpperCase()}</title>
  <style>${css}</style>
</head>
<body>
${body}
</body>
</html>`;

  return new Response(html, {
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Access-Control-Allow-Origin": process.env.VPS_MANAGER_URL ?? "*",
    },
  });
};
