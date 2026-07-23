import Link from 'next/link';
import type { Metadata } from 'next';
import TrackedCTA from '../../components/site/tracked-cta';
import EditorialShell from '../../components/site/editorial-shell';
import { ScrollReveal } from '../../components/shared/scroll-reveal';
import { APP_STORE_URL } from '../../lib/links';

export const metadata: Metadata = {
  title: { absolute: 'Mood Tracker That Connects to HRV | Therma: Emotional Wellness' },
  description: "Therma is the mood tracker that connects to HRV. Native Oura, Whoop, and Apple Watch integration. Weekly insight reveals that explain how your HRV, sleep, and mood move together.",
  alternates: { canonical: 'https://www.therma.one/hrv-mood-tracker' },
  openGraph: { title: 'Mood Tracker That Connects to HRV | Therma: Emotional Wellness', description: "Native Oura, Whoop, and Apple Watch integration. Weekly insight reveals that explain how your HRV and mood move together.", url: 'https://www.therma.one/hrv-mood-tracker', siteName: 'Therma: Emotional Wellness', type: 'article' },
  twitter: { card: 'summary_large_image', title: 'Mood Tracker That Connects to HRV | Therma: Emotional Wellness', description: "Native Oura, Whoop, and Apple Watch integration. Weekly insight reveals that explain how your HRV and mood move together." },
};

