# Security Specification: Cameroon-Cross River Cocoa Traceability Platform

## 1. Data Invariants
1. **User Identity Invariant**: A user document at `/users/{userId}` can only be created or modified by the user with matching UID `request.auth.uid`. No user can elevate their role to `admin`.
2. **Farm Ownership Invariant**: A registered farm at `/farms/{farmId}` must have `farmerId == request.auth.uid` and can only be updated/deleted by its registered owner or an admin.
3. **Lot Provenance Invariant**: Marketplace lots at `/lots/{lotId}` can be created by authenticated producers/sellers (`sellerId == request.auth.uid`). Once created, origin and sellerId are immutable.
4. **Lot Event Gate Invariant**: Sub-collection `/lots/{lotId}/events/{eventId}` can only be modified by the lot's owner or an admin. Reads are public to ensure end-to-end traceability verification for buyers and consumers.
5. **No Blind Blanket Reads for Private Data**: User profiles cannot be harvested en masse. Reads at `/users/{userId}` are strictly owner-only or admin-only.
6. **Immutable Fields**: `createdAt`, `id`, `farmerId`, and `sellerId` cannot be changed post-creation.

## 2. The Dirty Dozen Payloads (Designed to Break Identity, Integrity, and State)
1. **Ghost Field Farm Update**: Injecting arbitrary field `isGovernmentCertified: true` into a farm update.
2. **Identity Spoofing Farm Creation**: Submitting `farmerId: "victim-farmer-uid"` while authenticated as `"attacker-uid"`.
3. **Role Escalation in Profile**: Calling update on `/users/{uid}` with `role: "admin"`.
4. **Unauthenticated Lot Creation**: Writing a new lot document to `/lots/{lotId}` without an active auth session.
5. **Origin Tampering**: Updating an existing Cameroon cocoa lot to alter `origin: "Other Country"` bypassing due diligence.
6. **Path Traversal / Malformed ID**: Creating a lot with an ID containing punctuation or excessive length (e.g. `../../lots/hacked`).
7. **Cross-User Farm Delete**: User B deleting a farm owned by User A.
8. **Orphaned Event Injection**: Creating a trace event at `/lots/{lotId}/events/{eventId}` where `lotId` in data doesn't match the parent path.
9. **Junk String Payload Bomb**: Submitting a 500KB string in `geolocation` or `farmName`.
10. **State Skipping to Completed**: Bypassing custody steps and directly falsifying terminal state without custody evidence.
11. **PII Harvesting via User List**: Querying `/users` collection without user filter to scrape emails.
12. **Immutable Timestamp Forgery**: Overwriting `createdAt` timestamp with an artificial past date to fake historical registration.

## 3. Test Matrix Summary
All 12 attacks are guaranteed to yield `PERMISSION_DENIED` under the fortress rules.
