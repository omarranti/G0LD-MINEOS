/**
 * Social presence intel for Jordan.
 *
 * Snapshot of the public-side audit across Instagram, LinkedIn,
 * Facebook, SoundCloud, and Depop, plus the strategic read on the
 * gap between Jordan's actual life and what shows up online.
 *
 * The /social dashboard module renders this. Hand-written for now,
 * the way every other Phase 1-3 module is. In Phase 4 the Smart Tool
 * will refresh stats from the platforms and re-run the analysis on
 * a cadence.
 *
 * Voice: Jordan-flavored, strategic, no em dashes.
 */

export type SocialPlatform = {
  id: string;
  label: string;
  handle: string;
  href: string;
  followers?: string;
  following?: string;
  posts?: string;
  note?: string;
};

export type SocialPillar = {
  label: string;
  body: string;
};

export type OperatorPlaybook = {
  command: string;
  label: string;
  body: string;
  cta: string;
};

export const socialPresence = {
  // ─── Headline read ──────────────────────────────────────────────
  // Updated 2026-04-08 off Jordan's questionnaire: he confirmed ~2k
  // followers, negative ratio, mostly stories, no active TikTok or
  // YouTube, and no deliberate personal brand effort yet because he
  // has been "exploring different projects and not exemplifying one
  // skill or set of skills."
  headline:
    "Credentials and lifestyle are strong. The social presence does not reflect it. Jordan has not yet tried to build a brand because he has not locked in which skill to lead with. The fix is not a rebrand. It is picking two lanes and shipping volume.",

  // ─── Platform inventory ─────────────────────────────────────────
  platforms: [
    {
      id: "instagram",
      label: "Instagram",
      handle: "@jordanlane",
      href: "https://www.instagram.com/jordanlane/",
      followers: "~2,000",
      following: "more than followers",
      posts: "low",
      note: "Jordan's own read: negative follower to following ratio, mostly posting stories that retain the current audience without branching out to new ones."
    },
    {
      id: "linkedin",
      label: "LinkedIn",
      handle: "jordanlane",
      href: "https://www.linkedin.com/in/jordanlane",
      note: "Meridian Music Central plus Westfield University plus Fox Tower Games is a stronger profile than 99% of his peer group. Underused."
    },
    {
      id: "facebook",
      label: "Facebook",
      handle: "jordanlane",
      href: "https://www.facebook.com/jordanlane/",
      note: "Legacy surface. Family and high school graph. Useful for credibility, not for growth."
    },
    {
      id: "soundcloud",
      label: "SoundCloud",
      handle: "jordan-lane",
      href: "https://soundcloud.com/jordan-lane",
      note: "Long-form curated playlists, year-stamped. The deepest archive of his actual taste."
    },
    {
      id: "depop",
      label: "Depop",
      handle: "jordanlane",
      href: "https://www.depop.com/jordanlane/",
      note: "Curatorial work as commerce. Same instinct as the playlists, different surface."
    }
  ] satisfies SocialPlatform[],

  // ─── Identity & brand snapshot ──────────────────────────────────
  identity: {
    handle: "@jordanlane",
    handleNote: "Consistent across Instagram, Depop, and the Loft mark. Strong anchor.",
    bio: "Operator with taste",
    bioPlatform: "Working positioning",
    quote: "Getting any task done reasonably.",
    quoteNote: "Jordan's own answer to what he wants to be known for. The spine of the brand."
  },

  // ─── Credential signals ─────────────────────────────────────────
  credentials: [
    "Meridian Music Central Assistant. Ticket counts for touring bands, plus data operations across the music group.",
    "Westfield University graduate. the student government Director of Space and Technologies, Academic Affairs Commission.",
    "Westfield Radio host, The Campus Mix, two years.",
    "Fox Tower Games, Season 1. Mainstream media credibility.",
    "Claude-assisted automation tool for his own workflow. Builder instinct inside the machine.",
    "Standing access to penthouse drinks, industry mixers, poker nights, festivals, and backstage rooms."
  ],

  // ─── Content pillars / signals from existing posts ──────────────
  // Mapped to the four brand messaging pillars in /brand/guidelines.md:
  // Operator, Builder, Connector, Performer.
  pillars: [
    {
      label: "Operator",
      body: "Inside Meridian Music. Ticket counts, data records, the backend cleanup most people do not see. The lane nobody else in his peer group can actually speak from."
    },
    {
      label: "Builder",
      body: "Automation tool for his own workflow. SharePoint, Power Automate, Claude. The Loft platform itself. Business by way of workflow innovation."
    },
    {
      label: "Connector",
      body: "DJ sets, taste, the room. Penthouse drinks, poker nights, industry mixers, festivals backstage. Playlist curation across SoundCloud and Depop."
    },
    {
      label: "Performer",
      body: "Fox Tower Games. The Campus Mix on Westfield Radio. The media house dream: Vice meets Bourdain meets Larry King Live."
    }
  ] satisfies SocialPillar[],

  // ─── The strategic gap ──────────────────────────────────────────
  gap: {
    title: "The gap",
    body: [
      "The credentials are top-decile. The post volume is bottom-decile. Jordan said it himself in the questionnaire: he has not locked in which skill to lead with, so he has been doing a lot of exploring and not showcasing.",
      "The fix is not a rebrand. The brand spine is already clear: operator with taste. The fix is picking two of the four pillars and shipping weekly from them for 90 days, letting reactions tell him which one compounds."
    ],
    moves: [
      "Pick two of the four pillars to compound. The default recommendation is Operator and Connector, which map cleanly to his day job and his actual rooms.",
      "Set a floor of two Instagram posts per week. Not a ceiling. A floor.",
      "Cross-post the Operator lane to LinkedIn the same day. Same caption, different audience.",
      "Use the Depop and SoundCloud archives as the long tail. They already exist. Surface them in stories.",
      "Before posting anything new, audit which existing post performed best. Repeat that shape, do not vary it."
    ]
  },

  // ─── Operator playbooks (Claude Code skills) ────────────────────
  // These are the slash commands Sam runs from Claude Code to power
  // this section. The dashboard surfaces them so the workflow is
  // visible from the working surface, even though execution happens
  // in the agent loop.
  playbooks: [
    {
      command: "/content-strategy",
      label: "Content strategy",
      body: "Pick the two lanes worth compounding, decide the cadence, draft the editorial calendar for the next four weeks.",
      cta: "Plan the next 4 weeks"
    },
    {
      command: "/social-content",
      label: "Social content",
      body: "Generate platform-native posts for Instagram and LinkedIn from the chosen lanes. Captions, hooks, formats.",
      cta: "Create this week's posts"
    },
    {
      command: "/draft-content",
      label: "Draft long form",
      body: "Turn one builder lane idea into a long-form piece for LinkedIn or a personal site essay. The career pivot story is the obvious first one.",
      cta: "Draft the pivot story"
    }
  ] satisfies OperatorPlaybook[]
} as const;

export type SocialPresence = typeof socialPresence;
