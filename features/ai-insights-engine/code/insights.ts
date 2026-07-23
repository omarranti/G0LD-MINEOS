/**
 * Card insights — the expandable "intel" panel that sits under every
 * dashboard card. Structured so the UI can render a consistent shape
 * across goals, actions, contacts, skills, career events, journal
 * entries, runway, etc.
 *
 * For Phase 1-3 we hand-write insights against the demo-data ids so
 * Sam can tour the full experience without touching Claude. In
 * Phase 4 (Smart Tool), swap `getInsight` for a server action that
 * calls the Claude API with dashboard state as context, and caches
 * the result per-card.
 *
 * Keep insight copy Jordan-flavored. Strategic voice. No em dashes.
 */

export type InsightKind =
  | "goal"
  | "action"
  | "contact"
  | "career-event"
  | "skill"
  | "journal"
  | "runway"
  | "dashboard";

export type CardInsight = {
  /** One-line framing. Why this card matters in Jordan's current situation. */
  context?: string;
  /** Concrete numbered next steps. The "do this, then this" checklist. */
  instructions?: string[];
  /** Strategic guidance bullets. How to think about it, not just do. */
  guides?: string[];
  /** The one high-leverage move hiding in this card. */
  goldenOpportunity?: string;
  /** What can go wrong, what to watch for. */
  risks?: string[];
};

// ─── Hand-written insights keyed against demo-data ids ──────────────

const goalInsights: Record<string, CardInsight> = {
  "goal-1": {
    context:
      "The offer-processing automation is the single strongest signal Jordan is a builder, not a processor. Getting it to a second agency changes the entire conversation about his next job.",
    instructions: [
      "Write a one-paragraph description of what the tool does and who it is for. No code. Just the pitch.",
      "List three agencies that have the same workflow pain as Meridian Sports.",
      "Ask Jordan (ex-Meridian, now Fanly) for one warm intro into an ops lead at one of them this week.",
      "Time-box the conversation to 20 minutes. Goal is to validate pain, not to sell.",
    ],
    guides: [
      "Stop building and start talking. The 20% that is missing is not engineering, it is permission and distribution.",
      "If two of three conversations say yes without a demo, you have a product. If they all want a demo before committing, you have a portfolio piece.",
      "Price is a filter, not a number. Saying $500 a month filters buyers from tire-kickers even if you never collect it.",
    ],
    goldenOpportunity:
      "Jordan left Meridian for better pay at a product company. If he validates the pain at Fanly's agency clients, that is both a second customer and a hiring signal.",
    risks: [
      "Building in public without a buyer is a portfolio trap. Great for resume, bad for runway.",
      "Meridian could see this as conflicted work. Keep the tool generic, do not reference internal ERP schemas, do not demo on company time.",
    ],
  },
  "goal-2": {
    context:
      "Runway is the variable that lets every other decision get made on strategy instead of fear. The May 1 move is a near-term hit; the question is what happens after.",
    instructions: [
      "Pull last three months of statements. Flag every recurring charge over $10.",
      "Cancel three subscriptions this week. Keep only the two that earn their line item.",
      "Set a hard ceiling on food delivery: two orders per week. Everything else is groceries.",
      "Open a separate savings account labeled 'runway only' and auto-transfer 10% of each paycheck.",
    ],
    guides: [
      "Three months of runway is the psychological threshold where you can say no to the wrong opportunity. Below it, you cannot.",
      "Side income is more strategic than cost cuts at this stage. A single $600 freelance gig beats a month of saying no to coffee.",
    ],
    goldenOpportunity:
      "One paid freelance engagement this quarter using the offer-processing tool would double as runway AND product validation. Two birds.",
    risks: [
      "The apartment move will spike expenses in May. Do not measure runway on April numbers alone.",
    ],
  },
  "goal-3": {
    context:
      "Dre's apartment and Hunker Night are the most underpriced asset in Jordan's life. Five real conversations beats fifty introductions.",
    instructions: [
      "Write down who you want to actually talk to in that room by name. Three people, not ten.",
      "For each: one specific question only they can answer. No small talk openers.",
      "Stay for the 20 minutes after the official thing ends. That is where the real conversations happen.",
      "Follow up within 48 hours or it did not happen.",
    ],
    guides: [
      "Proximity is not the goal. Proximity is the ticket. What you do with it is the thing.",
      "Do not try to be in every conversation. Be in the right one.",
      "The host's trust is the most valuable currency in that room. Protect it harder than any single intro.",
    ],
    goldenOpportunity:
      "Ari (direct boss's boss at Meridian) is already in the network via Dre. The warm path is through the room, not the office. Treat it as the real reporting line.",
    risks: [
      "Treating friends as contacts is the fastest way to lose both. Keep the Dre relationship off the spreadsheet in your head.",
    ],
  },
  "goal-4": {
    context:
      "The Loft platform is the thing that turns every other goal into a case study. Shipping it publicly is the proof-of-builder story.",
    instructions: [
      "Finish Phase 4 (Smart Tool) before adding any new surface area.",
      "Write the launch post once the CRM and Smart Tool are live. Don't ship a half-story.",
      "Set one person to tell about it for each phase. Tell them before you ship, not after.",
    ],
    guides: [
      "Scope discipline is the whole game. A shipped Phase 4 beats a beautiful unshipped Phase 6.",
      "The platform is the portfolio piece whether or not the offer-processing tool lands. Treat it that way.",
    ],
    goldenOpportunity:
      "Being both the subject AND the builder of Loft is the story. Nobody else in the Hunker Night room can say they built their own CRM with Claude.",
  },
};

