import { NextRequest } from "next/server";
import { execSync as exec } from "child_process";
import jwt from "jsonwebtoken";

function authCheck(request: NextRequest): boolean {
  const token = request.cookies.get("authToken")?.value;
  if (!token) return false;
  try {
    jwt.verify(token, process.env.JWT_SECRET!);
    return true;
  } catch {
    return false;
  }
}

// Run a shell command and return stdout+stderr combined
function run(cmd: string, cwd: string): string {
  try {
    return exec(cmd, { cwd, encoding: "utf8", timeout: 120000, stdio: "pipe" });
  } catch (e: unknown) {
    if (e && typeof e === "object" && "stdout" in e) {
      const err = e as { stdout?: string; stderr?: string };
      return (err.stdout ?? "") + (err.stderr ?? "");
    }
    return String(e);
  }
}

const APP_DIR = process.env.APP_DIR ?? "/root/console-ssh";
const PM2_NAME = process.env.PM2_APP_NAME ?? "console-ssh";

// GET — check git status: any remote changes?
export async function GET(request: NextRequest) {
  if (!authCheck(request))
    return Response.json({ error: "Unauthorized" }, { status: 401 });

  const fetch = run("git fetch origin", APP_DIR);
  const status = run("git status -sb", APP_DIR);
  const log = run("git log HEAD..origin/main --oneline", APP_DIR);
  const current = run("git log -1 --format='%h %s %cr'", APP_DIR).trim();

  const hasUpdates = log.trim().length > 0;

  return Response.json({
    hasUpdates,
    current,
    pending: log.trim() ? log.trim().split("\n") : [],
    status: status.trim(),
    fetchLog: fetch.trim(),
  });
}

// POST — run full deploy: git pull → npm build → pm2 reload
export async function POST(request: NextRequest) {
  if (!authCheck(request))
    return Response.json({ error: "Unauthorized" }, { status: 401 });

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    start(controller) {
      let closed = false;

      const send = (event: string, data: object) => {
        if (closed) return;
        try {
          controller.enqueue(
            encoder.encode(
              `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`,
            ),
          );
        } catch {
          closed = true;
        }
      };

      // Run deploy steps async — SSE streams each step result live
      (async () => {
        send("step", { step: "git pull", status: "running" });
        const pull = run("git pull origin main", APP_DIR);
        send("step", { step: "git pull", status: "done", output: pull.trim() });

        if (pull.includes("Already up to date")) {
          send("step", {
            step: "build",
            status: "skipped",
            output: "No changes — skipping build.",
          });
          send("done", { success: true, message: "Already up to date." });
          if (!closed) {
            try {
              controller.close();
            } catch {}
          }
          return;
        }

        send("step", { step: "npm build", status: "running" });
        const build = run("npm run build", APP_DIR);
        send("step", {
          step: "npm build",
          status: "done",
          output: build.trim(),
        });

        // pm2 reload for zero-downtime (graceful restart)
        send("step", { step: "pm2 reload", status: "running" });
        const reload = run(`pm2 reload ${PM2_NAME} --update-env`, APP_DIR);
        send("step", {
          step: "pm2 reload",
          status: "done",
          output: reload.trim(),
        });

        send("done", { success: true, message: "Deploy complete." });
        if (!closed) {
          try {
            controller.close();
          } catch {}
        }
      })();
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
}
