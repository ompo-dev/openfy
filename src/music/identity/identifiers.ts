export function normalizeISRC(
  value?: string
): string | undefined {
  if (!value) return undefined;

  const normalized = value
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '');

  return normalized || undefined;
}

export function normalizeExternalId(
  value?: string
): string | undefined {
  if (!value) return undefined;

  return value.trim().toLowerCase() || undefined;
}

export function isValidISRC(
  value?: string
): boolean {
  if (!value) return false;

  const isrc = normalizeISRC(value);

  if (!isrc) return false;

  return /^[A-Z]{2}[A-Z0-9]{3}\d{7}$/.test(
    isrc
  );
}