const actionInsights: Record<string, CardInsight> = {
  "action-1": {
    context:
      "Jordan is the single most valuable conversation Jordan can have this month. Ex-Meridian, now product-side, personally took the leap Jordan is considering.",
    instructions: [
      "Text first, don't email. He's a friend, not a contact.",
      "Propose a 30 minute walk or coffee, not a Zoom. Low lift.",
      "Bring two specific questions: what would he tell a Meridian version of himself, and which ops lead at Fanly would want a 20 minute demo.",
    ],
    goldenOpportunity:
      "Jordan is both a data point on the leap AND a potential warm intro to the first real customer. One conversation, two outcomes.",
    risks: [
      "Don't pitch him the tool. Ask for his read. Pitching flips the register from friend to vendor.",
    ],
  },
  "action-2": {
    context:
      "Dre is not just hosting. Dre is the shortest path to Ari. The ask has to be specific enough to travel by itself.",
    instructions: [
      "Frame the intro around something Ari actually cares about: agency-side ops efficiency.",
      "Draft the forwardable version yourself so Dre can just paste.",
      "Set an implicit deadline by mentioning Hunker Night next week.",
    ],
    guides: [
      "Every intro Dre makes is a withdrawal from the trust account. Keep the ask short, specific, and outcome-clear.",
    ],
    risks: [
      "Asking Dre to introduce you to Ari directly at Meridian is different from asking him to mention it at Hunker Night. The second is casual and free. The first is a big ask.",
    ],
  },
  "action-3": {
    context:
      "Small, but it compounds. The savings from three subscriptions plus discipline gets you roughly 10% of a month's rent back every month for the rest of the year.",
    instructions: [
      "Pull the subscription list from your bank app, not from memory.",
      "Cancel the three you have not opened in 30 days first. No sentimentality.",
      "Replace them with nothing. Filling the gap is the trap.",
    ],
  },
  "action-4": {
    context:
      "The launch post is the moment the platform stops being a project and starts being a credential. Scheduling it Tuesday 9am is the right slot for LinkedIn-adjacent audiences.",
    instructions: [
      "Lead with the build, not the bio. 'I built my own CRM with Claude because I wanted to stop losing track of conversations' is stronger than 'I'm launching a new site'.",
      "One screenshot of the CRT login. One of the Smart Tool chat. That's it.",
      "Tag nobody. Let the post land on its own.",
    ],
    goldenOpportunity:
      "A post that shows the build (not the brand) is the signal that reaches other builders and product people. That is the audience Jordan actually needs.",
  },
  "action-5": {
    context:
      "A logistics task that becomes a real risk if it slips past Friday.",
    instructions: [
      "Call the guy Dre mentioned, not a random Yelp mover.",
      "Get two quotes minimum. Pay the cheaper one in cash if it saves a percent.",
    ],
  },
  "action-6": {
    context:
      "This is done, but it is the single highest-value artifact in the whole Loft archive. The ERP schema mapping doc is the tangible thing you point at when someone asks 'can you actually build this'. Don't let it rot in the 'done' column.",
    instructions: [
      "Save a sanitized copy to the career archive as a career-event with 'deliverable' evidence type.",
      "Write one paragraph of plain-English narration over the top. Not the schema, the story of it.",
      "Decide this week whether any of it is reusable for a demo to Miko or Jordan.",
    ],
    guides: [
      "Shipped artifacts are leverage only if you can find them again in 90 days. File it properly now, not later.",
      "The generic version (no Meridian-specific columns) is the portfolio version. The specific version is the proof-of-work version. Keep both.",
    ],
    goldenOpportunity:
      "This doc is the one-page answer to 'what do you actually do' for any future ops or automation role. Write the narration and you have a resume line, a pitch deck slide, and a conversation-starter all at once.",
    risks: [
      "Leaving Meridian-specific identifiers in a public copy is a confidentiality landmine. Scrub it once, carefully, now.",
    ],
  },
  "action-7": {
    context:
      "The CRT login is the visible signal that Loft is a real build, not a template. This action closed that loop. What matters now is whether anyone sees it.",
    instructions: [
      "Screenshot the boot sequence and the Darius-wins moment. Save both to the press folder.",
      "Draft one line of caption for each, to have ready when the launch post goes out.",
      "Tell Dre and Jordan specifically. They are the first-audience test.",
    ],
    guides: [
      "Shipping is half the job. The other half is making sure the right three people know you shipped.",
    ],
    goldenOpportunity:
      "A six-second video of the boot sequence traveling on its own does more for the builder story than a resume update ever could. Record it once while the design is fresh.",
  },
  "action-8": {
    context:
      "Maya is the creative-lane door. This coffee happened. The value is in what you DO with what she said, not the meeting itself.",
    instructions: [
      "Write down everything Maya said about the casting director while the memory is still warm. Name, context, specific language used.",
      "Decide in 48 hours whether you want the intro. If yes, ask concretely. If no, tell Maya thank you and why not (so the door stays open).",
      "Log the interaction on her contact card with what you committed to next. No silent follow-up gap.",
    ],
    guides: [
      "Post-coffee silence is the most expensive mistake you can make with a creative introducer. The fact that she brought it up is the signal that she is offering.",
    ],
    goldenOpportunity:
      "A casting director contact through a trusted referrer is a year of cold outreach replaced by one conversation. Take it seriously even if you are ambivalent about the creative lane.",
    risks: [
      "Saying yes to the intro without a clear reason why turns the meeting into a vanity line on Maya's mental ledger. Have a reason, or decline cleanly.",
    ],
  },
};

