import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { createBackupCodes, normalizeBackupCode } from "./backup-codes";

describe("account backup codes", () => {
  it("issues ten unique 128-bit backup codes", () => {
    const codes = createBackupCodes();
    assert.equal(codes.length, 10);
    assert.equal(new Set(codes).size, 10);
    for (const code of codes) assert.match(normalizeBackupCode(code), /^[A-F0-9]{32}$/);
  });
  it("accepts the same code with spaces, hyphens, and lowercase", () => {
    assert.equal(normalizeBackupCode("abcd-1234 abcd-1234 abcd-1234 abcd-1234"), "ABCD1234ABCD1234ABCD1234ABCD1234");
    assert.notEqual(normalizeBackupCode("abcd-1235 abcd-1234 abcd-1234 abcd-1234"), "ABCD1234ABCD1234ABCD1234ABCD1234");
  });
});