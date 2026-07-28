# Unified Platform Plan: Merging Alexandria + Anniversary

> **Decision (2026-07-28): Plan B (native/Flutter) was chosen.** The
> deciding factor is that the platform must later schedule notifications
> and exact alarms, which only a native app supports well (exact,
> offline-capable, reboot-surviving alarms are not available to web apps
> or wrappers with the same reliability). The concrete implementation
> plan lives in the anniversary repo at `docs/implementation-plan.md`;
> that repo becomes the platform home, and this repo is ported in as the
> reader module, then retired after cutover. The comparison below is kept
> for the record.

Goal: one product that runs as a **website and an Android app**, hosts both
existing projects as modules, leaves room for future mini-projects, **syncs
data automatically** between app and website, and can run **computationally
heavy work** later (e.g. NLP for language learning, image processing).

## Where the two projects stand today

| | Alexandria | Anniversary |
|---|---|---|
| Size | ~12,000 lines TS (5.2k backend, 6.6k frontend + shared) | ~2,000 lines Dart |
| Frontend | React 19 + Vite + Tailwind + Jotai | Flutter (Material 3) |
| Backend | Express 5 + Postgres, custom JWT auth (bcrypt) | None — Firebase Auth + Firestore + Storage directly |
| Platforms | Web (Firebase Hosting + Cloud Function wrapping Express) | Android/iOS/web/desktop targets, Firebase Hosting for web |
| Nature | Text-heavy reading/learning app; relational data (languages, texts, words, translations); DeepL integration | On-the-go app: bingo boards of goals with photos (camera), locations (GPS), map view |

The stacks conflict on every axis: language (TS vs Dart), UI (React vs
Flutter), database (Postgres vs Firestore), auth (JWT vs Firebase Auth).
Merging means picking one side to be the platform and porting the other.

---

## Plan A — TypeScript web platform (web-first, recommended)

**One React web app is the product; Android is the same app wrapped with
Capacitor. One backend (Express + Postgres) is the single source of truth.**

### Architecture

```
monorepo (npm workspaces)
├── shared/          @platform/shared — types + zod schemas for ALL modules
├── backend/         Express 5 + Postgres
│   └── modules/     alexandria/, anniversary/, <future>/  (routes+services per module)
├── frontend/        React 19 + Vite
│   └── modules/     alexandria/, anniversary/, <future>/  (lazy-loaded routes)
├── mobile/          Capacitor shell wrapping frontend build → Android APK/AAB
└── worker/          job runner for heavy compute (added when needed)
```

- **Hub shell**: the frontend gets a top-level launcher/dashboard; each
  project is a lazy-loaded route group (`/read/…`, `/bingo/…`). A new idea =
  a new folder in `frontend/modules` + `backend/modules` + shared types.
  Code-splitting keeps modules from bloating each other.
- **Anniversary port**: rewrite the ~10 Dart files as a React module.
  Camera, GPS and filesystem come from Capacitor plugins (`@capacitor/camera`,
  `@capacitor/geolocation`); the map moves from `flutter_map` to
  `react-leaflet` (same OSM tiles). Firestore documents migrate into
  Postgres tables (`boards`, `goals`, `goal_locations`, `goal_images`) via a
  one-off export script; photos move from Firebase Storage to any object
  storage (can stay on Firebase Storage initially).
- **Auth**: one account for everything — keep Alexandria's JWT auth and
  migrate the (few) Anniversary users, or move both to Firebase Auth and
  verify ID tokens in Express middleware. Either works; keeping the existing
  JWT auth is less churn.
- **Sync**: automatic by construction — app and website are the *same
  client* talking to the *same API*, so there is nothing to reconcile. For
  live updates between two open devices (e.g. partner checks off a bingo
  goal), add a WebSocket/SSE channel on the backend that broadcasts
  invalidations; clients refetch. For offline tolerance on Android, cache
  reads locally (IndexedDB via TanStack Query persist) and queue mutations
  for replay — needed mainly for the bingo module used outdoors.
- **Heavy compute**: a `worker` service consuming a Postgres-backed job
  queue (pg-boss) or BullMQ + Redis. Deploy it as a Cloud Run service (or on
  a VPS — `docs/vps-hardening.md` and `infra/caddy` already exist). The
  request path stays fast; jobs write results back to Postgres and notify
  via the same WebSocket channel. Python-based ML workers can join later —
  the queue is the interface, not the language.

### Pro

- **Rewrites the 2k-line app, not the 12k-line one.** Anniversary's port is
  days-to-weeks; the reverse direction (Alexandria in Flutter) is months.
- **One language end-to-end** (TypeScript), shared zod schemas/types from DB
  to UI — already how Alexandria works today; future projects inherit it.
- **Best possible website.** Alexandria is a text-heavy reading app — DOM
  text rendering, selection, dictionaries, SEO and accessibility all work
  natively; this is exactly where Flutter-web is weakest.
- **Postgres fits the data and the future compute**: the language-learning
  data is deeply relational, and heavy jobs (batch translation, frequency
  analysis, spaced-repetition scheduling) are far easier against SQL than
  Firestore.
- **Sync is trivial** because there is one source of truth; no client-side
  merge logic, no Firestore/Postgres split-brain.
- Low lock-in and low cost: everything runs on Firebase Hosting + Cloud
  Run/Functions today but can move to any VPS unchanged.
- One deploy pipeline; the Android app auto-updates its web content with
  each release (Capacitor live-update or store releases).

### Contra

- **Android app is a wrapped web app.** Perfectly serviceable (camera, GPS,
  push all available via plugins) but not native-feel; complex gestures and
  map performance are a notch below Flutter.
- **Offline support must be built**, not inherited: Firestore's free
  offline persistence is lost, so the bingo module needs an explicit
  cache-and-replay layer to work without signal.
