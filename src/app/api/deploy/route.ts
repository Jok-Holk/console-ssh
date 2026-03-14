import { NextRequest } from "next/server";
import { execSync } from "child_process";
import { spawn } from "child_process";
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

const APP_DIR = process.env.APP_DIR ?? "/root/console-ssh";
const PM2_NAME = process.env.PM2_APP_NAME ?? "console-ssh";

// GET — check git status
export async function GET(request: NextRequest) {
  if (!authCheck(request))
    return Response.json({ error: "Unauthorized" }, { status: 401 });

  try {
    execSync("git fetch origin", { cwd: APP_DIR, timeout: 15000 });
    const status = execSync("git status -sb", {
      cwd: APP_DIR,
      encoding: "utf8",
    }).trim();
    const log = execSync("git log HEAD..origin/main --oneline", {
      cwd: APP_DIR,
      encoding: "utf8",
    }).trim();
    const current = execSync("git log -1 --format='%h %s %cr'", {
      cwd: APP_DIR,
      encoding: "utf8",
    }).trim();
    return Response.json({
      hasUpdates: log.length > 0,
      current,
      pending: log ? log.split("\n") : [],
      status,
    });
  } catch (e) {
    return Response.json({ error: String(e) }, { status: 500 });
  }
}

// POST — stream deploy steps live using spawn (non-blocking)
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

      // Run a command with spawn — streams stdout/stderr live
      const runStep = (
        stepName: string,
        cmd: string,
        args: string[],
        cwd: string,
      ): Promise<boolean> => {
        return new Promise((resolve) => {
          send("step", { step: stepName, status: "running" });

          const proc = spawn(cmd, args, { cwd, shell: false });
          let output = "";

          const onData = (chunk: Buffer) => {
            const text = chunk.toString();
            output += text;
            // Stream output chunks live as they arrive
            send("output", { step: stepName, chunk: text });
          };

          proc.stdout.on("data", onData);
          proc.stderr.on("data", onData);

          proc.on("close", (code) => {
            send("step", {
              step: stepName,
              status: code === 0 ? "done" : "error",
              output: output.slice(-1000),
            });
            resolve(code === 0);
          });

          proc.on("error", (err) => {
            send("step", {
              step: stepName,
              status: "error",
              output: err.message,
            });
            resolve(false);
          });
        });
      };

      (async () => {
        // Step 1: git pull
        const pulled = await runStep(
          "git pull",
          "git",
          ["pull", "origin", "main"],
          APP_DIR,
        );

        // Check if already up to date
        if (pulled) {
          const lastOutput = "";
          // Check via git status
          try {
            const status = execSync("git status --porcelain", {
              cwd: APP_DIR,
              encoding: "utf8",
            }).trim();
            if (status === "") {
              // Might be already up to date — check log
              const behind = execSync("git log HEAD..origin/main --oneline", {
                cwd: APP_DIR,
                encoding: "utf8",
              }).trim();
              if (behind === "") {
                send("step", {
                  step: "npm build",
                  status: "skipped",
                  output: "Already up to date — no build needed.",
                });
                send("done", { success: true, message: "Already up to date." });
                if (!closed) {
                  try {
                    controller.close();
                  } catch {}
                }
                return;
              }
            }
          } catch {}
        }

        // Step 2: npm run build
        const built = await runStep(
          "npm build",
          "npm",
          ["run", "build"],
          APP_DIR,
        );
        if (!built) {
          send("done", {
            success: false,
            message: "Build failed. Check logs above.",
          });
          if (!closed) {
            try {
              controller.close();
            } catch {}
          }
          return;
        }

        // Step 3: pm2 reload (zero-downtime)
        await runStep(
          "pm2 reload",
          "pm2",
          ["reload", PM2_NAME, "--update-env"],
          APP_DIR,
        );

        send("done", { success: true, message: "Deploy complete." });
        // Note: controller may not close cleanly since pm2 reload kills this process
        try {
          if (!closed) controller.close();
        } catch {}
      })();

      request.signal.addEventListener("abort", () => {
        closed = true;
        try {
          controller.close();
        } catch {}
      });
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no", // Tell nginx not to buffer SSE
    },
  });
}