export default function HrvMoodTrackerPage() {
  const today = new Date().toISOString().split('T')[0];
  const canonical = 'https://www.therma.one/hrv-mood-tracker';

  const articleSchema = { '@context': 'https://schema.org', '@type': 'Article', headline: 'Mood Tracker That Connects to HRV', description: "The mood tracker that connects to HRV.", url: canonical, datePublished: today, dateModified: today, author: { '@type': 'Person', name: 'Sam Rantisi', url: 'https://www.therma.one/about' }, publisher: { '@type': 'Organization', name: 'Therma: Emotional Wellness' }, mainEntityOfPage: { '@type': 'WebPage', '@id': canonical } };
  const breadcrumbSchema = { '@context': 'https://schema.org', '@type': 'BreadcrumbList', itemListElement: [{ '@type': 'ListItem', position: 1, name: 'Home', item: 'https://www.therma.one' }, { '@type': 'ListItem', position: 2, name: 'Mood Tracker That Connects to HRV', item: canonical }] };

  const faqs = [
    { q: 'What is an HRV mood tracker?', a: 'An HRV mood tracker is an app that connects your heart rate variability data to your daily mood logs. HRV is one of the strongest physiological signals of stress, recovery, and emotional state.' },
    { q: 'Does Therma connect to Oura?', a: 'Yes. Therma is being built with native Oura integration, pulling sleep stages, HRV, readiness, and recovery data directly.' },
    { q: 'Does Therma work with Whoop or Apple Watch?', a: 'Yes. Therma supports Whoop and Apple Watch alongside Oura. Whoop is especially important because most mood trackers cannot see Whoop HRV at all.' },
    { q: 'Why does HRV matter for mood tracking?', a: 'Low HRV correlates with stress, fatigue, poor recovery, and often a rougher mood. A mood tracker that does not see HRV is missing one of the most load-bearing variables.' },
    { q: 'How is Therma different from Welltory or HRV4Training?', a: 'Those are HRV-first apps that added mood logging. Therma is a mood-first app that integrates HRV deeply.' },
    { q: 'Is my HRV data private?', a: 'Yes. Therma is encrypted by default. Your data is encrypted, isolated, and access-audited.' },
    { q: 'When can I use Therma?', a: 'Therma is available now on the App Store for iOS.' },
  ];

  const faqSchema = { '@context': 'https://schema.org', '@type': 'FAQPage', mainEntity: faqs.map((faq) => ({ '@type': 'Question', name: faq.q, acceptedAnswer: { '@type': 'Answer', text: faq.a } })) };

  const integrations = [
    { title: 'Oura', body: 'Direct Oura API connection. Pulls sleep stages, HRV, readiness, and temperature deviation without the Apple Health bridge.' },
    { title: 'Whoop', body: 'Native Whoop integration. Whoop does not push data to Apple Health by default, so most mood trackers cannot see Whoop HRV at all. Therma connects directly.' },
    { title: 'Apple Watch', body: 'Full Apple Health sync for users who prefer the Apple ecosystem. HRV, sleep, activity, and workouts flow in automatically.' },
    { title: 'Garmin and Fitbit', body: 'On the roadmap. We are prioritizing Oura, Whoop, and Apple Watch first because those are the wearables our users already use.' },
  ];

  return (
    <EditorialShell>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(articleSchema) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbSchema) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(faqSchema) }} />

      <div className="mx-auto max-w-[720px] px-5 py-16 sm:px-8 sm:py-24">
        <nav className="mb-12 flex items-center gap-1.5 font-body text-xs" style={{ color: 'var(--theme-text-muted)' }} aria-label="Breadcrumb">
          <Link href="/" className="transition-colors hover:opacity-80" style={{ color: 'var(--theme-text-muted)' }}>Home</Link>
          <span className="opacity-40" aria-hidden="true">/</span>
          <span style={{ color: 'var(--theme-text)' }}>Mood tracker that connects to HRV</span>
        </nav>

        <ScrollReveal>
          <header className="pb-4">
            <div className="mb-5 inline-flex items-center gap-2.5 font-body text-xs font-medium uppercase tracking-[0.14em]">
              <span className="block h-[2px] w-5 rounded-full" aria-hidden="true" style={{ backgroundColor: 'var(--color-coral)' }} />
              <span style={{ color: 'var(--color-coral)' }}>HRV + mood</span>
            </div>
            <h1 className="mb-6 font-display text-[clamp(38px,6vw,56px)] leading-[1.08] tracking-tight" style={{ color: 'var(--theme-text)' }}>
              The mood tracker that actually connects to your HRV.
            </h1>
            <p className="mb-12 max-w-[620px] font-body text-[17px] leading-[1.75]" style={{ color: 'var(--theme-text-soft)' }}>
              Native Oura, Whoop, and Apple Watch integration. Weekly insight reveals that explain how your HRV, sleep, and mood move together. Not another chart you have to read yourself.
            </p>
          </header>
        </ScrollReveal>

        <div className="my-14 h-px" style={{ backgroundColor: 'var(--theme-hairline)' }} />

        {[
          { title: 'Why HRV is the missing variable in mood tracking', paragraphs: ['Heart rate variability is one of the strongest physiological signals of stress, recovery, and emotional state. Low HRV tends to correlate with stress and fatigue. High HRV tends to correlate with rest and resilience.', 'Mood trackers that ignore HRV are missing the single most useful data point for understanding why you feel the way you feel.', 'Therma is built to do the interpretation work. The AI weekly insight reveal connects your HRV to your sleep, your caffeine, your workouts, your conversations, and your mood.'] },
          { title: 'The weekly insight reveal', paragraphs: ['Every week, Therma produces a short narrative that connects your mood entries to the health data your wearables captured. Not a chart dump. A paragraph that tells you what happened.', 'You might learn that your HRV dropped 12 percent on nights when you had more than one drink, or that your best days started with workouts scheduled before 9 AM. Patterns you would never catch yourself.', 'The insight reveal is the core of Therma. The daily check-in is the raw material. Your wearable data is the context. The AI is the interpreter.'] },
        ].map((section, i) => (
          <ScrollReveal key={i} delay={i * 60}>
            <section className="mb-14">
              <h2 className="mb-4 font-display text-[clamp(22px,3vw,28px)] leading-[1.2] tracking-tight" style={{ color: 'var(--theme-text)' }}>{section.title}</h2>
              {section.paragraphs.map((p, j) => <p key={j} className="mb-5 font-body text-base leading-[1.85]" style={{ color: 'var(--theme-text-soft)' }}>{p}</p>)}
            </section>
          </ScrollReveal>
        ))}

        <ScrollReveal>
          <section className="mb-14">
            <h2 className="mb-4 font-display text-[clamp(22px,3vw,28px)] leading-[1.2] tracking-tight" style={{ color: 'var(--theme-text)' }}>Native integrations, not an Apple Health bridge</h2>
            <p className="mb-5 font-body text-base leading-[1.85]" style={{ color: 'var(--theme-text-soft)' }}>Most mood-tracking apps that claim HRV support route data through Apple Health. That works for a rough number but loses context. Therma is being built with direct integrations.</p>
            <ul className="space-y-4">
              {integrations.map((item) => (
                <li key={item.title} className="flex items-start gap-3">
                  <span className="mt-1.5 shrink-0" style={{ color: 'var(--color-coral)' }} aria-hidden="true">&#x25C6;</span>
                  <span className="font-body text-sm leading-relaxed" style={{ color: 'var(--theme-text-soft)' }}><strong style={{ color: 'var(--theme-text)' }}>{item.title}.</strong> {item.body}</span>
                </li>
              ))}
            </ul>
          </section>
        </ScrollReveal>

        <ScrollReveal>
          <section className="mb-14">
            <h2 className="mb-4 font-display text-[clamp(22px,3vw,28px)] leading-[1.2] tracking-tight" style={{ color: 'var(--theme-text)' }}>How Therma compares to other HRV-aware apps</h2>
            <p className="mb-5 font-body text-base leading-[1.85]" style={{ color: 'var(--theme-text-soft)' }}>
              A few other apps touch HRV. Most are HRV-first tools with a mood slider bolted on. Therma is the opposite: a mood-first tool with deep HRV built in.{' '}
              <Link href="/best/mood-trackers-that-connect-to-hrv" className="underline underline-offset-2" style={{ color: 'var(--color-coral)' }}>See the full ranked roundup</Link>.
            </p>
          </section>
        </ScrollReveal>

        <div className="my-14 h-px" style={{ backgroundColor: 'var(--theme-hairline)' }} />

        <ScrollReveal>
          <section className="mb-14">
            <h2 className="mb-6 font-display text-[clamp(22px,3vw,28px)] leading-[1.2] tracking-tight" style={{ color: 'var(--theme-text)' }}>Common questions</h2>
            <div className="space-y-0">
              {faqs.map((faq, i) => (
                <details key={i} className="group border-b first:border-t" style={{ borderColor: 'var(--theme-hairline)' }}>
                  <summary className="flex cursor-pointer list-none items-center justify-between py-6 font-display text-base leading-[1.4] [&::-webkit-details-marker]:hidden" style={{ color: 'var(--theme-text)' }}>
                    {faq.q}
                    <span className="ml-4 shrink-0 text-lg transition-transform duration-200 group-open:rotate-45" style={{ color: 'var(--theme-text-muted)' }} aria-hidden="true">+</span>
                  </summary>
                  <p className="m-0 pb-6 font-body text-sm leading-[1.8]" style={{ color: 'var(--theme-text-soft)' }}>{faq.a}</p>
                </details>
              ))}
            </div>
          </section>
        </ScrollReveal>

        <ScrollReveal>
          <div className="relative my-16 overflow-hidden rounded-[40px] px-8 py-12 sm:px-14 sm:py-16" style={{ backgroundColor: '#050F1A' }}>
            <div className="pointer-events-none absolute -right-16 -top-16 h-[280px] w-[280px]" aria-hidden="true" style={{ background: 'radial-gradient(circle, rgba(232,121,58,0.12) 0%, transparent 70%)' }} />
            <p className="relative mb-4 font-body text-[11px] font-medium uppercase tracking-[0.16em]" style={{ color: 'var(--color-coral)' }}>Try Therma</p>
            <h2 className="relative mb-4 font-display text-[clamp(24px,3.5vw,34px)] leading-[1.2] tracking-tight text-white">Connect your HRV to your mood. Let the AI do the interpreting.</h2>
            <p className="relative mb-8 max-w-[500px] font-body text-sm leading-[1.75] text-white/60">Native Oura, Whoop, and Apple Watch integration. Weekly insights that connect HRV and mood. Available now on iOS.</p>
            <TrackedCTA href={APP_STORE_URL} appStoreAttribution location="hrv_mood_tracker_bottom" label="Download on the App Store" className="relative inline-flex items-center gap-2 rounded-pill bg-white px-8 py-3 font-body text-sm font-medium text-brand-ink no-underline transition-opacity hover:opacity-90">
              Download on the App Store
            </TrackedCTA>
          </div>
        </ScrollReveal>
      </div>
    </EditorialShell>
  );
}
