import type { APIRoute } from "astro";
import { readFileSync, existsSync } from "fs";
import { join } from "path";
import { marked } from "marked";

export const prerender = false;

// Lazily resolve Chromium path — works on Ubuntu VPS
function getChromiumPath(): string {
  const candidates = [
    "/usr/bin/chromium-browser",
    "/usr/bin/chromium",
    "/usr/bin/google-chrome-stable",
    "/usr/bin/google-chrome",
    process.env.CHROMIUM_PATH ?? "",
  ];
  for (const p of candidates) {
    if (p && existsSync(p)) return p;
  }
  throw new Error(
    "Chromium not found. Install with: apt install chromium-browser",
  );
}

async function mdToPdf(md: string, lang: string): Promise<ArrayBuffer> {
  // Dynamic import — puppeteer-core is heavy
  const puppeteer = await import("puppeteer-core");

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
  <style>${css}</style>
</head>
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

    // Wait for fonts to load
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

// GET /api/export?lang=vi — download saved PDF
// GET /api/export?lang=vi&regen=1 — regenerate from saved MD then download
export const GET: APIRoute = async ({ url }) => {
  const lang = url.searchParams.get("lang") ?? "vi";
  const regen = url.searchParams.get("regen") === "1";

  if (!["vi", "en"].includes(lang)) {
    return new Response("Invalid lang", { status: 400 });
  }

  try {
    let pdfBuffer: ArrayBuffer;

    if (regen) {
      const mdPath = join(
        process.cwd(),
        "public",
        "resumes",
        lang,
        `resume-${lang}.md`,
      );
      const md = readFileSync(mdPath, "utf8");
      pdfBuffer = await mdToPdf(md, lang);
    } else {
      const pdfPath = join(
        process.cwd(),
        "public",
        "resumes",
        lang,
        `resume-${lang}.pdf`,
      );
      const buf = readFileSync(pdfPath);
      pdfBuffer = buf.buffer.slice(
        buf.byteOffset,
        buf.byteOffset + buf.byteLength,
      ) as ArrayBuffer;
    }

    const filename =
      lang === "vi" ? "CV_PhucThai_VI.pdf" : "CV_PhucThai_EN.pdf";

    return new Response(pdfBuffer, {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Access-Control-Allow-Origin": process.env.VPS_MANAGER_URL ?? "*",
      },
    });
  } catch (err) {
    return new Response(`Export failed: ${String(err)}`, { status: 500 });
  }
};

// POST /api/export — body: { lang, md }
// Export PDF from custom markdown (live editor export)
export const POST: APIRoute = async ({ request }) => {
  const { lang = "vi", md } = await request.json();

  if (!["vi", "en"].includes(lang)) {
    return new Response("Invalid lang", { status: 400 });
  }
  if (!md) return new Response("Missing md content", { status: 400 });

  try {
    const pdfBuffer = await mdToPdf(md, lang);
    const filename =
      lang === "vi" ? "CV_PhucThai_VI.pdf" : "CV_PhucThai_EN.pdf";

    return new Response(pdfBuffer, {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Access-Control-Allow-Origin": process.env.VPS_MANAGER_URL ?? "*",
      },
    });
  } catch (err) {
    return new Response(`Export failed: ${String(err)}`, { status: 500 });
  }
};
