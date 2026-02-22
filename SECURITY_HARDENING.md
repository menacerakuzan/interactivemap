# Security Hardening (Pre-Push)

## 1) Repository visibility
- For government-related deployments: keep primary repository **private**.
- If public code is required, create a separate public mirror with no operational configs or internal docs.

## 2) Secrets policy
- Never commit:
  - `.env`
  - service role keys
  - JWT secrets
  - DB dumps/logs with sensitive payloads
- Keep only `.env.example` with empty placeholders.
- Rotate secrets immediately if they were shared in chats/issues/screenshots.

## 3) Required GitHub controls
- Enable branch protection on `main`:
  - PR required
  - no force push
  - status checks required
- Enable Secret Scanning + Push Protection.
- Enable Dependabot alerts and security updates.

## 4) Local pre-push checks
Run before every push:
1. `npm run security:scan`
2. `npm run build`
3. `npm run smoke:local`
4. `npm run smoke:supabase` (for release candidates)

## 5) Runtime hardening
- Production must define `JWT_SECRET` explicitly.
- Use dedicated Supabase users for smoke checks (least privilege: `specialist`).
- Keep storage bucket policies least-privilege and audited.

## 6) Incident response (minimum)
If leakage suspected:
1. Revoke/rotate leaked keys immediately.
2. Invalidate active sessions if auth leak is possible.
3. Inspect git history and PR logs for propagation.
4. Document incident and remediation.
