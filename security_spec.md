# LinkPulse Firestore Security Specification (Phase 0)

## 1. Data Invariants
1. **Identity & Provider Integrity**: Every document in `/users/{userId}`, `/users/{userId}/private/{docId}`, `/links/{linkId}`, and `/links/{linkId}/clicks/{clickId}` MUST belong to a non-anonymous, authenticated, email-verified user (`request.auth != null && request.auth.token.email_verified == true && request.auth.token.email is string && request.auth.token.firebase.sign_in_provider != 'anonymous'`), and its `userId` field MUST strictly equal `request.auth.uid`.
2. **PII Isolation & Token Email Binding**: Sensitive PII (`email`) is stored strictly inside `/users/{userId}/private/info`, MUST match `request.auth.token.email`, and can ONLY be read or written by `{userId}` matching `request.auth.uid`. Public profiles (`/users/{userId}`) contain zero PII and reject reserved administrative handles (`admin`, `root`, `system`, `support`, `security`, `linkpulse`, `moderator`, `staff`, `api`, `auth`).
3. **Master Gate Relational Sync**: Click telemetry documents under `/links/{linkId}/clicks/{clickId}` MUST verify via `get()` that the parent `/links/{linkId}` document exists and belongs to `request.auth.uid`, and on creation must atomically synchronize with the parent link's `clicksCount` increment using `getAfter()`.
4. **Anti-Update-Gap & Strict Key Whitelisting**: Both `create` and `update` operations validate the full entity schema via `isValid[Entity](incoming())`, enforce strict `keys().hasAll(...) && keys().hasOnly(...)` on `create`, and restrict `update` mutations to explicit action branches via `incoming().diff(existing()).affectedKeys().hasOnly(...)`.
5. **Immutable Fields**: `userId`, `id`, `shortCode`, `originalUrl`, and `createdAt` are immutable after document creation (`incoming().field == existing().field`).
6. **Temporal Integrity**: `createdAt` (on create) and `updatedAt` (on create/update) and `timestamp` (on click create) MUST equal `request.time`.
7. **Protocol, SSRF, Phishing & XSS Guards**: `originalUrl` MUST match `^https?://[^/\\s]+\\..+` (`10..2048` chars), explicitly reject `@` credential phishing in authority, and reject localhost, loopback, RFC 1918 subnets, IPv6 `::1`, and cloud metadata hosts (`169.254.*`, `metadata.google.internal`) directly inside Firestore rules. All descriptive text (`displayName`, `title`, `city`, `referrer`, `browser`, `os`) rejects HTML/script delimiters (`<`, `>`, `"`, `'`, `` ` ``, `\`), IDs match `^[a-zA-Z0-9_-]+$` (`<= 128` chars), and `tags` is bounded to `<= 10` safe strings.
8. **Secure List Queries**: No blanket `allow list` rules. `/users` and `/users/{userId}/private` set `allow list: if false`. `allow list` on `/links` and `/links/{linkId}/clicks` strictly enforces `resource.data.userId == request.auth.uid` with zero `get()`/`exists()` calls inside `list`.
9. **Opt-In High-Accuracy GPS Validation**: Optional GPS configuration on `/links/{linkId}` (`requireGps`, `gpsMaxAccuracyMeters`, `gpsStrictMode`) and GPS telemetry on `/links/{linkId}/clicks/{clickId}` (`geoSource`, `latitude`, `longitude`, `accuracyMeters`, `gpsTargetMet`) enforce strict numeric ranges (`latitude` in `[-90, 90]`, `longitude` in `[-180, 180]`, `accuracyMeters` in `[0.01, 100000]`, `gpsMaxAccuracyMeters` in `[0.1, 1000]`).

---

## 2. The "Dirty Dozen+" Adversarial Payloads

| # | Target Collection | Attack Vector | Malicious Payload / Condition | Expected Result |
|---|---|---|---|---|
| 1 | `/users/{uid}` | **Identity Spoofing** | `userId: "victim_uid_999"` while signed in as `attacker_uid` | `PERMISSION_DENIED` |
| 2 | `/users/{uid}` | **Reserved Handle Impersonation** | `{ ..., username: "admin" }` or `"security"` | `PERMISSION_DENIED` |
| 3 | `/users/{uid}/private/info` | **Cross-Tenant PII Read / Spoofed Email** | `getDoc` on `/users/victim_uid/private/info` or `email != request.auth.token.email` | `PERMISSION_DENIED` |
| 4 | `/users/{uid}` | **Anonymous / Unverified Email Write** | Create profile with `email_verified == false` or `sign_in_provider == 'anonymous'` | `PERMISSION_DENIED` |
| 5 | `/links/{linkId}` | **XSS Protocol & Tag/Title Injection** | `{ ..., originalUrl: "javascript:alert(1)" }` or `title: "<script>alert(1)</script>"` | `PERMISSION_DENIED` |
| 6 | `/links/{linkId}` | **SSRF & Credential Phishing URL** | `{ ..., originalUrl: "http://169.254.169.254/latest" }` or `"https://google.com@evil.com"` | `PERMISSION_DENIED` |
| 7 | `/links/{linkId}` | **Resource Poisoning (Oversized ID / Tag Flood)** | `{linkId}` = 200-char junk string or 25 tags (> max 10) | `PERMISSION_DENIED` |
| 8 | `/links/{linkId}` | **Timestamp Spoofing** | `{ ..., createdAt: new Date("2020-01-01") }` instead of `serverTimestamp()` | `PERMISSION_DENIED` |
| 9 | `/links/{linkId}` | **Immutable Field Mutation** | Update `originalUrl` or `userId` or `shortCode` on existing link | `PERMISSION_DENIED` |
| 10 | `/links/{linkId}` | **Shadow Update (Arbitrary Click Inflation)** | Update `clicksCount` directly by `+999999` without atomic click batch | `PERMISSION_DENIED` |
| 11 | `/links` | **Blanket Query Scraping** | `getDocs(collection(db, "links"))` without `where("userId", "==", uid)` | `PERMISSION_DENIED` |
| 12 | `/links/{linkId}/clicks/{clickId}` | **Orphaned / Desynced Click Write** | Create click where parent `/links/{linkId}` does not exist or `clicksCount` is not incremented atomically | `PERMISSION_DENIED` |
