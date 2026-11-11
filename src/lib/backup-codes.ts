export const BACKUP_CODE_COUNT = 10;

export function normalizeBackupCode(value: string): string {
  return value.replace(/[\s-]/g, "").toUpperCase();
}

export function createBackupCodes(): string[] {
  return Array.from({ length: BACKUP_CODE_COUNT }, () => {
    const bytes = crypto.getRandomValues(new Uint8Array(16));
    const hex = Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("").toUpperCase();
    return hex.match(/.{4}/g)?.join("-") ?? hex;
  });
}