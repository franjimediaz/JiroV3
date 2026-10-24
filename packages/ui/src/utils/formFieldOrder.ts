/** Sections express membership; the global fields array always supplies order. */
export function orderedSectionFields<T extends { name: string }>(fields: T[], names: readonly string[]): T[] {
  const members = new Set(names);
  return fields.filter(field => members.has(field.name));
}
