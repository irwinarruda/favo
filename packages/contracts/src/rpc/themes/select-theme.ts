import { z } from 'zod';
import { defineMethod, MethodRouting } from '#contracts/rpc/method';

export const selectTheme = defineMethod({
  name: 'themes.select',
  routing: MethodRouting.hub,
  params: z.strictObject({ id: z.string() }),
  result: z.strictObject({ activeId: z.string() }),
});