- Anniversary UI is thrown away and rebuilt; Flutter knowledge you invested
  is parked.
- You own a real backend: migrations, backups, and (if realtime is added) a
  stateful WebSocket service to operate.
- iOS later means shipping the same wrapper through App Store review, where
  thin web wrappers occasionally get pushback.

---

## Plan B — Flutter everywhere (app-first)

**Anniversary's Flutter app becomes the hub shell; Alexandria's frontend is
rewritten in Flutter; one codebase compiles to Android, web, and later iOS.
Data lives in Firebase (or behind the existing API — see variant).**

### Architecture

```
flutter-app/
├── lib/
│   ├── shell/        launcher, auth, navigation
│   └── modules/      bingo/, reader/, <future>/
├── android/ · web/ · ios/
└── backend
    ├── B1: Firestore + Cloud Functions (pure Firebase; Postgres retired)
    └── B2: keep Express+Postgres for Alexandria data; Firestore for app-ish data
```

- **Hub shell**: `main.dart` becomes a launcher; each project is a Flutter
  package/module. New ideas are new modules.
- **Alexandria port**: rewrite the React frontend (~6.6k lines) in Flutter.
  In **variant B1** the backend logic (auth, texts, words, translations,
  DeepL calls) also moves into Cloud Functions and the relational schema is
  denormalized into Firestore. In **variant B2** the Express + Postgres
  backend stays and the Flutter app calls it — less migration, but then
  Alexandria data does *not* get Firestore's offline sync, which removes
  much of Plan B's point.
- **Sync**: in B1, Firestore gives realtime listeners + offline persistence
  + conflict handling out of the box on both Android and web — the
  "automatic sync" requirement is essentially free.
- **Heavy compute**: Cloud Functions for small jobs; Cloud Run containers
  triggered via Cloud Tasks for real workloads (Functions time/memory limits
  make them unsuitable for heavy NLP).

### Pro

- **Truly one codebase** for Android + web + future iOS, with native-grade
  Android UX — camera, GPS, maps, and offline behavior (the bingo use case)
  are Flutter's home turf.
- **Automatic sync is built in** (B1): Firestore offline persistence and
  realtime listeners on every platform, no sync code to write or operate.
- **No servers to run** (B1): auth, DB, storage, hosting all managed;
  scales to zero, near-zero cost at hobby scale.
- Builds on the newer codebase's momentum and keeps your Flutter investment.
- Store-quality Android app with no wrapper caveats.

### Contra

- **Rewrites the big project.** ~6.6k lines of React plus, in B1, ~5.2k
  lines of backend re-implemented as Functions — months of work before
  feature parity, all of Alexandria's tested behavior re-validated.
- **Flutter web is a poor fit for Alexandria specifically**: canvas-based
  rendering hurts text selection, in-page dictionary lookups, SEO,
  accessibility, and initial load (multi-MB bundles) — the reading
  experience is the product, and it would get worse on the web.
- **Firestore fights the data model** (B1): languages/texts/words/
  translations are relational; Firestore forces denormalization, makes the
  future "computationally heavy" analytics awkward, and DeepL-style batch
  jobs need Cloud Run anyway.
- Vendor lock-in: auth, data, storage, and sync all coupled to Firebase;
  pricing scales with reads/writes.
- B2 (keeping Express) avoids the backend rewrite but yields a two-database
  architecture where the flagship module has no offline sync — the worst of
  both worlds long-term.

---

## Comparison at a glance

| Criterion | Plan A (TS web platform) | Plan B (Flutter + Firebase) |
|---|---|---|
| Rewrite effort | Small (2k lines Dart → React) | Large (6.6k frontend + up to 5.2k backend) |
| Website quality | Excellent (native DOM, SEO, a11y) | Weak for text-heavy reading |
| Android quality | Good (Capacitor wrapper) | Excellent (native Flutter) |
| Automatic sync | Same API both sides; realtime via WS; offline hand-built | Free via Firestore (B1) |
| Offline use | Must implement for bingo module | Built in |
| Heavy compute later | Natural (SQL + job queue + any-language workers) | Possible but Firestore-shaped friction |
| Ops burden | Own Postgres/API (already the case today) | Near zero (B1) |
| Lock-in / cost control | Low / portable | High / usage-priced |
| Future mini-projects | New module in TS monorepo | New Flutter module |

## Recommendation

**Plan A.** The deciding facts: Alexandria is six times larger and is a
text-first product whose web experience would degrade under Flutter, while
Anniversary is small enough to port in a sprint; Postgres is the right
substrate for both the relational language data and the planned heavy
compute; and "automatic sync" falls out for free once both surfaces are one
client against one API. The genuine losses — native Android feel and free
offline sync — matter mostly for the bingo module, and are covered by
Capacitor's native plugins plus a targeted offline cache for that module
alone.

Choose Plan B only if a native-feeling Android app (and eventual iOS app)
matters more to you than the website, and you accept months of porting
Alexandria plus a worse web reading experience.

### Suggested phasing for Plan A

1. **Platform shell** — rename/restructure the monorepo into the module
   layout above; add the launcher UI; unify auth into one user table.
2. **Port Anniversary** — Postgres schema + API module + React module with
   Leaflet map; migration script Firestore → Postgres, Storage for photos;
   retire the Flutter app once at parity.
3. **Android** — add the Capacitor shell (camera/geolocation plugins),
   publish to Play via internal testing track; add TWA/PWA install for the
   lighter path if preferred.
4. **Sync polish** — WebSocket/SSE invalidation channel; offline
   cache-and-replay for the bingo module.
5. **Compute lane (when needed)** — pg-boss job queue + worker container on
   Cloud Run; jobs report back through the same channel.
