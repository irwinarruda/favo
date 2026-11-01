type Environment = Record<string, string | undefined>;

export function mergeEnvironment(input: {
  base: Environment;
  overrides?: Environment;
  unset?: string[];
  isCaseInsensitive: boolean;
}) {
  const { base, overrides = {}, unset = [], isCaseInsensitive } = input;
  const sameName = (left: string, right: string) =>
    isCaseInsensitive ? left.toLowerCase() === right.toLowerCase() : left === right;
  const replaced = [...Object.keys(overrides), ...unset];
  const kept = Object.entries(base).filter(([name]) => !replaced.some((other) => sameName(name, other)));
  const merged = [...kept, ...Object.entries(overrides)];
  return Object.fromEntries(merged.filter(([, value]) => value !== undefined)) as Record<string, string>;
}
