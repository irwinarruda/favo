import { DesktopOpening } from '@favo/domain/desktop/desktop-app';
import { ProviderId } from '@favo/domain/providers/provider';
import { z } from 'zod';
import { defineMethod, MethodRouting } from '#contracts/rpc/method';

export const OpenDesktopAppParams = z.strictObject({
  account: z.string(),
  provider: z.enum(ProviderId),
  canClose: z.boolean(),
});
export type OpenDesktopAppParams = z.infer<typeof OpenDesktopAppParams>;

export const DesktopOpenResult = z.strictObject({
  opening: z.enum(DesktopOpening),
  label: z.string(),
});
export type DesktopOpenResult = z.infer<typeof DesktopOpenResult>;

export const openDesktopApp = defineMethod({
  name: 'desktop.open',
  routing: MethodRouting.hub,
  params: OpenDesktopAppParams,
  result: DesktopOpenResult,
});
