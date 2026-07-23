/**
 * Therma Waitlist Nurture Sequence
 *
 * Four follow-up emails after the welcome email in lib/email-templates.tsx.
 * Drop into Resend, Beehiiv, or any sequencing tool. Day offsets are from
 * the day the user joined the waitlist.
 *
 * Voice rules:
 * - Quiet, direct, first-person when from Sam
 * - No em dashes anywhere
 * - Short sentences mixed with longer flowing ones
 * - Honest, not salesy. No exclamation points
 * - Sign-off: ". Sam" or ". The Therma Team"
 */

export type NurtureEmail = {
  id: string;
  dayOffset: number;
  subject: string;
  preheader: string;
  headline: string;
  bodyParagraphs: string[];
  callout?: {
    label: string;
    lines: string[];
  };
  /** Paragraphs that render AFTER the callout block (optional). */
  bodyParagraphsAfterCallout?: string[];
  cta?: {
    label: string;
    href: string;
  };
  signOff: string;
  notes?: string;
};

export const thermaNurtureSequence: NurtureEmail[] = [
  /* ─────────────────────────────────────────────────────────────
   *  Email 2 of 5  ·  Day 2  ·  Founder story
   * ───────────────────────────────────────────────────────────── */
  {
    id: 'day-02-founder-story',
    dayOffset: 2,
    subject: "The question I couldn't answer",
    preheader: 'Three years of data. One blind spot.',
    headline: "The question I couldn't answer",
    bodyParagraphs: [
      'Hi {firstName},',
      'I had an Oura ring. Apple Health. An HRV strap. A spreadsheet of every meal I ate for three years.',
      "And I still couldn't tell you why some Tuesdays I woke up steady and other Tuesdays I woke up unraveled.",
      'The data was complete. The narrative was missing.',
      "That's the gap Therma is being built to close. Not more metrics. The missing variable underneath the metrics.",
      "If you've ever felt this, you're the reason I kept going.",
      'Reply if you want. I read every one.',
    ],
    signOff: '. Sam\nFounder, Therma',
    notes: 'Warmth + honesty. No CTA on purpose. Goal: reply rate.',
  },

  /* ─────────────────────────────────────────────────────────────
   *  Email 3 of 5  ·  Day 5  ·  The missing layer
   * ───────────────────────────────────────────────────────────── */
  {
    id: 'day-05-missing-layer',
    dayOffset: 5,
    subject: 'Wearables tell you the numbers. Therma tells you why.',
    preheader: "The layer your Oura ring doesn't have.",
    headline: 'The missing layer underneath your wearables',
    bodyParagraphs: [
      'Your wearables track almost everything.',
      'Sleep. HRV. Strain. Recovery. Steps. Calories. Hydration. Temperature.',
      "The one thing they don't track is the variable that ties all of them together: how you actually felt, and why.",
      'Therma is a 60-second daily mood check-in that sits underneath your wearables and answers that one question.',
    ],
    callout: {
      label: 'What Therma does that the others do not',
      lines: [
        'One precise AI question that adapts to what you said yesterday.',
        'Weekly insights that connect your mood to your sleep, your HRV, your caffeine, your workouts.',
        'End to end encrypted. Private by default.',
        'Not therapy. Not a blank page. Not a chatbot pretending to be your friend.',
      ],
    },
    cta: {
      label: 'See the full case for Therma',
      href: 'https://www.therma.one/why-therma',
    },
    signOff: '. The Therma Team',
    notes: 'Positioning email. Drives to /why-therma for AI SEO signal.',
  },

  /* ─────────────────────────────────────────────────────────────
   *  Email 4 of 5  ·  Day 10  ·  Useful tool (building in public)
   * ───────────────────────────────────────────────────────────── */
  {
    id: 'day-10-paper-protocol',
    dayOffset: 10,
    subject: 'A 60-second thing you can use tonight',
    preheader: 'No signup required. Just paper.',
    headline: 'A small thing you can use tonight',
    bodyParagraphs: [
      "We're still building. Early access is coming soon.",
      "In the meantime, here is the core Therma protocol you can run with a piece of paper before bed tonight.",
    ],
    callout: {
      label: 'The 60-second check-in',
      lines: [
        '1. What is the temperature of your day? (cold, warm, or overheated)',
        '2. What raised it?',
        '3. What would lower it by one degree?',
      ],
    },
    bodyParagraphsAfterCallout: [
      'Three questions. 60 seconds. Do it for seven nights in a row and watch what starts showing up.',
      'When Therma launches, this is the ritual it automates. Except the AI remembers what you said yesterday, and the week reveals the pattern.',
      'If you try it, reply and tell me what you noticed. Your data shapes what we build next.',
    ],
    signOff: '. Sam',
    notes:
      'Gives value before asking. Mirrors the check-in in the welcome email. Lightweight reply ask at end of body.',
  },

  /* ─────────────────────────────────────────────────────────────
   *  Email 5 of 5  ·  Day 20  ·  Priority invite
   * ───────────────────────────────────────────────────────────── */
  {
    id: 'day-20-priority-invite',
    dayOffset: 20,
    subject: "You're in the first wave",
    preheader: 'Early access is opening. Reply to claim your spot.',
    headline: "You're in the first wave",
    bodyParagraphs: [
      'Short note.',
      "Early access is about to open. You signed up early, so you're in the first wave.",
    ],
    callout: {
      label: "What you'll get",
      lines: [
        'Full access to the Therma daily check-in',
        'Connect to Oura, Apple Health, or Whoop',
        'Your first weekly insight reveal within seven days',
        'A direct line to me and the team',
      ],
    },
    cta: {
      label: 'Claim your spot',
      href: 'mailto:omar@therma.one?subject=In',
    },
    signOff: '. Sam\nFounder, Therma',
    notes:
      "Scarcity without fake urgency. 'Reply with in' is the primary CTA because it doubles as engagement signal for the email provider.",
  },
];

