import { z } from 'zod';
import { defineMethod, MethodRouting } from '#contracts/rpc/method';
import { DesktopAppView } from '#contracts/rpc/views';

export const listDesktopApps = defineMethod({
  name: 'desktop.list',
  routing: MethodRouting.hub,
  params: z.strictObject({}),
  result: z.array(DesktopAppView),
});
