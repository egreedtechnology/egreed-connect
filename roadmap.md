# EGREED Identity roadmap

## Done
- [x] Stricter API key / OAuth scope selection (typed scope catalogue, enum validation)
- [x] Unified server-side scope enforcement on every `/api/public/v1/*` REST call
- [x] End-to-end integration test flow (token exchange, userinfo, permissions)
- [x] Detailed audit logging: OAuth consent, refresh token usage, API key REST calls
- [x] Developer console tool: generate + verify sample authorize/token/userinfo requests
- [x] Integration access log surface in the developer console (/developer/logs)
- [x] Docs page section for the REST + OIDC surface

- [x] Robust sign-in check for external-app consent (missing env fallback)
- [x] .env download + connection check after API key creation
- [x] AI setup assistant (/developer/setup)

## Ideas / next
- [ ] Organization-level integration log (not just per-user)
- [ ] Webhook delivery for security + integration events
