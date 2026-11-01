import { z } from 'zod';
import { defineMethod, MethodRouting } from '#contracts/rpc/method';

export const DirectoryEntry = z.strictObject({
  name: z.string(),
  path: z.string(),
  completion: z.string(),
});
export type DirectoryEntry = z.infer<typeof DirectoryEntry>;

export const DirectoryListing = z.strictObject({
  directory: z.string(),
  exists: z.boolean(),
  entries: z.array(DirectoryEntry),
});
export type DirectoryListing = z.infer<typeof DirectoryListing>;

export const listDirectories = defineMethod({
  name: 'directories.list',
  routing: MethodRouting.machine,
  params: z.strictObject({ input: z.string() }),
  result: DirectoryListing,
});
