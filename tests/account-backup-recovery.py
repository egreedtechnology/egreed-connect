"""Real-browser recovery regression. Uses a disposable account, never the owner's factors.
Run: python3 tests/account-backup-recovery.py
Requires sandbox backend admin environment; credentials and backup codes are never printed.
"""
import asyncio
import base64
import hashlib
import hmac
import json
import os
import secrets
import struct
import time
from pathlib import Path

import requests
from playwright.async_api import async_playwright

BASE = os.environ["SUPABASE_URL"].rstrip("/")
HEADERS = {"apikey": os.environ["SUPABASE_SERVICE_ROLE_KEY"], "Authorization": "Bearer " + os.environ["SUPABASE_SERVICE_ROLE_KEY"]}
SHOTS = Path("/tmp/browser/backup-recovery-tests")
SHOTS.mkdir(parents=True, exist_ok=True)


def api(path, method="GET", body=None):
    response = requests.request(method, BASE + path, headers=HEADERS, json=body, timeout=30)
    if not response.ok:
        raise AssertionError(f"Test setup request failed ({response.status_code})")
    return response.json() if response.content else None


def totp(secret):
    key = base64.b32decode(secret + "=" * ((8 - len(secret) % 8) % 8))
    digest = hmac.new(key, struct.pack(">Q", int(time.time()) // 30), hashlib.sha1).digest()
    offset = digest[-1] & 15
    number = struct.unpack(">I", digest[offset:offset + 4])[0] & 0x7fffffff
    return str(number % 1000000).zfill(6)


async def main():
    email = f"backup-test-{secrets.token_hex(8)}@example.invalid"
    password = secrets.token_urlsafe(32)
    user = api("/auth/v1/admin/users", "POST", {"email": email, "password": password, "email_confirm": True})
    uid = user["id"]
    try:
        async with async_playwright() as p:
            browser = await p.chromium.launch(headless=True)
            context = await browser.new_context(viewport={"width": 1280, "height": 1800})
            page = await context.new_page()
            session = api("/auth/v1/token?grant_type=password", "POST", {"email": email, "password": password})
            project = os.environ.get("VITE_SUPABASE_PROJECT_ID")
            injected_key = os.environ.get("LOVABLE_BROWSER_SUPABASE_STORAGE_KEY")
            storage_key = injected_key or f"sb-{project}-auth-token"
            await page.goto("http://localhost:8080")
            await page.evaluate("([k,v])=>localStorage.setItem(k,v)", [storage_key, json.dumps(session)])
            await page.goto("http://localhost:8080/account/security")
            await page.get_by_role("heading", name="Backup codes", exact=True).wait_for()
            page.on("dialog", lambda dialog: dialog.accept())
            panel = page.locator("section").filter(has=page.get_by_role("heading", name="Backup codes", exact=True))
            await page.get_by_role("button", name="Generate backup codes", exact=True).click()
            await panel.locator("[data-backup-code]").first.wait_for()
            old_codes = await panel.locator("[data-backup-code]").all_text_contents()
            assert len(old_codes) == 10
            print("PASS: ten backup codes generated through signed-in UI")
            # Regeneration invalidates the original set, including its hashes.
            await page.get_by_role("button", name="Generate new codes", exact=True).click()
            await page.wait_for_function("old => document.querySelector('[data-backup-code]')?.textContent !== old", arg=old_codes[0])
            codes = await panel.locator("[data-backup-code]").all_text_contents()
            rows = api(f"/rest/v1/account_backup_codes?user_id=eq.{uid}&select=code_hash,used_at")
            assert len(rows) == 10
            assert all(row["code_hash"] != hashlib.sha256(old_codes[0].replace("-", "").encode()).hexdigest() for row in rows)
            print("PASS: regeneration invalidates previous codes; plaintext is not stored")
            async with page.expect_download() as event:
                await page.get_by_role("button", name="Download codes").click()
            download = await event.value
            path = await download.path()
            assert all(code in Path(path).read_text() for code in codes)
            await page.get_by_role("button", name="I've saved my codes").click()
            # Register a real virtual WebAuthn credential through the app.
            cdp = await context.new_cdp_session(page)
            await cdp.send("WebAuthn.enable")
            await cdp.send("WebAuthn.addVirtualAuthenticator", {"options": {"protocol": "ctap2", "transport": "internal", "hasResidentKey": True, "hasUserVerification": True, "isUserVerified": True, "automaticPresenceSimulation": True}})
            await page.get_by_placeholder("Name, e.g. My laptop").fill("Recovery test passkey")
            await page.get_by_role("button", name="Add a passkey", exact=True).click()
            await page.get_by_text("Recovery test passkey", exact=True).wait_for()
            print("PASS: passkey registration")
            await page.get_by_role("button", name="Set up authenticator", exact=True).click()
            secret_node = page.locator("span.font-mono.break-all")
            await secret_node.wait_for()
            secret = await secret_node.inner_text()
            auth_panel = page.locator("section").filter(has=page.get_by_role("heading", name="Authenticator app", exact=True))
            await auth_panel.locator("input").fill(totp(secret))
            await page.get_by_role("button", name="Turn on", exact=True).click()
            await page.get_by_role("button", name="Turn off", exact=True).wait_for()
            print("PASS: authenticator enrollment")
            await panel.screenshot(path=str(SHOTS / "saved-codes.png"))
            await context.clear_cookies()
            await page.evaluate("localStorage.clear()")
            await page.goto("http://localhost:8080/auth")
            await page.get_by_label("Email", exact=True).fill(email)
            await page.get_by_label("Password", exact=True).fill(password)
            await page.get_by_role("button", name="Sign in", exact=True).click()
            await page.get_by_role("heading", name="Enter your code", exact=True).wait_for()
            await page.get_by_role("button", name="Use a backup code instead", exact=True).click()
            await page.get_by_label("Account email").fill(email)
            await page.get_by_label("Backup code", exact=True).fill(codes[0].lower().replace("-", " "))
            await page.get_by_role("button", name="Recover account", exact=True).click()
            await page.wait_for_url("**/account/security")
            await page.get_by_text("9 unused codes", exact=True).wait_for()
            await page.get_by_text("No passkeys yet.", exact=True).wait_for()
            await page.get_by_role("button", name="Set up authenticator", exact=True).wait_for()
            print("PASS: recovery bypasses lost authenticator, resets passkeys, and consumes one code")
            await page.screenshot(path=str(SHOTS / "recovered.png"))
            await page.set_viewport_size({"width": 667, "height": 529})
            await panel.screenshot(path=str(SHOTS / "recovered-mobile.png"))
            assert not await page.evaluate("document.documentElement.scrollWidth > innerWidth")
            await context.clear_cookies()
            await page.evaluate("localStorage.clear()")
            await page.goto("http://localhost:8080/auth")
            await page.get_by_role("tab", name="Recover", exact=True).click()
            await page.get_by_label("Account email").fill(email)
            await page.get_by_label("Backup code", exact=True).fill(codes[0])
            await page.get_by_role("button", name="Recover account", exact=True).click()
            await page.get_by_text("The email or backup code is incorrect, or the code has already been used.", exact=True).wait_for()
            print("PASS: used backup code cannot sign in again")
            factors = api(f"/auth/v1/admin/users/{uid}/factors")
            assert not factors
            audit = api(f"/rest/v1/audit_logs?user_id=eq.{uid}&event_type=eq.auth.backup_code_recovery&select=id")
            assert len(audit) == 1
            print("PASS: successful recovery is audited")
            # The first two attempts succeeded/failed above; the sixth must be refused.
            for _ in range(4):
                await page.get_by_label("Backup code", exact=True).fill(secrets.token_hex(16))
                await page.get_by_role("button", name="Recover account", exact=True).click()
                await page.wait_for_timeout(500)
            await page.get_by_text("Too many recovery attempts. Try again in 15 minutes.", exact=True).wait_for()
            print("PASS: repeated recovery attempts are rate limited")
            await browser.close()
    finally:
        for table in ["account_backup_codes", "passkeys", "webauthn_challenges", "audit_logs", "devices", "security_alerts"]:
            response = requests.delete(BASE + f"/rest/v1/{table}?user_id=eq.{uid}", headers=HEADERS, timeout=30)
            if not response.ok and response.status_code != 404:
                print(f"Test cleanup for {table} needs review")
        api(f"/auth/v1/admin/users/{uid}", "DELETE")


asyncio.run(main())