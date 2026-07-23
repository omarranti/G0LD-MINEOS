'use client';

import { useMemo, useRef, useState } from 'react';
import { trackEvent } from '../../lib/analytics';
import { APP_STORE_URL } from '../../lib/links';
import { ScrollReveal } from '../shared/scroll-reveal';

type Step = 'identity' | 'behavior' | 'specificity' | 'mirror' | 'cta';
type Identity = 'hot' | 'gap' | 'tried' | 'other';
type Behavior = 'nothing' | 'journals' | 'meditation' | 'therapy' | 'few';
type Specificity = 'shifts' | 'energy' | 'okay' | 'unsure';

type Chip = { id: string; label: string };
type Entry = { id: string; kind: 'bot' | 'pick' | 'rule'; text?: string; italic?: boolean; emphasis?: boolean };

const C = {
  text: 'var(--theme-text)',
  textSoft: 'var(--theme-text-soft)',
  textMute: 'var(--theme-text-muted)',
  hairline: 'var(--theme-hairline)',
  hairlineStrong: 'var(--theme-hairline-strong)',
  hoverBg: 'var(--theme-bg-muted)',
  bg: 'var(--theme-bg)',
  gold: '#C8A96E',
  goldRing: 'rgba(200, 169, 110, 0.6)',
  coral: 'var(--color-coral)',
};

const SERIF = "PPPangaia, 'Playfair Display', Georgia, serif";
const SANS = "Inter, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif";
const EASE = 'cubic-bezier(0.22, 0.61, 0.36, 1)';

const IDENTITY: Chip[] = [
  { id: 'hot', label: "running hot. shipping a lot. can't slow down." },
  { id: 'gap', label: 'look fine on the outside. feel off on the inside.' },
  { id: 'tried', label: "tried journaling. didn't stick." },
  { id: 'other', label: 'something else' },
];

const BEHAVIOR: Chip[] = [
  { id: 'nothing', label: 'nothing yet' },
  { id: 'journals', label: 'journaling apps' },
  { id: 'meditation', label: 'meditation apps' },
  { id: 'therapy', label: 'therapy' },
  { id: 'few', label: 'a few of those' },
];

const SPECIFICITY: Chip[] = [
  { id: 'shifts', label: 'why my mood keeps shifting' },
  { id: 'energy', label: "what's actually driving my energy" },
  { id: 'okay', label: "whether i'm okay or just coping" },
  { id: 'unsure', label: 'honestly, not sure yet' },
];

const MIRROR: Record<Identity, [string, string]> = {
  hot: [
    "you don't need another tool. you need 60 seconds where nothing's being optimized.",
    "that's therma. one honest question a day. on sunday you see what's been running under the hood.",
  ],
  gap: [
    'that gap has a name. too proud to journal, not in crisis enough for therapy.',
    'therma sits in that gap. 60 seconds. one question. weekly pattern.',
  ],
  tried: [
    'journaling fails because the page is blank. therma asks the one question worth answering today.',
    '60 seconds. then it ties what you feel to your sleep, hrv, workouts.',
  ],
  other: [
    "most check-in apps assume something's wrong. therma doesn't.",
    '60 seconds a day. one honest question. weekly reveal.',
  ],
};

function appStoreHref(identity: Identity | null) {
  const url = new URL(APP_STORE_URL);
  url.searchParams.set('pt', '127065859');
  url.searchParams.set('ct', `chat_v3_${identity ?? 'unknown'}`);
  url.searchParams.set('mt', '8');
  return url.toString();
}

