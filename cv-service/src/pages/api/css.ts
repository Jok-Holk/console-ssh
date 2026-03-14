import type { APIRoute } from "astro";
import { writeFileSync, readFileSync } from "fs";
import { join } from "path";

export const prerender = false;

// GET /api/css — read styles.css
export const GET: APIRoute = () => {
  try {
    const filePath = join(process.cwd(), "public", "resumes", "styles.css");
    const content = readFileSync(filePath, "utf8");
    return new Response(JSON.stringify({ content }), {
      headers: {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": process.env.VPS_MANAGER_URL ?? "*",
      },
    });
  } catch {
    return new Response("styles.css not found", { status: 404 });
  }
};

// POST /api/css — save styles.css
export const POST: APIRoute = async ({ request }) => {
  const { content } = await request.json();
  if (typeof content !== "string") {
    return new Response("Missing content", { status: 400 });
  }
  try {
    const filePath = join(process.cwd(), "public", "resumes", "styles.css");
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
