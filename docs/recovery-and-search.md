# Recovery and Records search

## Local preview follow-up

The default preview reads `server/data/business-workspaces`, not the production Blob store. Entering the same identity selects that environment's copy; it does not automatically cross environments. A local fixture can therefore appear to be a new or almost-empty account even when production has many documents.

Use `node scripts/preview-recovery.mjs` for a read-only view of the live account at `http://127.0.0.1:5174/auth`. This separate preview forwards only GET bootstrap requests to the fixed live origin. It never forwards seeds, registration or mutations and never substitutes the local fixture. Account creation is disabled. Download/share-history writes are skipped so PDF generation remains usable. Both local services bind to loopback. The first large workspace download can take several minutes; the recovery-specific timeout is longer than ordinary API requests.

The read-only preview does not deploy code, migrate storage, or repair the current live endpoint. A successful partial HTTP response is insufficient proof of complete recovery; counts must be checked after the complete JSON response has loaded. Regression tests include a synthetic account with 100 invoices and 25 quotations; those counts are not evidence of a customer's production counts.

Production recovery and refresh also allow up to eleven minutes for a complete workspace download, so large accounts are not aborted after the ordinary one-minute mutation timeout. The sign-up form explicitly requests account creation; login and recovery never do. Both paths search existing storage before any creation is considered.

## Findings and changes

This checkout has v3 whole-workspace JSON storage at `business/<sha256>.json`, not partitioned v4 storage. Tanzanian mobile normalization already handles local, international and nine-digit forms; email hashing already trims and lowercases.

The observed code paths that can produce an empty or misleading workspace were:

- Vercel Blob was selected only when `BLOB_STORE_ID` existed. Token-only configuration could fall through to Netlify/local files.
- Non-200 Blob responses and malformed JSON could be interpreted as missing data. Local read errors were also swallowed.
- Lookup stopped at the first matching key, so an empty canonical workspace could hide a populated legacy workspace.
- Settings automatically claimed/created identities while contact fields were being typed.
- Browser initialization fell back to local data after remote recovery failed.
- Saving settings after recovery could overwrite the recovered profile with the pre-recovery form.

Vercel now requires persistent Blob configuration and accepts the SDK's token or store-ID authentication. Only a missing object means absent. Read failures, invalid data, unsupported versions and conflicting workspace copies stop recovery without writing. Initialization failures show a retry screen, retaining the saved identity. Settings has an explicit recovery action and offers new-account creation only after a missing-identity response. Claims of existing workspaces are read-only.

Lookup checks every supported phone key. A single populated legacy workspace takes precedence over an empty canonical file. Updates continue at that existing key; no legacy files are copied or deleted, and counters are preserved. Multiple populated copies require recovery review, because automatically merging them could resurrect deleted documents. Identity stored in each workspace must match the requested normalized identity.

There is no v4 migration in this change. Unsupported versions fail closed rather than being normalized to empty v3 data. Do not deploy this handler against a separate v4 layout without its actual schema and migration contract.

## Search

Records builds a memoized in-memory index whenever its document collection changes. It covers numbers, client name/company/email/phone, and item names/descriptions. Whitespace-separated query terms all match, case-insensitively and partially. Filters combine type, status and inclusive issue-date bounds. Sort uses issue date or the existing tax/discount-aware grand total. Results render 50 records per page, retaining the existing quotation/invoice tables and their actions. Amount sorting compares displayed numeric amounts, without currency conversion.

The v3 app already loads complete workspaces on bootstrap. Search performs no additional fetches or per-keystroke full-document scans. A lightweight server index and lazy document fetches would require changing that bootstrap/editor/dashboard contract; they are not implemented here. Partitioned v4 remains a separate project.

## Verification transition (prepared, not enabled)

Email plus phone is an identifier, **not proof of ownership**. The current compatibility flow still grants access to anyone knowing both details. Wrong-identity isolation tests do not establish authentication security.

Before enforcing verification, implement and test this rollout in a preview with a separate storage store:

1. Configure a transactional email sender with a verified sending domain and a durable transactional challenge/session store. Do not use last-write-wins workspace blobs for OTP attempt counters.
2. Add a challenge endpoint with generic responses, IP/identity rate limits, expiry, bounded attempts and single-use codes stored only as keyed hashes. Send codes only to the existing registered email, never a newly edited profile address. Never return a workspace with a challenge response.
3. Verify the code server-side and issue an opaque, expiring, revocable session in a Secure, HttpOnly, SameSite cookie. Enforce the session's canonical business ID on bootstrap, settings and every document read/write/share route. Check request origin/CSRF for mutations; remove permissive CORS for protected data.
4. Keep registered identity separate from editable invoice contact information. Require verified email changes and an audited recovery path when an existing owner cannot access the old mailbox.
5. Introduce opt-in verified enrollment with advance notice and a tested support-recovery procedure. Existing sessions must reverify before protected access is required; local identity storage must never count as verified ownership. Test existing customers and mailbox failures before enforcing globally. Do not enable a partial gate that leaves older document endpoints unprotected.

No email provider credentials, OTP sending, production verification enforcement or verified-session migration are included in this patch. This is an explicit remaining security requirement, not a secure-login claim.

## Checks

Run with Node 24 (module mocks are experimental):

```sh
npm ci
npx tsc --project tsconfig.app.json
npm run build
node --experimental-test-module-mocks tests/recovery.mjs
node tests/store-recovery.mjs
node tests/record-search.mjs
node tests/large-workspace.mjs
```

Recovery tests use synthetic private Blob responses and assert no writes on outages or recovery. Search covers 10,000 synthetic records. Store tests cover network failure/retry, preservation of recovered settings and exclusion of another business's records from registration. The large-workspace test exercises 52 MB responses and retained images. Document shared-action endpoints are tested for PDF and WhatsApp; actual PDF rendering, native sharing and mobile browser behavior still need browser verification.

Local in-app browser verification also recovered 65 synthetic records from an isolated temporary API store using uppercase email and the nine-digit phone format. Product search returned 33 matching quotations; exact invoice search returned one invoice; its PDF action completed with the "PDF downloaded" message. Refresh restored all 65 records, the second page displayed the remaining 15, and client search combined with invoice filtering and highest-amount sorting returned 32 invoices. Native WhatsApp delivery, separate-browser/incognito sessions and mobile viewport behavior remain unverified.

## Production checks

- Verify the Vercel project's Production environment points to the original private Blob store. No code can recover files in an unconnected store or records that never reached persistent storage.
- Use a known business in two browsers and incognito with every listed phone format; verify settings, clients, catalog, document counts and counters.
- Verify a real legacy account and review any multiple-copy conflict before changing storage. Preserve backups and all source files.
- Test offline recovery/retry, refresh, desktop/mobile search, pagination, PDF download and WhatsApp sharing with real documents.
- Keep the Git branch separate from the old Netlify production branch. No Netlify configuration, deployment or storage migration is part of this change.
- Whole-workspace writes still have the existing concurrent-write risk. Transactional storage or conditional writes are needed before claiming multi-writer safety.
