# KitAgent account security

KitAgent uses server-authoritative device registration. The browser supplies a cryptographic installation identifier, while the Vercel registration endpoint verifies the Firebase ID token and atomically claims the installation in Firestore.

Required deployment secret:

- `FIREBASE_SERVICE_ACCOUNT_JSON`: Firebase Admin service-account JSON stored only as a server environment variable. Never expose it to Vite/client code.

The client must never be granted Firestore write access to `deviceBindings` or backend-owned account/trial/subscription fields.

Browser device identity is an anti-abuse control, not an absolute hardware identity. VPN/proxy/IP reputation and bot controls should be layered on top of the authoritative claim when available.
