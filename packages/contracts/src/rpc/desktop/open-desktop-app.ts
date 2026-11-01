import { DesktopOpening } from '@favo/domain/desktop/desktop-app';
import { ProviderId } from '@favo/domain/providers/provider';
import { z } from 'zod';
import { defineMethod, MethodRouting } from '#contracts/rpc/method';

export const OpenDesktopAppParams = z.strictObject({
  account: z.string(),
  provider: z.enum(ProviderId),
  shouldClose: z.boolean(),
});
export type OpenDesktopAppParams = z.infer<typeof OpenDesktopAppParams>;

export const OpenedDesktopApp = z.strictObject({
  opening: z.enum(DesktopOpening),
  label: z.string(),
});
export type OpenedDesktopApp = z.infer<typeof OpenedDesktopApp>;

export const openDesktopApp = defineMethod({
  name: 'desktop.open',
  routing: MethodRouting.hub,
  params: OpenDesktopAppParams,
  result: OpenedDesktopApp,
});
