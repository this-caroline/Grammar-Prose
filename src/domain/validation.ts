export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function isOneOf<Option extends string>(
  value: unknown,
  values: readonly Option[],
): value is Option {
  return typeof value === 'string' && values.some((item) => item === value);
}

export function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item: unknown) => typeof item === 'string');
}
