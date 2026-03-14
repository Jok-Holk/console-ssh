import type { APIRoute } from "astro";
import { writeFileSync, readFileSync } from "fs";
import { join } from "path";

export const prerender = false;

// GET /api/md?lang=vi — read current markdown file
export const GET: APIRoute = ({ url }) => {
  const lang = url.searchParams.get("lang") ?? "vi";

  if (!["vi", "en"].includes(lang)) {
    return new Response("Invalid lang", { status: 400 });
  }

  try {
    const filePath = join(
      process.cwd(),
      "public",
      "resumes",
      lang,
      `resume-${lang}.md`,
    );
    const content = readFileSync(filePath, "utf8");
    return new Response(JSON.stringify({ lang, content }), {
      headers: {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": process.env.VPS_MANAGER_URL ?? "*",
      },
    });
  } catch {
    return new Response("File not found", { status: 404 });
  }
};

// POST /api/md — body: { lang, content } — save markdown file
export const POST: APIRoute = async ({ request }) => {
  const { lang, content } = await request.json();

  if (!["vi", "en"].includes(lang)) {
    return new Response("Invalid lang", { status: 400 });
  }
  if (typeof content !== "string") {
    return new Response("Missing content", { status: 400 });
  }

  try {
    const filePath = join(
      process.cwd(),
      "public",
      "resumes",
      lang,
      `resume-${lang}.md`,
    );
    writeFileSync(filePath, content, "utf8");
    return new Response(JSON.stringify({ success: true }), {
      headers: {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": process.env.VPS_MANAGER_URL ?? "*",
      },
    });
  } catch (err) {
    return new Response(`Save failed: ${String(err)}`, { status: 500 });
  }
};