export default function HomeQuizCard() {
  const [step, setStep] = useState<Step>('identity');
  const [identity, setIdentity] = useState<Identity | null>(null);
  const [behavior, setBehavior] = useState<Behavior | null>(null);
  const [specificity, setSpecificity] = useState<Specificity | null>(null);
  const [entries, setEntries] = useState<Entry[]>([
    { id: 'q-identity', kind: 'bot', text: 'which one sounds most like you right now?' },
  ]);
  const startedRef = useRef(false);

  const fireStart = () => {
    if (startedRef.current) return;
    startedRef.current = true;
    trackEvent('chat_opened', { source: 'home_card' });
    trackEvent('chat_step_view', { step: 'identity' });
  };

  const advance = (entry: Entry[]) => setEntries((prev) => [...prev, ...entry]);

  const pickIdentity = (a: Chip) => {
    fireStart();
    setIdentity(a.id as Identity);
    advance([
      { id: `p-${Date.now()}`, kind: 'pick', text: a.label },
      { id: 'q-behavior', kind: 'bot', text: 'what have you tried?' },
    ]);
    setStep('behavior');
    trackEvent('chat_step_answer', { step: 'identity', answer: a.id });
    trackEvent('chat_step_view', { step: 'behavior' });
  };

  const pickBehavior = (a: Chip) => {
    setBehavior(a.id as Behavior);
    advance([
      { id: `p-${Date.now()}`, kind: 'pick', text: a.label },
      { id: 'q-specificity', kind: 'bot', text: "if one thing got clearer this week, you'd want it to be" },
    ]);
    setStep('specificity');
    trackEvent('chat_step_answer', { step: 'behavior', answer: a.id });
    trackEvent('chat_step_view', { step: 'specificity' });
  };

  const pickSpecificity = (a: Chip) => {
    setSpecificity(a.id as Specificity);
    const lines = MIRROR[identity ?? 'other'];
    advance([
      { id: `p-${Date.now()}`, kind: 'pick', text: a.label },
      { id: `r-${Date.now()}`, kind: 'rule' },
      { id: `m1-${Date.now()}`, kind: 'bot', text: lines[0], italic: true, emphasis: true },
      { id: `m2-${Date.now()}`, kind: 'bot', text: lines[1], italic: true, emphasis: true },
    ]);
    setStep('cta');
    trackEvent('chat_step_answer', { step: 'specificity', answer: a.id });
    trackEvent('chat_step_view', { step: 'cta' });
  };

  const handleCta = () => {
    trackEvent('chat_cta_tap', {
      identity: identity ?? 'unknown',
      behavior: behavior ?? 'unknown',
      specificity: specificity ?? 'unknown',
      source: 'home_card',
    });
    if (typeof window !== 'undefined' && (window as { fbq?: (...args: unknown[]) => void }).fbq) {
      try {
        (window as { fbq?: (...args: unknown[]) => void }).fbq?.('track', 'Lead', { content_name: 'home_quiz_card' });
      } catch {}
    }
  };

  const restart = () => {
    setIdentity(null);
    setBehavior(null);
    setSpecificity(null);
    setEntries([{ id: 'q-identity', kind: 'bot', text: 'which one sounds most like you right now?' }]);
    setStep('identity');
    startedRef.current = false;
  };

  const ctaHref = useMemo(() => appStoreHref(identity), [identity]);

  const activeChips =
    step === 'identity' ? IDENTITY : step === 'behavior' ? BEHAVIOR : step === 'specificity' ? SPECIFICITY : null;
  const onPick =
    step === 'identity' ? pickIdentity : step === 'behavior' ? pickBehavior : step === 'specificity' ? pickSpecificity : null;

  return (
    <section
      aria-label="quick check-in"
      className="relative py-16 sm:py-24 md:py-32"
      style={{
        background: C.bg,
        fontFamily: SANS,
      }}
    >
      <ScrollReveal className="relative mx-auto max-w-[640px] px-5 sm:px-8">
        <p
          style={{
            fontFamily: SERIF,
            fontStyle: 'italic',
            fontSize: '13px',
            color: C.textMute,
            letterSpacing: '0.06em',
            margin: 0,
            marginBottom: '10px',
          }}
        >
          your check-in
        </p>
        <h2
          style={{
            fontFamily: SERIF,
            fontSize: 'clamp(28px, 5vw, 38px)',
            lineHeight: 1.15,
            letterSpacing: '-0.015em',
            color: C.text,
            margin: 0,
            marginBottom: '8px',
          }}
        >
          which one are you?
        </h2>
        <p
          style={{
            fontFamily: SERIF,
            fontSize: '17px',
            color: C.textSoft,
            margin: 0,
            marginBottom: '36px',
          }}
        >
          four answers. about thirty seconds. then we&apos;ll see if it sits with you.
        </p>

        <div aria-live="polite" style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
          {entries.map((e) => {
            if (e.kind === 'rule') {
              return (
                <div
                  key={e.id}
                  aria-hidden
                  style={{ position: 'relative', height: '1px', width: '64px', margin: '10px 0 4px' }}
                >
                  <span
                    style={{
                      position: 'absolute',
                      left: 0,
                      top: 0,
                      height: '1px',
                      width: 0,
                      background: C.gold,
                      animation: `hqc-line 900ms ${EASE} forwards`,
                    }}
                  />
                  <span
                    style={{
                      position: 'absolute',
                      left: '60px',
                      top: '-1.5px',
                      width: '4px',
                      height: '4px',
                      borderRadius: '50%',
                      background: C.gold,
                      opacity: 0,
                      transform: 'scale(0.2)',
                      animation: `hqc-dot 1500ms ${EASE} forwards`,
                    }}
                  />
                </div>
              );
            }
            if (e.kind === 'bot') {
              return (
                <p
                  key={e.id}
                  style={{
                    margin: 0,
                    fontFamily: SERIF,
                    fontStyle: e.italic ? 'italic' : 'normal',
                    fontSize: e.emphasis ? 'clamp(18px, 2.5vw, 22px)' : 'clamp(16px, 2vw, 19px)',
                    lineHeight: 1.45,
                    color: C.text,
                    letterSpacing: e.emphasis ? '-0.012em' : '-0.005em',
                    animation: `hqc-rise 380ms ${EASE}`,
                  }}
                >
                  {e.text}
                </p>
              );
            }
            return (
              <div
                key={e.id}
                style={{
                  position: 'relative',
                  paddingLeft: '14px',
                  fontFamily: SANS,
                  fontSize: '13px',
                  color: C.textSoft,
                  lineHeight: 1.45,
                  marginLeft: '4px',
                  animation: `hqc-rise 320ms ${EASE}`,
                }}
              >
                <span
                  aria-hidden
                  style={{
                    position: 'absolute',
                    left: 0,
                    top: '3px',
                    bottom: '3px',
                    width: '2px',
                    background: C.gold,
                    opacity: 0.85,
                    borderRadius: '1px',
                  }}
                />
                {e.text}
              </div>
            );
          })}
        </div>

        {activeChips && onPick && (
          <div style={{ marginTop: '24px', display: 'flex', flexDirection: 'column' }}>
            {activeChips.map((c) => (
              <button
                key={c.id}
                onClick={() => onPick(c)}
                className="hqc-chip"
                style={{
                  position: 'relative',
                  textAlign: 'left',
                  padding: '14px 36px 14px 20px',
                  background: 'transparent',
                  border: 'none',
                  borderRadius: '8px',
                  color: C.text,
                  fontFamily: SANS,
                  fontSize: '15px',
                  lineHeight: 1.4,
                  cursor: 'pointer',
                  transition: `background 200ms ${EASE}`,
                }}
              >
                {c.label}
                <span className="hqc-chip-caret" aria-hidden style={{ position: 'absolute', right: 16, top: '50%', color: C.hairlineStrong, fontSize: '15px', lineHeight: 1, transform: 'translate(0, -50%)', transition: `transform 220ms ${EASE}, color 200ms ${EASE}` }}>→</span>
              </button>
            ))}
          </div>
        )}

        {step === 'cta' && (
          <div style={{ marginTop: '28px' }}>
            <a
              href={ctaHref}
              target="_blank"
              rel="noopener noreferrer"
              onClick={handleCta}
              className="hqc-cta"
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '10px',
                background: C.text,
                color: C.bg,
                padding: '16px 26px',
                borderRadius: '10px',
                textDecoration: 'none',
                fontSize: '15px',
                fontWeight: 500,
                fontFamily: SANS,
                letterSpacing: '-0.005em',
                boxShadow: '0 12px 28px rgba(5, 15, 26, 0.16)',
                transition: `transform 200ms ${EASE}, box-shadow 200ms ${EASE}`,
              }}
            >
              <span aria-hidden style={{ width: '5px', height: '5px', borderRadius: '50%', background: C.gold }} />
              open in the app store
            </a>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginTop: '14px' }}>
              <span aria-hidden style={{ display: 'inline-block', width: '20px', height: '1px', background: C.coral, opacity: 0.7 }} />
              <span style={{ fontSize: '13px', color: C.textMute, fontFamily: SANS }}>
                free on ios. nothing to sign up for.
              </span>
            </div>
            <button
              onClick={restart}
              style={{
                marginTop: '10px',
                background: 'none',
                border: 'none',
                color: C.textMute,
                fontSize: '12px',
                cursor: 'pointer',
                padding: '4px 0',
                fontFamily: SERIF,
                fontStyle: 'italic',
                textDecoration: 'underline',
                textDecorationColor: C.hairlineStrong,
                textUnderlineOffset: '3px',
              }}
            >
              start over
            </button>
          </div>
        )}
      </ScrollReveal>

      <style jsx global>{`
        @keyframes hqc-rise {
          from { opacity: 0; transform: translateY(6px); }
          to { opacity: 1; transform: translateY(0); }
        }
        @keyframes hqc-line {
          from { width: 0; }
          to { width: 56px; }
        }
        @keyframes hqc-dot {
          0%, 60% { opacity: 0; transform: scale(0.2); }
          80% { opacity: 1; transform: scale(1.15); }
          100% { opacity: 1; transform: scale(1); }
        }
        .hqc-chip::before {
          content: '';
          position: absolute;
          left: 6px;
          top: 50%;
          transform: translateY(-50%);
          width: 2px;
          height: 14px;
          background: ${C.gold};
          opacity: 0.4;
          border-radius: 1px;
          transition: height 320ms ${EASE}, opacity 220ms ${EASE};
        }
        .hqc-chip:hover, .hqc-chip:focus-visible {
          background: ${C.hoverBg};
          outline: none;
        }
        .hqc-chip:focus-visible {
          outline: 2px solid ${C.goldRing};
          outline-offset: 2px;
        }
        .hqc-chip:hover::before, .hqc-chip:focus-visible::before {
          height: 70%;
          opacity: 1;
        }
        .hqc-chip:hover .hqc-chip-caret,
        .hqc-chip:focus-visible .hqc-chip-caret {
          transform: translate(4px, -50%) !important;
          color: ${C.text} !important;
        }
        .hqc-cta:hover {
          transform: translateY(-1px);
          box-shadow: 0 16px 32px rgba(5, 15, 26, 0.22);
        }
        .hqc-cta:focus-visible {
          outline: 2px solid ${C.goldRing};
          outline-offset: 3px;
        }
        @media (prefers-reduced-motion: reduce) {
          .hqc-chip::before,
          .hqc-cta {
            transition: none !important;
          }
          [style*="animation: hqc-"] {
            animation: none !important;
          }
        }
      `}</style>
    </section>
  );
}
