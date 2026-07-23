/**
 * Question wording for the strategy questionnaire that lives in the
 * dashboard at /profile.
 *
 * Source of truth for the wording: /.inbox/text/nate-questionnaire.txt
 * (authored by Sam Ranti, April 2026). Edit this file to reorder
 * questions, swap labels, or add follow-ups. The Profile page renders
 * straight off this config so changes here are the only place a content
 * tweak is needed.
 *
 * Field names match the columns on `public.profile_questionnaire` and
 * the keys on the `ProfileQuestionnaire` type in `lib/database.ts`. If
 * you add a question, add the column to the migration and the field to
 * the type at the same time.
 *
 * Each question is also tagged with the dashboard verticals it feeds.
 * The `verticals` array is read by `lib/profile-mapping.ts` to slice
 * the questionnaire into per-page context bundles and to derive the
 * next-step recommendations exposed at /api/profile/next-steps.
 */

import type {
  ProfileQuestionnaire,
  ProfileSectionKey
} from "@/lib/database";

export type QuestionField = keyof Omit<
  ProfileQuestionnaire,
  | "user_id"
  | "section_completed"
  | "created_at"
  | "updated_at"
>;

export type QuestionInputType = "textarea" | "role-radio";

/**
 * Dashboard verticals that a question can feed. Mirrors the routes
 * registered in `content/dashboard-nav.ts`. Adding a new vertical
 * means: (1) add it here, (2) add a default next-step generator in
 * `lib/profile-mapping.ts`, (3) tag the relevant questions below.
 */
export type DashboardVertical =
  | "dashboard"
  | "actions"
  | "goals"
  | "network"
  | "career"
  | "finances"
  | "journal"
  | "social"
  | "smart"
  | "discovery";

export type Question = {
  field: QuestionField;
  label: string;
  helper?: string;
  type: QuestionInputType;
  rows?: number;
  /**
   * Which dashboard verticals this answer should influence. The mapping
   * layer reads this to know where each answer flows.
   */
  verticals: DashboardVertical[];
};

export type QuestionnaireSectionConfig = {
  key: ProfileSectionKey;
  number: number;
  title: string;
  blurb: string;
  /**
   * Which dashboard verticals the entire section primarily drives.
   * Used as the fallback when a specific question has no verticals tag
   * and as the routing default for whole-section context bundles.
   */
  verticals: DashboardVertical[];
  questions: Question[];
};

