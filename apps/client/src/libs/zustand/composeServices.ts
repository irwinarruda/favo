type Service = object;

type UnionToIntersection<Union> = (Union extends unknown ? (value: Union) => void : never) extends (
  value: infer Intersection
) => void
  ? Intersection
  : never;

export function composeServices<const Services extends readonly Service[]>(...services: Services) {
  const composedService: Record<string, unknown> = {};

  for (const service of services) {
    for (const [key, value] of Object.entries(service)) {
      if (Object.hasOwn(composedService, key)) throw new Error(`Duplicate service key: ${key}`);
      composedService[key] = value;
    }
  }

  return composedService as UnionToIntersection<Services[number]>;
}