const contactInsights: Record<string, CardInsight> = {
  "c-1": {
    context:
      "Ari is the highest-leverage relationship on the board. SVP Digital at Meridian, knows the ERP stack Jordan is automating, already two degrees away through Dre.",
    instructions: [
      "Do not cold-message. Wait for a natural moment via Dre or a Hunker Night encounter.",
      "When the moment happens, have a single strong opinion ready about the ERP workflow. Not a pitch. An observation.",
      "If he asks a question, answer it in 30 seconds and stop. Do not fill silence.",
    ],
    guides: [
      "Ari watches who ships. Every follow-up is a small proof point that you finish things.",
    ],
    goldenOpportunity:
      "Ari mentioning the tool in a leadership meeting, even casually, is worth more than a formal pitch. Optimize for that.",
    risks: [
      "Being too eager reads as junior. Match his energy, don't exceed it.",
    ],
  },
  "c-2": {
    context:
      "Jordan is the only person in the network who has walked the exact path Jordan is considering. Everyone else is guessing.",
    instructions: [
      "Keep the cadence tight but informal. A text every two weeks, not a calendar invite every month.",
      "Share builds, not updates. Show the Loft platform next time you see him.",
    ],
    goldenOpportunity:
      "Jordan's Fanly role means he now buys tools that look like what Jordan is building. First paying customer path.",
  },
  "c-3": {
    context:
      "Devi is a lukewarm connection that Jordan has not cultivated. She passed a composer contact and got silence back. That is the repair job.",
    instructions: [
      "Open with an apology for the silence on the composer contact. Own it.",
      "Actually reach out to the composer this week so there is something to say back.",
      "Do not restart the small talk loop. Move the relationship forward by a concrete step.",
    ],
    risks: [
      "A ghosted introducer is 3x harder to re-activate than a cold contact. Move fast.",
    ],
  },
  "c-4": {
    context:
      "Maya saw Tower Games and thought there was something there. That is a creative-side signal, not a business-side one.",
    instructions: [
      "Take the meeting. Listen first.",
      "Ask what she thought the moment was on camera, specifically.",
      "Do not pitch the offer-processing tool. This is the creative lane.",
    ],
    guides: [
      "Keep the builder story and the on-camera story in separate lanes until the strategic question is answered.",
    ],
    goldenOpportunity:
      "If Maya opens a creative door, it becomes a real data point for the talent-vs-business question Jordan is sitting on.",
  },
  "c-5": {
    context:
      "Miko is building workflow tooling for agencies. Direct adjacency. Either a partner, a first customer, or a competitor to watch.",
    instructions: [
      "Schedule a 30 minute call. Frame it as 'I am building in your space, can I get your read'.",
      "Show, don't describe. Demo the offer-processing tool if he asks.",
    ],
    goldenOpportunity:
      "Miko could be the validation conversation AND the first customer AND a referral source. Three outcomes from one call.",
    risks: [
      "If Ledgerline is close to shipping a competing feature, be careful what you share. Ask what they are not building, not what they are.",
    ],
  },
  "c-6": {
    context:
      "Dre is a real friend before he is a network node. The whole value collapses the moment he feels instrumentalized.",
    instructions: [
      "Don't log interactions with Dre. Don't 'follow up'. Just be present.",
      "When asking for anything related to his network, ask small and specific. Never vague.",
    ],
    guides: [
      "The best networking is being the person your friend wants to introduce everyone to anyway. Be that person.",
    ],
    risks: [
      "One transactional moment with Dre erases a year of real friendship. The cost of getting this wrong is total.",
    ],
  },
};

