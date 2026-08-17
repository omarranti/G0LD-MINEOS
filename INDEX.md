# Catalog

Scan by *problem*, not by name. Each row links to its `SPEC.md`.

| Feature | Tags | Source | Stack | Reuse |
|---------|------|--------|-------|-------|
| [Action Items Queue](features/action-items-queue/SPEC.md) | tasks, productivity, ai-origin | personal-OS dashboard | Next.js 15 + Server Actions + Neon | adapt-the-shape |
| [Career Timeline + Skills](features/career-timeline-skills/SPEC.md) | career, timeline, skills | personal-OS dashboard | Next.js 15 + Server Actions + Neon | adapt-the-shape |
| [Goal / Idea Builder](features/goal-idea-builder/SPEC.md) | goals, planning, dashboard | personal-OS dashboard | Next.js 15 + Server Actions + Neon | adapt-the-shape |
| [Finances + Runway](features/finances-runway/SPEC.md) | finance, runway, dashboard | personal-OS dashboard | Next.js 15 + Server Actions + Neon | reference-only |
| [Journal Log](features/journal-log/SPEC.md) | journal, dashboard, notes | personal-OS dashboard | Next.js 15 + Server Actions + Neon | adapt-the-shape |
| [Prospects CRM](features/prospects-crm/SPEC.md) | crm, prospects, dashboard | personal-OS dashboard | Next.js 15 + Server Actions + Neon | adapt-the-shape |
| [LLM Transcript Corpus Ingest (map-reduce, SSE progress, weighted FTS)](features/llm-transcript-corpus-ingest/SPEC.md) | llm, map-reduce, ingestion, sse, streaming, full-text-search, tsvector, knowledge-base, taxonomy | wellness web app (marketing site + team console) | Next.js 15 App Router + Drizzle + Postgres + Anthropic Messages API | adapt-the-shape |
| [Multi-Provider Metrics Snapshot (null = unavailable, cron writes, pages read)](features/multi-provider-metrics-snapshot/SPEC.md) | dashboard, integrations, cron, aggregation, kv-cache, resilience, vercel-cron, metrics | wellness web app (marketing site + team console) | Next.js 15 App Router + Drizzle + Postgres + Vercel Cron | drop-in |
| [Canvas Multi-Ratio Slide Exporter](features/canvas-multi-ratio-slide-exporter/SPEC.md) | social-assets, canvas, export, generative-art, seeded-rng, playwright, marketing, automation | wellness web app (marketing site + team console) | Next.js App Router client page (Canvas 2D) + Playwright driver | adapt-the-shape |
| [Content Truth Gates](features/content-truth-gates/SPEC.md) | ci, build-gate, content-integrity, facts, citations, pseo, seo, marketing | wellness web app (marketing site + team console) | Node scripts (.mjs prebuild gate + tsx audit, stdlib only) | adapt-the-shape |
| [Build-Correctness Linters (caching, SEO, dead instrumentation)](features/build-correctness-linters/SPEC.md) | ci, lint, correctness, caching, seo, analytics, posthog, nextjs, static-analysis | directory / marketplace web app | Next.js 15 + Prisma + PostHog (tsx scripts, stdlib only) | drop-in |
| [PostHog Pre-Init Capture Buffer](features/posthog-preinit-capture-buffer/SPEC.md) | analytics, posthog, react, race-condition, instrumentation, conventions | directory / marketplace web app | Next.js 15 + posthog-js + next-auth | drop-in |
| [First-Party Engagement Counters](features/first-party-engagement-counters/SPEC.md) | analytics, metrics, first-party, sendbeacon, prisma, vendor-dashboard, monetization | directory / marketplace web app | Next.js 15 + Prisma + Postgres | drop-in |
| [Save-Intent Replay Across Auth](features/save-intent-replay-across-auth/SPEC.md) | growth, activation, auth, signup-funnel, optimistic-ui, localstorage, analytics | directory / marketplace web app | Next.js 15 App Router + React 19 + NextAuth + Prisma + Postgres | drop-in |
| [Feature Gating Kit](features/feature-gating-kit/SPEC.md) | paywall, monetization, freemium, gating, metering, cro, analytics, a11y | directory / marketplace web app | Next.js 15 App Router + React 19 + NextAuth session + PostHog + Tailwind | adapt-the-shape |
| [Bulk Import with Fuzzy Cross-Source Dedup](features/bulk-import-fuzzy-dedup/SPEC.md) | data-import, dedup, fuzzy-matching, etl, directory, data-quality, provenance | directory / marketplace web app | TypeScript scripts (tsx) + JSON/CSV pipeline | adapt-the-shape |
| [Entity Claim with Domain-Match Auto-Approval](features/entity-claim-auto-approval/SPEC.md) | claims, ownership-verification, auto-approval, directory, marketplace, mobile-parity, abuse-limits | directory / marketplace web app | Next.js 15 + Prisma + zod | drop-in / adapt-the-shape |
| [Calendar-Aware Quiet Windows](features/calendar-quiet-windows/SPEC.md) | calendar, timezones, suppression, fail-closed, commerce, notifications, codegen | directory / marketplace web app | Next.js 15 App Router + Prisma + Postgres | adapt-the-shape |
| [Sliding-Window Rate Limit (Upstash-backed, serverless-safe)](features/sliding-window-rate-limit/SPEC.md) | infra, security, api, serverless, redis | directory / marketplace web app | TypeScript + @upstash/redis + @upstash/ratelimit | drop-in |
| [Spec-Locked Feature Workflow](features/spec-locked-feature-workflow/SPEC.md) | process, specs, workflow, contractors, ai-assisted, meta-pattern | iOS app (spec-driven contractor workflow) | markdown + git filesystem convention | drop-in |
| [iOS Tiered Content Load (live, cache, bundled)](features/ios-tiered-content-load/SPEC.md) | ios, offline, caching, resilience, swift-concurrency, content | directory iOS app | Swift 6 + SwiftUI @Observable + UserDefaults | adapt-the-shape |
| [iOS Geo Anchor + City Snap (pin vs track)](features/ios-geo-anchor-city-snap/SPEC.md) | ios, location, corelocation, geo, permissions, swift-concurrency | directory iOS app | Swift 6 + SwiftUI @Observable + CoreLocation | drop-in / adapt-the-shape |
| [iOS Scheduled Window Gate](features/ios-scheduled-window-gate/SPEC.md) | ios, swiftui, scheduling, time-window, gating, timer, observable | directory iOS app | Swift / SwiftUI (@Observable) | adapt-the-shape |
| [iOS Runtime Bilingual + RTL](features/ios-runtime-bilingual-rtl/SPEC.md) | ios, swiftui, i18n, localization, rtl, arabic, bilingual | clinic iOS app (bilingual) | Swift / SwiftUI (ObservableObject) | drop-in |
| [iOS Typed Routes + Deep-Linkable Wizard](features/ios-typed-routes-deeplink-wizard/SPEC.md) | navigation, deep-link, wizard, multi-step, booking, forms, focus-state, i18n | clinic iOS app (bilingual) | SwiftUI NavigationStack, iOS 16+ | drop-in / adapt-the-shape |
| [iOS Streak + Freeze-Pass Engine](features/ios-streak-freeze-pass-engine/SPEC.md) | gamification, streak, retention, ios, swiftui, calendar-math | habit iOS app | Swift / SwiftUI + Calendar | adapt-the-shape |
| [iOS Streak-Risk Notifications](features/ios-streak-risk-notifications/SPEC.md) | notifications, retention, streak, ios, local-notifications | habit iOS app | Swift / UserNotifications | drop-in |
| [iOS Widget State Mirror](features/ios-widget-state-mirror/SPEC.md) | widget, widgetkit, ios, app-group, state-sync, lock-screen | habit iOS app | Swift / SwiftUI + WidgetKit | drop-in |
| [iOS Photo Proof Gate](features/ios-photo-proof-gate/SPEC.md) | vision, on-device-ml, camera, photo, permissions, gamification, habit, privacy | habit iOS app | SwiftUI + Vision, iOS 17+ | adapt-the-shape |
| [iOS Hold-to-Confirm Ritual](features/ios-hold-to-confirm-ritual/SPEC.md) | gamification, interaction, gesture, haptics, animation, streak, habit, celebration | habit iOS app | SwiftUI, iOS 17+ | adapt-the-shape |
| [Marketing Section Kit](features/marketing-section-kit/SPEC.md) | marketing, landing-page, sections, layout, conversion, structure | website template | Next.js + Tailwind + lucide | adapt-the-shape |
| [Web Design Token System](features/web-design-token-system/SPEC.md) | design-system, tokens, tailwind, css, dark-mode, accessibility | website template | Tailwind v3 + CSS variables | adapt-the-shape |
| [Website Launch Gate](features/website-launch-gate/SPEC.md) | website, launch, qa, checklist, seo, accessibility, performance | website standard | framework-agnostic | reference-only |
| [iOS Sign in with Google (BFF)](features/ios-google-sign-in/SPEC.md) | auth, ios, google, oauth, swiftui, bff | iOS app | Swift / SwiftUI + GoogleSignIn | reference-only |
| [Programmatic SEO with Inventory Gate](features/pseo-inventory-gated-pages/SPEC.md) | seo, pseo, programmatic, nextjs, directory | directory web app | Next.js 15 (ISR) + Prisma | adapt-the-shape |
| [Email Provider Failover (SES/Resend)](features/email-provider-failover/SPEC.md) | email, infra, transactional, failover, ses, resend | directory web app | TS + @aws-sdk/client-ses + resend | drop-in |
| [PostHog Server-Side Capture](features/posthog-server-capture/SPEC.md) | analytics, posthog, server, webhooks, events | web app | TS (fetch, no SDK) | drop-in |
| [Neon Dev/Prod Branch Safety](features/neon-dev-prod-branch-safety/SPEC.md) | infra, neon, database, safety, postgres, prisma | web app | Neon branches + Prisma + Node guard | reference-only |
| [Stripe Subscription Webhook](features/stripe-subscription-webhook/SPEC.md) | payments, stripe, webhook, idempotency, subscriptions, concurrency | subscription SaaS | Next.js 15 + Prisma + Stripe | adapt-the-shape |
| [Profile Next-Steps Engine](features/profile-next-steps-engine/SPEC.md) | personalization, onboarding, profile, ai-context, derived-signals | personal-OS dashboard | Next.js 15 + TS (pure functions) | adapt-the-shape |
| [Social Presence Tracker](features/social-presence-tracker/SPEC.md) | social, dashboard, config-driven, personal-brand | personal-OS dashboard | Next.js 15 App Router (config-only, no persistence) | adapt-the-shape |
| [AI Insights Engine (suggest + apply)](features/ai-insights-engine/SPEC.md) | ai, insights, write-back | personal-OS dashboard | Next.js 15 + Anthropic + Neon | adapt-the-shape |
| [Neon Data Repo Layer (backbone)](features/neon-data-repo-layer/SPEC.md) | infra, data-layer, neon | personal-OS dashboard | Next.js 15 + Neon Postgres | adapt-the-shape |
| [Profile Questionnaire (schema-driven)](features/profile-questionnaire/SPEC.md) | onboarding, profile, ai-grounding | personal-OS dashboard | Next.js 15 + Neon (jsonb) | adapt-the-shape |
| [Dashboard App Shell (config-driven)](features/dashboard-app-shell/SPEC.md) | layout, navigation, shell | personal-OS dashboard | Next.js 15 + Tailwind | adapt-the-shape |
| [Neon Single-Owner CRUD Module](features/neon-single-owner-crud/SPEC.md) | crud, neon, server-actions, dashboard, data-layer, pattern | personal-OS dashboard | Next.js 15 + Server Actions + Neon | adapt-the-shape |
| [Discovery Tool (AI idea builder)](features/discovery-tool/SPEC.md) | ai, ideation, dashboard | personal-OS dashboard | Next.js 15 + Neon + Anthropic | adapt-the-shape |
| [Network Map](features/network-map/SPEC.md) | network, crm, visualization | personal-OS dashboard | Next.js 15 + Framer Motion + SVG + Neon | adapt-the-shape |
| [Smart Chat over your data](features/smart-chat-over-data/SPEC.md) | ai, assistant, anthropic | personal-OS dashboard | Next.js 15 + Anthropic SDK + Neon | adapt-the-shape |
| [Dashboard Integrations Panel](features/dashboard-integrations-panel/SPEC.md) | integrations, oauth, calendar | personal-OS dashboard | Next.js 15 + Google Calendar | reference-only |
| [Members Access-Code Gate](features/members-access-code-gate/SPEC.md) | access, gate, privacy | members-site | Next.js 15 + Server Actions | adapt-the-shape |
| [3D Scroll-Reveal Intro](features/intro-3d-scroll-reveal/SPEC.md) | animation, 3d, intro, ui | marketing site | Next.js 15 + Framer Motion | adapt-the-shape |
| [Scroll Reveal on View](features/scroll-reveal-on-view/SPEC.md) | animation, ui | marketing site | Next.js 15 + framer-motion | drop-in |
| [News Scraper to Static Feed](features/news-scraper-to-static-feed/SPEC.md) | scraping, data-pipeline, dashboard | personal-OS dashboard | Python + static dashboard | reference-only |
| [iOS Email + Password Auth](features/ios-email-password-auth/SPEC.md) | auth, ios, email-password | iOS app | Swift / SwiftUI | adapt-the-shape |
| [iOS Keychain Token Store](features/ios-keychain-token-store/SPEC.md) | ios, security, storage | iOS app | Swift | drop-in |
| [iOS Sign in with Apple](features/ios-apple-sign-in/SPEC.md) | auth, ios, apple | iOS app | Swift / AuthenticationServices | adapt-the-shape |
| [iOS Deterministic UUID from ID](features/ios-deterministic-uuid-from-id/SPEC.md) | ios, identity, data-modeling | iOS app | Swift / CryptoKit | drop-in |
| [iOS Async API Client](features/ios-api-client/SPEC.md) | ios, networking, infra | iOS app | Swift / URLSession | drop-in |
| [Recently Viewed](features/recently-viewed/SPEC.md) | ux, personalization | web app | Next.js 15 (browser) | drop-in |
| [Mood Ring Check-in Card](features/mood-ring-checkin-card/SPEC.md) | onboarding, engagement, conversion | wellness web app | Next.js 15 (client) | adapt-the-shape |
| [A/B Copy Testing](features/ab-copy-testing/SPEC.md) | cro, experimentation, copy | web app | Next.js 15 + localStorage | reference-only |
| [Scroll Sticky CTA](features/scroll-sticky-cta/SPEC.md) | cro, conversion, ui | web app | Next.js 15 + Tailwind | adapt-the-shape |
| [Consent-Gated Analytics](features/consent-gated-analytics/SPEC.md) | privacy, gdpr, consent | web app | Next.js + React | reference-only |
| [Email Nurture Sequence](features/email-nurture-sequence/SPEC.md) | lifecycle, email, retention | web app | Next.js 15 + Drizzle + Resend | adapt-the-shape |
| [UTM + App Store Attribution](features/utm-and-appstore-attribution/SPEC.md) | attribution, growth, analytics | web app | Next.js 15 (localStorage) | drop-in |
| [SSRF URL Guard](features/ssrf-url-guard/SPEC.md) | security, ssrf, server | web app | Next.js + Node runtime | drop-in |
| [In-Memory Rate Limit](features/token-bucket-rate-limit/SPEC.md) | infra, security, api | web app | TS (in-memory) | adapt-the-shape |
| [PIN Auth Gate](features/pin-auth-gate/SPEC.md) | auth, admin, security | web app | Next.js 15 + Drizzle + Node crypto | adapt-the-shape |
| [Social Share Links](features/social-share-cards/SPEC.md) | growth, sharing, social | web app | TS (browser, no deps) | drop-in |

<!-- Add new rows at the top of the table body as features are captured. -->
