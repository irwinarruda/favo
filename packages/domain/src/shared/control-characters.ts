const ControlCharacter = /\p{Cc}/gu;

export function stripControlCharacters(text: string) {
  return text.replace(ControlCharacter, '');
}

export function stripControlCharactersDeep(value: unknown): unknown {
  if (typeof value === 'string') return stripControlCharacters(value);
  if (Array.isArray(value)) return value.map((item) => stripControlCharactersDeep(item));
  if (typeof value !== 'object' || value === null) return value;
  return Object.fromEntries(
    Object.entries(value).map(([key, item]) => [stripControlCharacters(key), stripControlCharactersDeep(item)])
  );
}