const careerEventInsights: Record<string, CardInsight> = {
  "ce-1": {
    context:
      "This is the artifact. The ERP mapping doc is the proof that the offer-processing automation is a real system, not a vibe.",
    instructions: [
      "Save a sanitized version with Meridian-specific details stripped out. This is the portfolio version.",
      "Draft a one-paragraph summary of what the doc represents. Keep for resume and intro messages.",
    ],
    goldenOpportunity:
      "Turn this into a short blog post 'What I learned automating agency offer-processing'. Nothing proprietary. Just the generalizable lessons.",
  },
  "ce-2": {
    context:
      "The origin of the builder story. Every career framing should start from the observation that offer-processing was a repetitive task begging for automation.",
  },
  "ce-3": {
    context:
      "Tower Games is the creative signal. It is also the answer to 'why should I pay attention' when pitching anything on-camera adjacent.",
    goldenOpportunity:
      "One good clip from the show reused in a post or a pitch deck is worth more than a resume line.",
  },
  "ce-4": {
    context:
      "Two years of weekly radio is proof of consistency on-camera/on-mic. Underused in the current narrative.",
  },
  "ce-5": {
    context:
      "A leadership role on a student council infrastructure team. On its own it reads as college resume filler. In the Loft story it is the first time Jordan ran a system that served other people — which is the throughline to every build since.",
    instructions: [
      "Rewrite the title in builder language when it shows up anywhere public. 'Infrastructure for 30k students' is the story, not 'the student government AAC'.",
      "Tag this with the specific operational wins (rooms, events, signage, whatever you shipped). Vague leadership roles are the easiest to ignore in an interview.",
    ],
    guides: [
      "Old career events only compound if you rewrite them for the story you are telling now. The event doesn't change; the framing does.",
    ],
    goldenOpportunity:
      "This is the earliest evidence that Jordan builds systems instead of performs within them. It reframes 'I want to go product side' from a new ambition into a decade-long pattern.",
  },
  "ce-6": {
    context:
      "High school varsity basketball in Rialto. Kept for the personal timeline, not the career one. Important for the origin narrative, not the resume.",
    guides: [
      "Personal-category events are the ones that humanize the builder. Keep them in the archive, keep them out of the pitch unless asked.",
    ],
    risks: [
      "Leaning on high school achievements in adult contexts is cringey. This is private history, not public collateral.",
    ],
  },
};

