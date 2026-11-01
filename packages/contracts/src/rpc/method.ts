import type { ValueOf } from '@favo/domain/shared/value-of';
import type { z } from 'zod';

export const MethodRouting = {
  machine: 'machine',
  hub: 'hub',
} as const;
export type MethodRouting = ValueOf<typeof MethodRouting>;

export type Method<Params extends z.ZodType = z.ZodType, Result extends z.ZodType = z.ZodType> = {
  name: string;
  routing: MethodRouting;
  params: Params;
  result: Result;
};

export function defineMethod<Params extends z.ZodType, Result extends z.ZodType>(method: Method<Params, Result>) {
  return method;
}
