# EGREED Identity roadmap

## In progress
- [x] Stricter API key / OAuth scope selection (typed scope catalogue, enum validation)
- [x] Unified server-side scope enforcement on every `/api/public/v1/*` REST call
- [x] End-to-end integration test flow (token exchange, userinfo, permissions)
- [ ] Detailed audit logging: OAuth consent, refresh token usage, API key REST calls
- [ ] Developer console tool: generate + verify sample authorize/token/userinfo requests

## Next
- [ ] Integration access log surface in the developer console
- [ ] Docs page section for the REST + OIDC surface