const skillInsights: Record<string, CardInsight> = {
  "s-1": {
    context:
      "This is the skill the automation tool is built on. It is also the only one in the inventory that is directly monetizable right now.",
    instructions: [
      "Write it up. A one-pager that explains the workflow from offer-in to contract-out.",
    ],
  },
  "s-2": {
    context:
      "Building with Claude is the differentiator. Most agency people cannot do this. That is the whole point.",
    guides: [
      "Level up by shipping, not by reading. The next project is the next lesson.",
    ],
  },
  "s-3": {
    context:
      "On-camera presence is the dormant skill. Tower Games and The Campus Mix prove it works. The question is whether it deserves active reps in the current chapter.",
    instructions: [
      "Decide once this quarter: active or dormant. Don't leave it in limbo.",
      "If active, record one short thing a week. Doesn't matter what, matters that the muscle stays warm.",
      "If dormant, stop apologizing for not using it. Dormant is a legitimate answer.",
    ],
    guides: [
      "A 6/10 on-camera skill that you never use reads as 0 to anyone who hasn't seen the tape. Presence decays if you don't deploy it.",
    ],
    goldenOpportunity:
      "This is the skill most of the Loft room does not have. A single short video explaining the platform build outperforms ten paragraph LinkedIn posts, and nobody else on Jordan's timeline can shoot that.",
    risks: [
      "Chasing on-camera work to keep the skill alive is the tail wagging the dog. Only run the reps when there is a reason the build side benefits from it.",
    ],
  },
  "s-4": {
    context:
      "Taste is invisible until it is the only thing that matters. Jordan's taste is the reason Loft looks like Loft and not like a generic SaaS shell. It's also the hardest skill to put on a resume.",
    instructions: [
      "Capture one taste reference a week. A screenshot, a lyric, a piece of UI, a phrase. Build the file.",
      "When making a design or copy call on Loft, write down WHY you chose it in one sentence. Taste without articulation is a luxury belief.",
    ],
    guides: [
      "Taste is the only skill that gets worse when you try to optimize for broad appeal. Protect the edges.",
      "The best way to grow taste is to spend time with people whose taste you respect. Second best is to read their receipts (playlists, bookshelves, moodboards). Third best is to argue about it.",
    ],
    goldenOpportunity:
      "Taste is the thing that makes the builder story unique. Anyone can learn to ship. Very few can ship something that feels inevitable. That feeling is taste leaking through.",
  },
  "s-5": {
    context:
      "Network activation is the gap between proximity and outcome. Marked as target. The real jump.",
    instructions: [
      "Convert one proximity relationship into a concrete outcome this month. Any outcome.",
      "Journal what worked and what did not. Pattern-match next month.",
    ],
    goldenOpportunity:
      "This skill compounds faster than any other on the list. One successful activation teaches the pattern for all future ones.",
    risks: [
      "Do not force it. Fake activation burns relationships faster than no activation.",
    ],
  },
  "s-6": {
    context:
      "Sales and pitching is the second target skill. Level 3 is honest and fixable.",
    instructions: [
      "Pitch the offer-processing tool to Miko this month. Low stakes, real feedback.",
      "Pitch it to Jordan the week after. Tighter version.",
      "Pitch it to a stranger the week after that. Cold version.",
    ],
    guides: [
      "Sales is a reps game before it is a talent game. Stop optimizing for the perfect pitch. Run the reps.",
    ],
  },
  "s-7": {
    context:
      "SQL is the unlock for the data side of any workflow tool. Including Loft itself.",
    instructions: [
      "Finish a Postgres tutorial before end of Q2.",
      "Rewrite one Loft page query by hand instead of using demo data.",
    ],
  },
};

