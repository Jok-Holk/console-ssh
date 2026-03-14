import type { APIRoute } from "astro";
import { readFileSync } from "fs";
import { join } from "path";
import { marked } from "marked";

export const prerender = false;

function loadCss(): string {
  try {
    const cssPath = join(process.cwd(), "public", "resumes", "styles.css");
    let css = readFileSync(cssPath, "utf8");

    // Embed font as base64 so it loads correctly in both iframe preview and Puppeteer
    try {
      const fontPath = join(process.cwd(), "public", "fonts", "times.ttf");
      const fontBase64 = readFileSync(fontPath).toString("base64");
      css = css.replace(
        /src:\s*url\(['"]?fonts\/times\.ttf['"]?\)[^;]*/,
        `src: url('data:font/truetype;base64,${fontBase64}') format('truetype')`,
      );
    } catch {}

    return css;
  } catch {
    return "";
  }
}

function buildHtml(
  lang: string,
  body: string,
  css: string,
  title: string,
): string {
  return `<!DOCTYPE html>
<html lang="${lang}">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${title}</title>
  <style>${css}</style>
</head>
<body>${body}</body>
</html>`;
}

// GET /api/render?lang=vi
export const GET: APIRoute = async ({ url }) => {
  const lang = url.searchParams.get("lang") ?? "vi";

  if (!["vi", "en"].includes(lang)) {
    return new Response("Invalid lang. Use vi or en.", { status: 400 });
  }

  let mdContent: string;
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

  const css = loadCss();
  const body = await marked.parse(mdContent);
  const html = buildHtml(lang, body, css, `CV Preview — ${lang.toUpperCase()}`);

  return new Response(html, {
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Access-Control-Allow-Origin": process.env.VPS_MANAGER_URL ?? "*",
    },
  });
};

// POST /api/render — body: { lang, md, css? }
// Live preview from editor — css override replaces styles.css
export const POST: APIRoute = async ({ request }) => {
  const { lang = "vi", md, css: cssOverride } = await request.json();

  if (!["vi", "en"].includes(lang)) {
    return new Response("Invalid lang", { status: 400 });
  }
  if (!md) return new Response("Missing md", { status: 400 });

  // Use provided CSS override, or fall back to saved styles.css
  const css = cssOverride !== undefined ? cssOverride : loadCss();
  const body = await marked.parse(md);
  const html = buildHtml(lang, body, css, `CV — ${lang.toUpperCase()}`);

  return new Response(html, {
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Access-Control-Allow-Origin": process.env.VPS_MANAGER_URL ?? "*",
    },
  });
};
