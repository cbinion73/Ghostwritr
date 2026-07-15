# Ghostwritr for Apple

A native SwiftUI edition of Ghostwritr for iPhone, iPad, and Mac. It is not a
web wrapper. The Apple app presents the same books and durable workflow state
through an additive native API while the existing web application remains
unchanged.

## Open and run

The checked-in `Ghostwritr.xcodeproj` contains two schemes:

- `Ghostwritr-iOS` — universal iPhone and iPad app
- `Ghostwritr-macOS` — native Mac app

The app opens in **Preview Edition** so its complete visual experience is
available without a server or paid LLM call. Open Settings to connect it to the
live press.

If `project.yml` changes, regenerate the project with:

```bash
cd apps/apple
xcodegen generate
```

## Connect the Hetzner deployment

Generate a long random token and configure these environment variables on the
Ghostwritr server:

```dotenv
GHOSTWRITR_NATIVE_TOKEN=<long-random-secret>
GHOSTWRITR_NATIVE_USER_EMAIL=<the-existing-owner-email>
GHOSTWRITR_NATIVE_USER_NAME=Chris
```

Restart the server, then enter the HTTPS server address and the same token in
the app. The app stores the token in Apple Keychain. Anthropic, OpenAI, and
other provider credentials remain server-side.

## Native API

- `GET /api/native/v1/library`
- `GET /api/native/v1/books/:slug`
- `POST /api/native/v1/books/:slug/chapters/:chapterId/approve`

The snapshot endpoint returns the canonical book journey, chapter artifacts,
approval state, active durable jobs, and total recorded LLM spend. Approval is
intentionally one chapter at a time.

## Verified builds

```bash
xcodebuild -project Ghostwritr.xcodeproj -scheme Ghostwritr-macOS \
  -configuration Debug -derivedDataPath .derived/mac CODE_SIGNING_ALLOWED=NO build

xcodebuild -project Ghostwritr.xcodeproj -scheme Ghostwritr-iOS \
  -configuration Debug -sdk iphonesimulator \
  -destination 'generic/platform=iOS Simulator' \
  -derivedDataPath .derived/ios CODE_SIGNING_ALLOWED=NO build
```
