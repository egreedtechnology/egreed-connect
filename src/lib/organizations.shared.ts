/** Client-safe helpers shared by the organization UI and server functions. */

export function slugify(value: string): string {
  return value
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);
}

export function isExpired(iso: string): boolean {
  return new Date(iso).getTime() < Date.now();
}
