# Account storage and Sites deployment

The account system runs in the existing Sites Cloudflare Worker and uses the managed D1 `DB` binding. Accounts, password hashes, sessions, rate-limit counters, private workspace data and encrypted provider credentials survive Worker restarts and deployments. No production account data is stored in a local file or process-global map.

## Security decisions

| Boundary | Implementation |
| --- | --- |
| Identity | Normalized unique email, random account UUID; email is a login identifier, not proof of mailbox ownership. |
| Password | scrypt, N=32768, r=8, p=3, 16-byte random salt, 32-byte output; versioned encoding and timing-safe comparison. Passwords are 15–128 characters. |
| Session | Random 256-bit opaque bearer token; only its SHA-256 digest is stored in D1. HTTPS uses `__Host-` cookie with Secure, HttpOnly, SameSite=Lax and no Domain. Absolute lifetime is seven days. |
| Revocation | Sign-out removes the current session. Password changes and “sign out all devices” revoke all sessions. Destructive account actions require the current password. |
| Authorization | Server derives `user_id` from the verified session. Private queries always bind that ID; request body IDs never select another account. |
| Database | Parameterized SQL; `(user_id,data_key)` primary key; foreign keys with cascading deletion. D1 does not provide PostgreSQL RLS: this is application-enforced row ownership, not a claim of database RLS. |
| Credentials | AES-256-GCM with a random 96-bit nonce and account ID as authenticated additional data; ciphertext copied to another account cannot decrypt. The 32-byte encryption key lives in Sites secrets, outside D1 and Git. API responses only expose secret-presence flags. |
| Request isolation | AsyncLocalStorage contains only the current request's provider configuration. Private settings are never written into process environment or a shared mutable store. Personalized caches include account identity. |
| OAuth | YouTube pending authorization and channel sessions are serialized into the account's encrypted cloud credentials. Account transitions clear browser OAuth cookies. |
| CSRF | Mutations require an exact same-origin Origin header, reject cross-site fetches, and accept bounded JSON. |
| Abuse | Shared D1 counters enforce 30 authentication attempts per trusted Cloudflare client IP and 10 per email per 15 minutes; password reauthentication is separately limited. Unknown-account logins perform the same password derivation as known accounts. |
| Browser | Signed-in workspace data is loaded from D1 and held in memory, not copied to localStorage. Guest browser data is kept separate and is never silently imported into a new account. |
| Concurrent editing | Writes use expected revision comparisons. A stale tab/device receives 409 instead of overwriting newer data. Account ID request headers also reject writes from tabs belonging to a previous login. |
| Sync failures | Failures remain visible; navigation away warns while changes are unsaved. No silent fallback to a different account or guest workspace. |

The browser continues to support anonymous exploration. Guest browser storage is not a security boundary or an account. Anyone with access to that browser profile can see guest data.

## Deployment

- `.openai/hosting.json` declares `d1: "DB"` for the existing project.
- `drizzle/0000_accounts.sql` and its migration journal ship in the Sites build artifact through `@openai/sites-vite-plugin`.
- Set `FEEDER_CREDENTIAL_KEY` once as a Sites secret to a cryptographically random 32-byte hexadecimal value. Do not rotate it by simply replacing it: existing ciphertext must be re-encrypted in a controlled migration. Losing the key loses access to saved provider secrets.
- Preserve existing deployment environment variables. `runtime-env.worker.ts` reads Worker bindings directly; secrets are not injected into client bundles or hosting metadata.
- Build with `pnpm build:site`. The regular Next.js development server deliberately fails closed for cloud account operations; `pnpm dev:site` uses the same Cloudflare runtime with a development D1 binding. Production uses the Sites-managed cloud database.
- Apply the checked-in migration to the development binding before local integration tests. `tests/account-integration.mjs` exercises the built Worker. It creates and deletes only its own test accounts; use the local runtime by default.
- Publish the exact pushed source commit with its matching build artifact. Verify registration, a new browser session, cross-account isolation, credential persistence and session revocation on the deployed version.

## Boundaries and remaining work

Email verification, email recovery, MFA, breached-password screening, dedicated authentication audit retention, bot challenges and user-facing session lists are not implemented. A verified email/SMTP provider and recovery flow are required before treating an email as verified or offering email password resets. This implementation does not claim compliance certification or enterprise security equivalence.

D1 backup/restore facilities are managed by the platform. Confirm the actual Sites account's backup retention and restore access before relying on an operational recovery objective; no restore drill was performed. Application-level AES encryption covers API/OAuth credentials. Workspace JSON and email are not individually application-encrypted; restrict administrative access to the database and Sites project.

## Primary references

- [AWS SaaS tenant isolation](https://docs.aws.amazon.com/whitepapers/latest/saas-architecture-fundamentals/tenant-isolation.html): successful authentication is separate from tenant isolation; every resource access must be scoped to tenant context.
- [Google Cloud Identity Platform authentication](https://docs.cloud.google.com/identity-platform/docs/concepts-authentication): comparison with managed identity services. A managed identity provider remains a future option when verification, MFA and recovery are required.
- [OWASP password storage](https://cheatsheetseries.owasp.org/cheatsheets/Password_Storage_Cheat_Sheet.html): memory-hard hashing and the selected scrypt parameter combination.
- [OWASP session management](https://cheatsheetseries.owasp.org/cheatsheets/Session_Management_Cheat_Sheet.html): bearer session protection, cookie attributes and revocation.
- [Cloudflare D1 binding API](https://developers.cloudflare.com/d1/worker-api/): prepared queries and transactional batches.
- [Cloudflare D1 backup recovery](https://developers.cloudflare.com/d1/reference/time-travel/): platform recovery capabilities, subject to the deployed plan and access.
- [OpenAI Sites documentation](https://learn.chatgpt.com/docs/sites): binding declarations, saved versions and hosted deployment lifecycle.
