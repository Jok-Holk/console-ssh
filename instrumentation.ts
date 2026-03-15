/**
 * instrumentation.ts
 * Next.js instrumentation hook — runs once when server starts.
 * This is the correct place for Node.js startup code (NOT middleware which runs on edge).
 * https://nextjs.org/docs/app/building-your-application/optimizing/instrumentation
 */
export async function register() {
  // Only run on Node.js server, not edge
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { runStartup } = await import("./src/lib/startup");
    runStartup();
  }
}
