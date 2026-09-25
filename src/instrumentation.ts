// Runs once when the Next.js server boots (nodejs runtime only).
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { bootstrap } = await import("./server/bootstrap");
    await bootstrap();
  }
}