export const questionnaireSections: QuestionnaireSectionConfig[] = [
  {
    key: "identity",
    number: 1,
    title: "Identity",
    blurb: "Who you are when nobody's watching. This shapes everything.",
    verticals: ["dashboard", "goals", "smart", "discovery"],
    questions: [
      {
        field: "identity_party_answer",
        label:
          "When someone asks 'what do you do?' at a party, what do you say? And what do you wish you could say instead?",
        type: "textarea",
        rows: 4,
        verticals: ["dashboard", "social", "smart"]
      },
      {
        field: "identity_dream_day",
        label:
          "If money, titles, and other people's opinions didn't exist, what would you spend your days doing?",
        type: "textarea",
        rows: 4,
        verticals: ["goals", "journal", "smart"]
      },
      {
        field: "identity_better_at",
        label:
          "What are you genuinely better at than most people you know? Not humble. Honest.",
        type: "textarea",
        rows: 3,
        verticals: ["career", "discovery", "smart"]
      },
      {
        field: "identity_go_to_for",
        label:
          "What's the thing people always come to you for? Advice, connections, ideas, a specific skill?",
        type: "textarea",
        rows: 3,
        verticals: ["network", "career", "discovery"]
      },
      {
        field: "identity_role_type",
        label:
          "Do you see yourself as the talent (the person on stage, on screen, in front), the business (the person building, strategizing, operating behind the scenes), or both?",
        type: "role-radio",
        verticals: ["dashboard", "career", "social", "discovery", "smart"]
      },
      {
        field: "identity_role_type_why",
        label: "Say more. Why that one?",
        helper: "Optional, but the why is the part that actually shapes the strategy.",
        type: "textarea",
        rows: 3,
        verticals: ["career", "smart"]
      }
    ]
  },
  {
    key: "wme",
    number: 2,
    title: "The Meridian situation",
    blurb: "Be real about where you are inside this building.",
    verticals: ["career", "actions", "goals", "network"],
    questions: [
      {
        field: "wme_title_role",
        label:
          "What is your exact title and role at Meridian right now? What do you actually do day to day?",
        type: "textarea",
        rows: 4,
        verticals: ["career", "smart"]
      },
      {
        field: "wme_access",
        label:
          "What do you have access to at Meridian that most people your age don't? Think relationships, information, rooms, events.",
        type: "textarea",
        rows: 4,
        verticals: ["network", "career", "discovery"]
      },
      {
        field: "wme_doubts",
        label:
          "You mentioned Meridian might not be a good long-term play. Why? What specifically feels off?",
        type: "textarea",
        rows: 4,
        verticals: ["career", "journal", "goals"]
      },
      {
        field: "wme_take_with_you",
        label:
          "If you left Meridian tomorrow, what would you take with you that still has value? Skills, contacts, knowledge, reputation?",
        type: "textarea",
        rows: 4,
        verticals: ["career", "network", "discovery"]
      },
      {
        field: "wme_stay_terms",
        label:
          "What would it take for you to stay at Meridian for 3 more years? What would the role need to look like?",
        type: "textarea",
        rows: 3,
        verticals: ["career", "goals"]
      },
      {
        field: "wme_envy_who",
        label:
          "Who at Meridian or in that world has a career you actually envy? Why?",
        type: "textarea",
        rows: 3,
        verticals: ["career", "network", "goals"]
      }
    ]
  },
  {
    key: "builder",
    number: 3,
    title: "The builder instinct",
    blurb:
      "You tried to automate your own job. That tells me something. Let's dig into it.",
    verticals: ["discovery", "actions", "career", "finances"],
    questions: [
      {
        field: "builder_offer_tool",
        label:
          "The offer-processing tool you tried to build. Walk me through what it does, what worked, and where it broke. Be specific.",
        type: "textarea",
        rows: 5,
        verticals: ["discovery", "actions", "career"]
      },
      {
        field: "builder_dream_tool",
        label:
          "If you could build any tool or product that solves a problem you've seen at Meridian or in the entertainment industry, what would it be?",
        type: "textarea",
        rows: 4,
        verticals: ["discovery", "goals"]
      },
      {
        field: "builder_products_or_businesses",
        label:
          "Do you see yourself as someone who builds products/tools, or someone who builds businesses/brands? There's a difference.",
        type: "textarea",
        rows: 3,
        verticals: ["discovery", "career"]
      },
      {
        field: "builder_made_money",
        label:
          "Have you ever made money from something you built yourself (not a salary)? Side project, freelance, sold something? If not, what's stopped you?",
        type: "textarea",
        rows: 3,
        verticals: ["finances", "discovery", "journal"]
      },
      {
        field: "builder_monetizable_skills",
        label:
          "What skills do you have right now that are monetizable outside of a 9-to-5? List everything, even if it sounds small.",
        type: "textarea",
        rows: 4,
        verticals: ["finances", "career", "discovery", "actions"]
      }
    ]
  },
  {
    key: "creative",
    number: 4,
    title: "The creative side",
    blurb: "Music. Tower Games. The stuff that isn't on a paycheck.",
    verticals: ["social", "career", "actions", "discovery"],
    questions: [
      {
        field: "creative_music_seriousness",
        label:
          "How serious is the music? Scale of 1-10. Are you actively making, releasing, performing? Or is it on pause?",
        type: "textarea",
        rows: 3,
        verticals: ["actions", "finances", "social"]
      },
      {
        field: "creative_domino_aftermath",
        label:
          "Tower Games put you on national TV. What happened after that aired? Any opportunities, meetings, followers? Or did it go quiet?",
        type: "textarea",
        rows: 4,
        verticals: ["social", "career", "discovery"]
      },
      {
        field: "creative_on_camera_again",
        label:
          "Do you want to be on camera again? If yes, doing what? Hosting, competing, acting, creating content?",
        type: "textarea",
        rows: 3,
        verticals: ["social", "discovery", "goals"]
      },
      {
        field: "creative_social_state",
        label:
          "What's your social media situation right now? Instagram, TikTok, YouTube. How many followers, how active, what do you post?",
        type: "textarea",
        rows: 4,
        verticals: ["social", "actions"]
      },
      {
        field: "creative_personal_brand",
        label:
          "Have you ever tried to build a personal brand? If yes, what happened? If no, what's held you back?",
        type: "textarea",
        rows: 3,
        verticals: ["social", "journal", "discovery"]
      }
    ]
  },
  {
    key: "money",
    number: 5,
    title: "Money & survival",
    blurb: "Can't build a dream on an empty tank. No judgment, just math.",
    verticals: ["finances", "actions", "goals"],
    questions: [
      {
        field: "money_earnings",
        label:
          "What are you earning right now (ballpark)? Is it enough to cover your life, or are you stretched?",
        type: "textarea",
        rows: 3,
        verticals: ["finances", "dashboard"]
      },
      {
        field: "money_burn",
        label:
          "What does your monthly burn look like? Rent, car, food, subscriptions, debt payments. Rough total.",
        type: "textarea",
        rows: 3,
        verticals: ["finances", "actions"]
      },
      {
        field: "money_runway",
        label:
          "Do you have any savings or runway? If you lost your job tomorrow, how many months could you survive?",
        type: "textarea",
        rows: 3,
        verticals: ["finances", "dashboard", "goals"]
      },
      {
        field: "money_stable_min",
        label:
          "What's the minimum monthly income you need to feel stable enough to take a risk on something new?",
        type: "textarea",
        rows: 2,
        verticals: ["finances", "goals", "discovery"]
      },
      {
        field: "money_debt",
        label: "Do you have any debt? Student loans, credit cards, car note? Rough total.",
        type: "textarea",
        rows: 2,
        verticals: ["finances", "actions"]
      }
    ]
  },
  {
    key: "network",
    number: 6,
    title: "Network & access",
    blurb:
      "Who you know matters. But who knows what you can do matters more.",
    verticals: ["network", "actions", "social"],
    questions: [
      {
        field: "network_top_five",
        label:
          "Name 5 people in your network who could change your trajectory if they decided to invest in you (time, money, opportunity, introduction).",
        helper: "One per line. Add a sentence on each if you want.",
        type: "textarea",
        rows: 6,
        verticals: ["network", "actions"]
      },
      {
        field: "network_hunker_use",
        label:
          "Your roommate hosts industry events and is connected to senior people. How are you leveraging that access right now? Be honest.",
        type: "textarea",
        rows: 4,
        verticals: ["network", "actions", "journal"]
      },
      {
        field: "network_meeting_maker",
        label:
          "If you needed a meeting with someone important next week, who could you call to make it happen?",
        type: "textarea",
        rows: 3,
        verticals: ["network", "actions"]
      },
      {
        field: "network_rooms",
        label:
          "What rooms are you currently in (events, dinners, group chats, organizations) that most people your age aren't?",
        type: "textarea",
        rows: 3,
        verticals: ["network", "social", "career"]
      }
    ]
  },
  {
    key: "vision",
    number: 7,
    title: "The vision",
    blurb: "No wrong answers. But vague ones are useless.",
    verticals: ["goals", "dashboard", "smart", "discovery"],
    questions: [
      {
        field: "vision_three_year",
        label:
          "Describe your life 3 years from now if everything goes right. Be specific. Where do you live, what do you do every day, how much do you make, what does your Monday look like?",
        type: "textarea",
        rows: 6,
        verticals: ["goals", "dashboard", "smart"]
      },
      {
        field: "vision_known_for",
        label:
          "What's the one thing you want to be known for? Not three things. One.",
        type: "textarea",
        rows: 2,
        verticals: ["dashboard", "social", "discovery"]
      },
      {
        field: "vision_obstacle",
        label:
          "What's the biggest thing standing between you right now and that 3-year picture?",
        type: "textarea",
        rows: 3,
        verticals: ["goals", "actions", "journal"]
      },
      {
        field: "vision_fear",
        label:
          "What are you afraid of? Career-wise. The thing you don't say out loud.",
        type: "textarea",
        rows: 3,
        verticals: ["journal", "smart"]
      },
      {
        field: "vision_sacrifice",
        label:
          "What are you willing to sacrifice to get where you want to go? Time, comfort, social life, a stable paycheck? What's off the table?",
        type: "textarea",
        rows: 3,
        verticals: ["goals", "journal"]
      },
      {
        field: "vision_anything_else",
        label: "Is there anything else I should know? Something I haven't asked about that matters?",
        type: "textarea",
        rows: 4,
        verticals: ["smart", "journal"]
      }
    ]
  },
  {
    key: "tools",
    number: 8,
    title: "Tools & workflow",
    blurb: "What you use shapes what we can build. Let's get specific.",
    verticals: ["smart", "actions", "dashboard"],
    questions: [
      {
        field: "tools_daily_apps",
        label:
          "Walk me through the apps on your phone home screen and the tools you open every single workday. Don't overthink it, just list them.",
        type: "textarea",
        rows: 4,
        verticals: ["smart", "actions"]
      },
      {
        field: "tools_info_lives",
        label:
          "Where does your work actually live? Calendar, notes, email threads, group chats, your head? Where would someone find the important stuff if they needed to catch up on your life?",
        type: "textarea",
        rows: 4,
        verticals: ["smart", "actions", "dashboard"]
      },
      {
        field: "tools_broken_workflows",
        label:
          "What do you do manually right now that feels like it should be automatic? What takes more time than it should?",
        type: "textarea",
        rows: 4,
        verticals: ["smart", "actions", "discovery"]
      },
      {
        field: "tools_communication",
        label:
          "How do people reach you? How do you prefer to reach others? Email, text, WhatsApp, Slack, something else? And do you actually check all of them?",
        type: "textarea",
        rows: 3,
        verticals: ["smart", "network"]
      },
      {
        field: "tools_calendar",
        label:
          "What does your calendar situation look like? Do you use it to plan your week, or does it just collect invites?",
        type: "textarea",
        rows: 3,
        verticals: ["smart", "actions", "goals"]
      },
      {
        field: "tools_connectors_wanted",
        label:
          "If this platform could connect to any tool you already use (Notion, Google Calendar, Slack, your contacts, health data, email, etc.), which ones would actually matter to you? Which would you ignore?",
        helper: "No wrong answers. This directly shapes what we build next.",
        type: "textarea",
        rows: 4,
        verticals: ["smart", "discovery", "actions"]
      },
      {
        field: "tools_health_tracking",
        label:
          "Do you track anything about your health, energy, or sleep? Apple Watch, a routine, anything? Do you think it affects your output?",
        type: "textarea",
        rows: 3,
        verticals: ["smart", "journal"]
      }
    ]
  }
];

