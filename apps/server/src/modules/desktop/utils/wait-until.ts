const PollMs = 100;

export async function waitUntil(isDone: () => Promise<boolean>, timeoutMs: number) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await isDone()) return true;
    await Bun.sleep(PollMs);
  }
  return isDone();
}
