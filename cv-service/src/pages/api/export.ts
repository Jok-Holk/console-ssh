import type { APIRoute } from "astro";
import { readFileSync, existsSync } from "fs";
import { join } from "path";
import { marked } from "marked";

export const prerender = false;

function getChromiumPath(): string {
  const candidates = [
    process.env.CHROMIUM_PATH ?? "",
    "/usr/bin/google-chrome-stable",
    "/usr/bin/google-chrome",
    "/usr/bin/chromium",
  ];
  for (const p of candidates) {
    if (p && existsSync(p)) return p;
  }
  throw new Error(
    "Chrome not found. Install with: apt install google-chrome-stable",
  );
}

async function mdToPdf(
  md: string,
  lang: string,
  cssOverride?: string,
): Promise<ArrayBuffer> {
  const puppeteer = await import("puppeteer-core");

  let css = cssOverride ?? "";
  if (!css) {
    try {
      const cssPath = join(process.cwd(), "public", "resumes", "styles.css");
      css = readFileSync(cssPath, "utf8");
    } catch {}
  }

  let fontBase64 = "";
  try {
    const fontPath = join(process.cwd(), "public", "fonts", "times.ttf");
    fontBase64 = readFileSync(fontPath).toString("base64");
  } catch {}

  if (fontBase64) {
    css = css.replace(
      /src:\s*url\(['"]?fonts\/times\.ttf['"]?\)[^;]*/,
      `src: url('data:font/truetype;base64,${fontBase64}') format('truetype')`,
    );
  }

  const body = await marked.parse(md);
  const html = `<!DOCTYPE html>
<html lang="${lang}">
<head><meta charset="UTF-8" /><style>${css}</style></head>
<body>${body}</body>
</html>`;

  const browser = await puppeteer.default.launch({
    executablePath: getChromiumPath(),
    args: [
      "--no-sandbox",
      "--disable-setuid-sandbox",
      "--disable-dev-shm-usage",
      "--disable-gpu",
      "--font-render-hinting=none",
    ],
    headless: true,
  });

  try {
    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: "networkidle0" });
    await page.evaluateHandle("document.fonts.ready");
    const pdf = await page.pdf({
      format: "A4",
      margin: { top: "1.3cm", bottom: "1.3cm", left: "1.5cm", right: "1.5cm" },
      printBackground: true,
    });
    return pdf.buffer as ArrayBuffer;
  } finally {
    await browser.close();
  }
}

// GET /api/export?lang=vi — always regenerate from MD
export const GET: APIRoute = async ({ url }) => {
  const lang = url.searchParams.get("lang") ?? "vi";
  const regen = url.searchParams.get("regen") !== "0";
  if (!["vi", "en"].includes(lang))
    return new Response("Invalid lang", { status: 400 });

  try {
    let pdfBuffer: ArrayBuffer;
    if (regen) {
      const md = readFileSync(
        join(process.cwd(), "public", "resumes", lang, `resume-${lang}.md`),
        "utf8",
      );
      pdfBuffer = await mdToPdf(md, lang);
    } else {
      const buf = readFileSync(
        join(process.cwd(), "public", "resumes", lang, `resume-${lang}.pdf`),
      );
      pdfBuffer = buf.buffer.slice(
        buf.byteOffset,
        buf.byteOffset + buf.byteLength,
      ) as ArrayBuffer;
    }
    return new Response(pdfBuffer, {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="resume-${lang}.pdf"`,
        "Access-Control-Allow-Origin": process.env.VPS_MANAGER_URL ?? "*",
      },
    });
  } catch (err) {
    return new Response(`Export failed: ${String(err)}`, { status: 500 });
  }
};

// POST /api/export — body: { lang, md, css? }
export const POST: APIRoute = async ({ request }) => {
  const { lang = "vi", md, css: cssOverride } = await request.json();
  if (!["vi", "en"].includes(lang))
    return new Response("Invalid lang", { status: 400 });
  if (!md) return new Response("Missing md content", { status: 400 });

  try {
    const pdfBuffer = await mdToPdf(md, lang, cssOverride);
    return new Response(pdfBuffer, {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="resume-${lang}.pdf"`,
        "Access-Control-Allow-Origin": process.env.VPS_MANAGER_URL ?? "*",
      },
    });
  } catch (err) {
    return new Response(`Export failed: ${String(err)}`, { status: 500 });
  }
};