const journalInsights: Record<string, CardInsight> = {
  "j-1": {
    context:
      "The talent-vs-business question is the strategic question for the whole year. This entry is a useful data point.",
    guides: [
      "Do not answer the question yet. Collect data. Dinners like the Jordan one are the data.",
      "Sam is right to keep asking. But the answer will come from action, not introspection.",
    ],
    goldenOpportunity:
      "The phrase 'better at the stage but I like building more' is the seed of Jordan's actual positioning. Keep circling it.",
  },
  "j-2": {
    context:
      "Observation about where the real conversations happen at Hunker Night. Store this. It's operational intel for every future event.",
    instructions: [
      "Next Hunker Night, stay for the kitchen 20 minutes. Don't leave early.",
    ],
  },
  "j-3": {
    context:
      "A good forcing function. An explicit 'if not X by Y, then switch to plan B' is rare and valuable.",
    guides: [
      "Honor the forcing function. Do not let the deadline slip without consequence. That is how plans die quietly.",
    ],
  },
};

const runwayInsight: CardInsight = {
  context:
    "Runway is the number that decides whether Jordan gets to make strategic moves or defensive ones for the next three months.",
  instructions: [
    "Log this month's actual numbers within 48 hours of the statement closing.",
    "Recompute runway every two weeks, not monthly. Tighter feedback loop.",
  ],
  guides: [
    "Below 3 months: protect runway, avoid big swings.",
    "3 to 6 months: selective risk, one swing per month.",
    "Above 6 months: swing for the fences.",
  ],
  goldenOpportunity:
    "A single paid engagement using the offer-processing tool would fund runway AND validate product. The highest-leverage move on the board right now.",
  risks: [
    "The May apartment move will distort next month's numbers. Do not confuse a one-time hit with a trend.",
    "Subscription creep is the quiet killer. Audit monthly.",
  ],
};

// ─── Dashboard home singleton cards ─────────────────────────────────
//
// The home page has four "summary" cards that aren't per-item:
// Today, Follow up, Recent journal, Build Status. Each one gets its
// own named insight so the reveal pattern is consistent with the
// item cards on every other page.