/**
 * Flat lookup: every question, indexed by its database field. The
 * mapping layer in `lib/profile-mapping.ts` uses this to walk question
 * metadata without re-iterating the section tree on every call.
 */
export const QUESTIONS_BY_FIELD: Record<QuestionField, Question> =
  questionnaireSections.reduce(
    (acc, section) => {
      for (const q of section.questions) {
        acc[q.field] = q;
      }
      return acc;
    },
    {} as Record<QuestionField, Question>
  );

/**
 * Reverse index: for each dashboard vertical, the list of question
 * fields that feed it. Computed once at module load time.
 */
export const FIELDS_BY_VERTICAL: Record<DashboardVertical, QuestionField[]> =
  questionnaireSections.reduce(
    (acc, section) => {
      for (const q of section.questions) {
        for (const v of q.verticals) {
          if (!acc[v]) acc[v] = [];
          acc[v].push(q.field);
        }
      }
      return acc;
    },
    {} as Record<DashboardVertical, QuestionField[]>
  );

/**
 * Reverse index: for each dashboard vertical, the list of section
 * keys whose top-level vertical tag includes it. Used as the section
 * grouping when building per-vertical context bundles.
 */
export const SECTIONS_BY_VERTICAL: Record<
  DashboardVertical,
  ProfileSectionKey[]
> = questionnaireSections.reduce(
  (acc, section) => {
    for (const v of section.verticals) {
      if (!acc[v]) acc[v] = [];
      acc[v].push(section.key);
    }
    return acc;
  },
  {} as Record<DashboardVertical, ProfileSectionKey[]>
);
