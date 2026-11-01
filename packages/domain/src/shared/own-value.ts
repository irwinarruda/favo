export function ownValue<Value>(record: Record<string, Value>, key: string) {
  return Object.hasOwn(record, key) ? record[key] : undefined;
}
