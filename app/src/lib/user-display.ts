export function displayHandle(handle: string | null | undefined): string | null {
  const normalized = handle?.trim().replace(/^@/, "");
  if (!normalized) return null;

  const generated = normalized.match(/^(.+)-[a-z0-9]{8}$/i);
  if (generated?.[1]) return generated[1];

  return normalized;
}

export function atDisplayHandle(handle: string | null | undefined): string | null {
  const next = displayHandle(handle);
  return next ? `@${next}` : null;
}
