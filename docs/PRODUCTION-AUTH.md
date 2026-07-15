# Ghostwritr production authentication

The production web application is protected by Cloudflare Access and reached
through Cloudflare Tunnel. Ghostwritr validates the signed Access application
JWT from the `Cf-Access-Jwt-Assertion` header before creating an application
request context.

Required production environment values:

```dotenv
GHOSTWRITR_CLOUDFLARE_TEAM_DOMAIN=https://<team>.cloudflareaccess.com
GHOSTWRITR_CLOUDFLARE_AUD=<application-audience-tag>
GHOSTWRITR_CLOUDFLARE_OWNER_EMAIL=<email already owning the books>
GHOSTWRITR_CLOUDFLARE_OWNER_NAME=Chris
```

The team domain and audience identify the Cloudflare Access application; they
are not passwords. Signing keys are loaded from Cloudflare's rotating JWKS
endpoint and cached briefly. JWT signature, issuer, audience, expiration,
not-before time, and authenticated email are validated.

The owner email is intentionally separate from the Cloudflare identity email.
This installation predates production authentication and its existing books are
owned by `local@ghostwritr.app`. A valid Access identity is therefore mapped to
that existing owner so production login does not create an empty replacement
library.

Native Apple access uses a separate device credential and requires a Cloudflare
Access service-token path before it can connect through the protected public
hostname.
