import { describe, expect, it } from "bun:test";
import { createBackupCodes, normalizeBackupCode } from "./backup-codes";

describe("account backup codes", () => {
  it("issues ten unique 128-bit backup codes", () => {
    const codes = createBackupCodes();
    expect(codes).toHaveLength(10);
    expect(new Set(codes).size).toBe(10);
    for (const code of codes) expect(normalizeBackupCode(code)).toMatch(/^[A-F0-9]{32}$/);
  });
  it("accepts the same code with spaces, hyphens, and lowercase", () => {
    expect(normalizeBackupCode("abcd-1234 abcd-1234 abcd-1234 abcd-1234")).toBe("ABCD1234ABCD1234ABCD1234ABCD1234");
    expect(normalizeBackupCode("abcd-1235 abcd-1234 abcd-1234 abcd-1234")).not.toBe("ABCD1234ABCD1234ABCD1234ABCD1234");
  });
});