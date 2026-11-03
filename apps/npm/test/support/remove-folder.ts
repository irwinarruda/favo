import { rm } from 'node:fs/promises';

export async function removeFolder(path: string, attemptsLeft = 30): Promise<void> {
  const failure = await rm(path, { recursive: true, force: true }).catch((error: unknown) => error);
  if (failure === undefined) return;
  if (attemptsLeft === 1) throw failure;
  await Bun.sleep(100);
  return removeFolder(path, attemptsLeft - 1);
}
