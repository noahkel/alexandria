# Unified Platform Plan: Merging Alexandria + Anniversary

**Status: decided and refined (July 2026).** The platform is built
app-first in **Flutter**, growing out of the anniversary repo, which
becomes the platform home. This repo (alexandria) is ported in as the
reader module and retired after cutover. Detailed working documents live
in the anniversary repo:

- `docs/implementation-plan.md` — target architecture and phases
- `docs/cloudflare-migration.md` — image storage migration (phase 1)

Goal: one product that runs as a **website and an Android app**, hosts both
existing projects as modules, leaves room for future mini-projects, **syncs
data automatically** between app and website, runs **computationally heavy
work** later (e.g. NLP for language learning) — and stays on **free tiers
with no billing account anywhere**.

## Current architecture

```
Flutter app (Android + web builds, iOS possible later)
├── shell/               launcher, auth gate, notifications service
└── modules/             bingo/, reader/ (Alexandria port), <future>/
        │
        ├── Firebase (Spark, card-free): Auth · Firestore (data + offline
        │   sync + realtime) · FCM push · Hosting for the web build
        ├── Cloudflare (free, card-free): R2 bucket for photos, fronted by
        │   a Worker (auth via Firebase ID tokens, presign-free R2 binding;
        │   later also FCM fan-out + DeepL proxy endpoints)
        └── Family NAS (outbound-only, no open ports): nightly rclone
            mirror of R2 + Firestore JSON dumps; candidate host for a
            future compute worker polling a Firestore job queue
```

Key decisions, in the order they were made:

1. **Native/Flutter over the web-first TypeScript option** — the platform
   must later schedule notifications and exact alarms (reboot-surviving,
   offline-capable, `SCHEDULE_EXACT_ALARM`), which only a native app does
   well; web apps and wrappers can't match it. Accepted cost: Alexandria's
   ~6.6k-line React frontend is rewritten in Flutter over time, and the
   website becomes a Flutter-web build (weaker for text-heavy reading;
   mitigated with a static landing page and keeping the React site live
   until the reader module reaches parity).
2. **Images on Cloudflare R2, not Firebase Storage** — Cloud Storage for
   Firebase requires the billed Blaze plan since Feb 2026, and the photos
   were nearing the old 5 GB limit anyway. R2 gives 10 GB free with zero
   egress and no card; a free Worker proxies uploads/downloads with
   Firebase ID token auth, and Firestore stores host-agnostic object keys.
   Client-side compression (≤1600 px, ~85%) multiplies the headroom.
   The Worker also replaces Cloud Functions (Blaze-only) for glue: FCM
   fan-out and the DeepL proxy.
3. **NAS as backup, not as primary host** — a ~100 GB share on a family
   NAS mirrors R2 and Firestore nightly via outbound-only jobs. It was
   considered as the primary storage/backend but rejected for that role:
   residential availability, security blast-radius on shared family
   hardware, and single-copy durability. It remains the candidate for
   free heavy compute later (worker polling a job queue, no inbound
   exposure), alongside Cloud Run's free quota if billing is ever enabled.

## What this means for this repo

- The Express + Postgres backend and React frontend keep running unchanged
  until the Flutter reader module reaches parity (implementation-plan
  phase 4), then redirect and retire; a final DB dump is kept.
- Reader data (users, texts, words, translations, progress) migrates
  Postgres → Firestore via a one-off script; users migrate with their
  bcrypt hashes via `firebase auth:import`; DeepL calls move behind the
  Cloudflare Worker so the key stays server-side.
- No new features land here; anything worth building goes into the
  platform repo as part of the reader module.

---

## Decision record (original comparison, condensed)

State of the projects at decision time (2026-07-28):

| | Alexandria | Anniversary |
|---|---|---|
| Size | ~12,000 lines TS (5.2k backend, 6.6k frontend + shared) | ~2,000 lines Dart |
| Stack | React 19 + Vite; Express 5 + Postgres; custom JWT auth | Flutter; Firebase Auth + Firestore + Storage |
| Nature | Text-heavy reading/learning app; relational data; DeepL | On-the-go bingo goals: camera photos, GPS, map |

The stacks conflicted on every axis (language, UI, database, auth), so
merging meant picking one side as the platform and porting the other. Two
plans were compared:

**Plan A — TypeScript web platform (not chosen).** One React web app with
per-project modules; Android via a Capacitor wrapper; Express + Postgres
as single source of truth; sync trivially via one API plus WebSockets;
compute via a job-queue worker. Its strengths: port the 2k-line app
instead of the 12k-line one, best-possible website for a reading product,
SQL for relational data and heavy jobs, low lock-in. Rejected because the
Android app would be a wrapped web app — adequate for camera/GPS, but
second-class for the exact alarms and reliable notifications the platform
needs, which decided the question.

**Plan B — Flutter everywhere (chosen, then refined).** One Flutter
codebase compiling to Android + web; Firestore for data with built-in
offline sync and realtime listeners; native notification/alarm support.
Known costs accepted: the large Alexandria rewrite, the weaker Flutter-web
reading experience, and Firestore being a worse fit than SQL for the
relational reader data. Two parts of the original Plan B were later
replaced by the free-tier refinements above: Firebase Storage (now
Blaze-only) gave way to R2 + Worker, and Cloud Functions gave way to the
same Worker. A full swap to Supabase was also considered and rejected
(free tier too small to solve the image problem; no built-in offline
sync), as was making the family NAS the primary backend (see decision 3).