const dashboardInsights: Record<string, CardInsight> = {
  today: {
    context:
      "The Today card is Jordan's daily operating question. If nothing on the list moves the business forward, the list is wrong, not the day.",
    instructions: [
      "Look at the pending actions and pick the single one that would make today a good day if nothing else shipped.",
      "Do that one first. Before email. Before Slack. Before anything else.",
      "Review the list again at lunch. Cut anything that shouldn't still be on it.",
    ],
    guides: [
      "Pending count is a symptom, not a goal. The goal is momentum on the two or three things that actually matter.",
      "A day with one real move beats a day with five small ones. Optimize for signal, not throughput.",
    ],
    goldenOpportunity:
      "The daily briefing loop is the fastest way to build the 'I ship things' identity that every other card depends on. Run it for 30 consecutive days and the compounding starts.",
    risks: [
      "Treating the pending queue as a to-do list turns this into Asana. It is not Asana. It is a daily filter.",
    ],
  },
  "follow-up": {
    context:
      "Overdue contacts are the network's smoke detector. They tell you which relationships are decaying before the fire starts.",
    instructions: [
      "Pick the single overdue contact with the highest strategic weight. Not the oldest, the most important.",
      "Send one message today. Text if friend, email if professional, voice note if warm.",
      "Log the interaction immediately so the cadence resets.",
    ],
    guides: [
      "The cadence is more valuable than the content. A two-sentence 'thinking about you' beats a perfect email that never ships.",
      "If someone has been overdue for more than 90 days, ask yourself whether the relationship is actually dormant. Dormant is fine. Pretending is not.",
    ],
    goldenOpportunity:
      "One overdue reactivation per week compounds into a living network by the end of the quarter. That is the whole Phase 3 thesis.",
  },
  "recent-journal": {
    context:
      "The journal is the only place Jordan writes honestly about the strategic question. Scan it before every big decision.",
    guides: [
      "Recent entries are the tell on what's actually on your mind, not what you think is on your mind.",
      "Look for patterns across three entries, not one. One entry is a mood. Three is a theme.",
    ],
    goldenOpportunity:
      "The talent-vs-business question will answer itself in the journal before it answers itself anywhere else. Read it for signal, not for closure.",
  },
  "build-status": {
    context:
      "Phase tracker for Loft itself. The meta-card: the platform is both the tool and the portfolio piece, and shipping it is the proof of builder identity.",
    instructions: [
      "Phase 4 is next: Claude API smart tool with dynamic context injection. Start with the chat UI, not the prompt engineering.",
      "Do not start Phase 5 before Phase 4 is live. Scope discipline is the whole game.",
      "Tell one person each time a phase ships. One is enough. Ten is scattershot.",
    ],
    guides: [
      "Shipped phases compound. Half-finished phases rot. Finish before you start.",
      "The public launch post should happen AFTER Phase 4, not before. A dashboard without the smart tool is half the story.",
    ],
    goldenOpportunity:
      "Phase 4 is the moment Loft goes from 'nice CRM' to 'a custom AI ops tool Jordan built for himself'. That is the headline nobody else in the room can claim.",
    risks: [
      "Skipping phases to chase Phase 6 polish is the classic trap. Do not paint the house before the plumbing works.",
    ],
  },
};

// ─── Lookup function ─────────────────────────────────────────────────

/**
 * Return a hand-written insight for a given dashboard card.
 * Returns undefined when no insight has been written for the id.
 * In Phase 4 this will be swapped for a Claude API call that
 * generates the insight on demand from dashboard state.
 */
export function getInsight(
  kind: InsightKind,
  id: string
): CardInsight | undefined {
  switch (kind) {
    case "goal":
      return goalInsights[id];
    case "action":
      return actionInsights[id];
    case "contact":
      return contactInsights[id];
    case "career-event":
      return careerEventInsights[id];
    case "skill":
      return skillInsights[id];
    case "journal":
      return journalInsights[id];
    case "runway":
      return runwayInsight;
    case "dashboard":
      return dashboardInsights[id];
    default:
      return undefined;
  }
}

/**
 * Does a given insight actually have something to show?
 * Used by the InsightReveal component to decide whether to render
 * the tap bar at all.
 */
export function hasInsightContent(insight: CardInsight | undefined): boolean {
  if (!insight) return false;
  return Boolean(
    insight.context ||
      (insight.instructions && insight.instructions.length > 0) ||
      (insight.guides && insight.guides.length > 0) ||
      insight.goldenOpportunity ||
      (insight.risks && insight.risks.length > 0)
  );
}
