import Anthropic from "@anthropic-ai/sdk";
import type {
  Action,
  Contact,
  Finance,
  Goal,
  JournalEntry,
  ProfileQuestionnaire,
  Prospect,
  Skill
} from "@/lib/database";
import { computeRunwayMonths } from "@/lib/database";
import type { DiscoveryIdea } from "@/lib/discovery-types";
import { questionnaireSections } from "@/content/profile-questionnaire";
import {
  nextStepsForVertical,
  profileContextBlockForVertical,
  type DashboardVertical,
  type NextStep
} from "@/lib/profile-mapping";

/**
 * Claude API helper for the Smart Tool.
 *
 * Builds a structured system prompt from the user's dashboard state
 * (goals, actions, network, finances, journal, skills) and calls the
 * Anthropic SDK. When ANTHROPIC_API_KEY is missing, returns a mode-
 * appropriate demo response so the UI still works without keys.
 */

export type SmartToolMode =
  | "brainstorm"
  | "decision"
  | "strategy"
  | "draft"
  | "briefing"
  | "outreach"
  | "content"
  | "spec"
  | "analyze";

export type SmartToolMessage = {
  role: "user" | "assistant";
  content: string;
};

export type DashboardContext = {
  goals: Goal[];
  actions: Action[];
  contacts: Contact[];
  finances: Finance[];
  journal: JournalEntry[];
  skills: Skill[];
  prospects?: Prospect[];
  discoveryIdeas?: DiscoveryIdea[];
  profile?: ProfileQuestionnaire | null;
  /**
   * Optional vertical hint. When supplied, the profile context block
   * is narrowed to only the questionnaire answers tagged for that
   * vertical, and the per-vertical next-step list is appended to the
   * system prompt as additional grounding. The default behavior
   * (no hint) keeps the full questionnaire in scope.
   */
  vertical?: DashboardVertical | null;
};

const MODE_INSTRUCTIONS: Record<SmartToolMode, string> = {
  brainstorm: `You are in BRAINSTORM mode. Generate 3-5 structured approaches to the user's problem. For each: a one-line description, the concrete first step, and the biggest risk. Be specific to their context. Recommend the best one at the end.`,

  decision: `You are in DECISION mode. Help the user reach a clear answer. Lay out the options, the weighted pros and cons, and a recommendation with confidence level. Reference their current goals, finances, and network where relevant. Do not hedge.`,

  strategy: `You are in STRATEGY mode. Ask one clarifying question first, then produce a structured strategy doc with: situation, goal, constraints, three approaches, recommended path, and next-14-day action list. Pull from the user's active goals and skills.`,

  draft: `You are in DRAFT mode. Write the communication the user needs. Tone should match the audience. Short and direct by default. Reference the user's voice and context from their journal entries if relevant. Return clean, ready-to-send copy.`,

  briefing: `You are in BRIEFING mode. Give a one-paragraph orientation for the day: what moved yesterday, what matters today, the single most leveraged action, and any follow-ups due from the network. Grounded in the dashboard data, not generic productivity advice.`,

  outreach: `You are in OUTREACH mode. Write a targeted cold message, email, or pitch to a specific person or organization. Pull from the network context to find warm paths where they exist. Tailor tone to the recipient's world. Structure: state the ask in the first two to three lines, one line of credibility grounded in real context (Meridian, the offer tool, DJ work, whatever is most relevant), then a specific low-commitment next step. Return clean copy that is ready to send, plus one sentence of strategic framing explaining why this approach. Never use em dashes.`,

  content: `You are in CONTENT mode. Plan and write social content for the DJ, operator, and builder persona. Use the SoundCloud archive (jordanlane), Depop shop, and Meridian operator work as authentic texture. Produce: one strong hook line, three distinct content ideas each with a specific angle, and one ready-to-post caption for the most actionable idea. Tone: terse, self-aware, industry-credible. Not hype. One practical thing that can go out this week, not a twelve-week content calendar.`,

  spec: `You are in SPEC mode. Write a lean product specification for a tool, feature, or project. Structure: problem statement (one sentence), who it is for, what it does (three bullets max), what it does not do, the single success metric, and the smallest shippable version. Reference the existing builder work (Meridian offer-processing tool, PDF extraction, Power Automate flow) as comparable context when relevant. Concrete and scoped, not aspirational.`,

  analyze: `You are in ANALYZE mode. Find the pattern. Given any situation, dataset, or set of facts, identify what is actually happening versus what appears to be happening. Output: the key insight in one sentence, three supporting observations with evidence from the provided context, one thing that contradicts or complicates the pattern, and the single most useful action that follows. Reference dashboard data (finances, goals, network, journal) where it adds signal. No hedging, no qualifications that exist only to seem balanced.`
};

const BASE_SYSTEM_PROMPT = `You are Jordan Lane's strategic thinking partner inside the Loft platform.

Who Jordan is. 25 years old. Westfield University graduate. Music Central Assistant at Meridian Talent Group in Beverly Hills, with two unofficial roles: BH Contemporary Department Assistant (ticket counts for touring bands) and Music Operations Assistant (data records, agent on-offboarding, backend cleanup). Direct supervisor was just laid off in a Silver Lake cost-cutting round, so the role is shifting toward independent cleanup projects. He prototyped a Claude-assisted PDF extraction and Power Automate flow to compress his own offer-processing workflow. Appeared on Fox Tower Games Season 1 with Bi-Coastal Brainiacs in 2022. Co-hosted The Campus Mix on Westfield Radio 2020-2021. DJs by invite. Curates a Depop shop and SoundCloud archive under the handle jordanlane. Raised in Rialto, based in LA, moving to a new apartment May 1, 2026 with industry-connected roommates.

Brand spine (v1.0, grounded in his completed strategy questionnaire). Operator with taste. Inside Meridian Music, building the next thing. Four messaging pillars: Operator, Builder, Connector, Performer. His own answer to what he wants to be known for is "Getting any task done reasonably." His own named blocker is "Locking In." His own stated stability floor is $6,000 per month (currently earning $3.6k to $4k from Meridian with $51,700 in total debt and zero savings).

Operator of the system. Sam Ranti, Jordan's best friend, runs this dashboard. Sam is the closest strategic voice in Jordan's corner and the person Jordan trusts most for honest pushback.

Your job is to be useful, specific, and honest. Do not flatter. Do not hedge when a clear answer exists. Reference the user's actual data (goals, actions, contacts, finances, journal, profile) by name when helpful. If a question cannot be answered well from the provided context, say what additional information would unlock it.

Voice rules. Never use em dashes in written output. Use periods, commas, colons, or parentheses instead. Do not paraphrase Jordan's own questionnaire answers into vague language: prefer his exact phrasing. Match the practical, slightly self-aware tone of an operator, not a copywriter.`;

/**
 * Renders the profile questionnaire as a Jordan-voice block. Skips any
 * field that is null/empty so partial completion still produces a
 * useful prompt. Returns an empty string when no answers exist at all,
 * which causes the caller to fall through to the v0.3 hardcoded
 * paragraph instead.
 */
function profileToString(profile: ProfileQuestionnaire | null | undefined): string {
  if (!profile) return "";

  const sections: string[] = [];

  for (const section of questionnaireSections) {
    const lines: string[] = [];
    for (const q of section.questions) {
      const raw = profile[q.field];
      if (raw == null) continue;
      const text = String(raw).trim();
      if (!text) continue;
      lines.push(`Q: ${q.label}\nA: ${text}`);
    }
    if (lines.length > 0) {
      sections.push(`### ${section.title}\n${lines.join("\n\n")}`);
    }
  }

  if (sections.length === 0) return "";

  return [
    "# Jordan's own words (from the strategy questionnaire)",
    "",
    "Treat every answer below as authoritative. When a question in the conversation overlaps with anything here, prefer Jordan's actual phrasing over your own. Do not paraphrase him into vague language.",
    "",
    sections.join("\n\n")
  ].join("\n");
}

function contextToString(ctx: DashboardContext): string {
  const lines: string[] = [];

  // Active goals
  const activeGoals = ctx.goals.filter((g) => g.status === "active");
  if (activeGoals.length > 0) {
    lines.push("## Active goals");
    for (const g of activeGoals) {
      lines.push(`- ${g.title} (${g.progress}% progress${g.target_date ? `, target ${g.target_date}` : ""}, ${g.category ?? "uncategorized"})`);
    }
  }

  // Pending actions, top 8
  const pendingActions = ctx.actions
    .filter((a) => a.status === "pending")
    .slice(0, 8);
  if (pendingActions.length > 0) {
    lines.push("\n## Pending actions");
    for (const a of pendingActions) {
      lines.push(`- [${a.priority}] ${a.title}${a.due_date ? ` (due ${a.due_date})` : ""}`);
    }
  }

  // Top contacts by strength
  const topContacts = ctx.contacts
    .slice()
    .sort((a, b) => (b.relationship_strength ?? 0) - (a.relationship_strength ?? 0))
    .slice(0, 6);
  if (topContacts.length > 0) {
    lines.push("\n## Network");
    for (const c of topContacts) {
      const strength = c.relationship_strength ? `${c.relationship_strength}/5` : "unranked";
      const meta = [c.title, c.company].filter(Boolean).join(", ");
      lines.push(`- ${c.name}${meta ? ` (${meta})` : ""} [${strength}]`);
    }
  }

  // Finance snapshot
  if (ctx.finances.length > 0) {
    const runway = computeRunwayMonths(ctx.finances);
    const latest = ctx.finances[0];
    const runwayLabel =
      runway === null ? "unknown" : runway === Infinity ? "positive cash flow" : `${runway.toFixed(1)} months`;
    lines.push("\n## Finances");
    lines.push(`- Runway: ${runwayLabel}`);
    lines.push(`- Latest month savings: $${Math.round(Number(latest.savings))}`);
    lines.push(`- Latest month income: $${Math.round(Number(latest.income) + Number(latest.side_income))}`);
  }

  // Recent journal titles
  const recentJournal = ctx.journal.slice(0, 3);
  if (recentJournal.length > 0) {
    lines.push("\n## Recent journal entries");
    for (const j of recentJournal) {
      lines.push(`- ${j.date}: ${j.title ?? "(untitled)"}`);
    }
  }

  // Skills inventory (top 5 by proficiency)
  const topSkills = ctx.skills
    .filter((s) => !s.is_target)
    .slice()
    .sort((a, b) => (b.proficiency ?? 0) - (a.proficiency ?? 0))
    .slice(0, 5);
  if (topSkills.length > 0) {
    lines.push("\n## Top skills");
    for (const s of topSkills) {
      lines.push(`- ${s.name} (${s.proficiency ?? "?"}/10)`);
    }
  }

  // Top prospects by fit score (outbound pipeline intelligence)
  const topProspects = (ctx.prospects ?? [])
    .slice()
    .sort((a, b) => (b.fit_score ?? 0) - (a.fit_score ?? 0))
    .slice(0, 6);
  if (topProspects.length > 0) {
    lines.push("\n## Prospect pipeline (top by fit score)");
    for (const p of topProspects) {
      const meta = [p.title, p.target_org].filter(Boolean).join(", ");
      const scores = [
        p.fit_score != null ? `fit ${p.fit_score}/10` : null,
        p.accessibility_score != null ? `access ${p.accessibility_score}/10` : null
      ].filter(Boolean).join(", ");
      const rel = p.relationship_to_user !== "unknown" ? ` [${p.relationship_to_user.replace(/_/g, " ")}]` : "";
      lines.push(`- ${p.name}${meta ? ` (${meta})` : ""}${rel}${scores ? ` — ${scores}` : ""}${p.status !== "new" ? ` [${p.status}]` : ""}`);
    }
  }

  // Active discovery ideas
  const activeIdeas = (ctx.discoveryIdeas ?? [])
    .filter((i) => i.status === "active" || i.status === "explored")
    .slice(0, 4);
  if (activeIdeas.length > 0) {
    lines.push("\n## Discovery ideas (active)");
    for (const i of activeIdeas) {
      const phase = i.execution_phase ?? "validate";
      lines.push(`- ${i.name}: ${i.one_line_pitch ?? "(no pitch)"} [${phase} phase, ${i.status}]`);
    }
  }

  return lines.join("\n");
}

export function buildSystemPrompt(mode: SmartToolMode, ctx: DashboardContext): string {
  const contextStr = contextToString(ctx);
  // When a vertical hint is supplied, swap the full profile dump for
  // the per-vertical context block that only loads the relevant Q&A.
  // Otherwise fall back to the full questionnaire dump so unbounded
  // chats still get the complete picture.
  const profileStr = ctx.vertical
    ? profileContextBlockForVertical(ctx.profile, ctx.vertical)
    : profileToString(ctx.profile);
  const parts: string[] = [BASE_SYSTEM_PROMPT, ""];

  // Profile answers, when present, lead the prompt because they are
  // the strongest signal we have about who Jordan actually is.
  if (profileStr) {
    parts.push(profileStr, "");
  }

  // When a vertical hint is set, append the deterministic next-step
  // list for that vertical so the LLM has a grounded starting set of
  // moves it can build on rather than reinvent.
  if (ctx.vertical && ctx.profile) {
    const steps = nextStepsForVertical(ctx.profile, ctx.vertical);
    const stepsBlock = nextStepsToPromptBlock(ctx.vertical, steps);
    if (stepsBlock) {
      parts.push(stepsBlock, "");
    }
  }

  parts.push(
    MODE_INSTRUCTIONS[mode],
    "",
    "# Current dashboard context",
    contextStr || "(no dashboard data available)"
  );

  return parts.join("\n");
}

/**
 * Renders a list of derived NextStep objects as a prompt-friendly
 * block. Each step is annotated with its priority and the source
 * questions that motivated it so the LLM can extend or rebut the list
 * with attribution instead of inventing.
 */
function nextStepsToPromptBlock(
  vertical: DashboardVertical,
  steps: NextStep[]
): string {
  if (steps.length === 0) return "";
  const lines: string[] = [
    `# Deterministic next steps for ${vertical} (derived from the questionnaire)`,
    "",
    "Use these as the floor, not the ceiling. Each one is grounded in a specific answer the user gave. Build on them, sharpen them, or rebut them. Do not invent new ones that ignore the source attribution."
  ];
  for (const s of steps) {
    const sources =
      s.source_fields.length > 0
        ? ` (from: ${s.source_fields.join(", ")})`
        : "";
    const metric = s.target_metric ? ` Target: ${s.target_metric}.` : "";
    lines.push(`- [${s.priority}] ${s.title}. ${s.why}${metric}${sources}`);
  }
  return lines.join("\n");
}

/**
 * Re-export so callers building DashboardContext can pass a vertical
 * without also importing from profile-mapping.
 */
export type { DashboardVertical } from "@/lib/profile-mapping";

/**
 * Extracted insights from a conversation — goals and actions Claude
 * identified as actionable items worth surfacing to the dashboard.
 */
export type ExtractedInsight = {
  goals: Array<{ title: string; description: string; category: string }>;
  actions: Array<{ title: string; priority: "must" | "should" | "could" }>;
};

/**
 * Runs a lightweight extraction pass over a completed conversation and
 * returns structured goals and actions. Returns empty arrays when no
 * API key is set or the model returns unparseable output.
 */
export async function extractInsights(
  messages: SmartToolMessage[]
): Promise<ExtractedInsight> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey || apiKey.startsWith("your-") || messages.length < 2) {
    return { goals: [], actions: [] };
  }

  const conversationText = messages
    .map((m) => `${m.role === "user" ? "User" : "Claude"}: ${m.content}`)
    .join("\n\n");

  try {
    const client = new Anthropic({ apiKey });
    const model = process.env.ANTHROPIC_MODEL ?? "claude-sonnet-4-6";

    const response = await client.messages.create({
      model,
      max_tokens: 400,
      system: `You extract actionable items from conversations. Return ONLY valid JSON with this exact schema — no prose, no markdown fences:
{"goals":[{"title":"string","description":"string","category":"career|financial|creative|personal|network"}],"actions":[{"title":"string","priority":"must|should|could"}]}
Rules: max 3 goals, max 5 actions. Only include items explicitly stated or strongly implied. If nothing actionable, return {"goals":[],"actions":[]}.`,
      messages: [
        {
          role: "user",
          content: `Extract actionable goals and next steps from this conversation:\n\n${conversationText}`
        }
      ]
    });

    const block = response.content[0];
    if (!block || block.type !== "text") return { goals: [], actions: [] };

    const match = block.text.match(/\{[\s\S]*\}/);
    if (!match) return { goals: [], actions: [] };

    const parsed = JSON.parse(match[0]) as ExtractedInsight;
    return {
      goals: Array.isArray(parsed.goals) ? parsed.goals.slice(0, 3) : [],
      actions: Array.isArray(parsed.actions) ? parsed.actions.slice(0, 5) : []
    };
  } catch {
    return { goals: [], actions: [] };
  }
}

/**
 * Call Claude with the given message history. Returns the assistant's
 * reply as a plain string. In demo mode (no API key), returns a mode-
 * appropriate canned response so the UI still works.
 */
export async function callClaude(
  mode: SmartToolMode,
  messages: SmartToolMessage[],
  ctx: DashboardContext
): Promise<string> {
  const apiKey = process.env.ANTHROPIC_API_KEY;

  if (!apiKey || apiKey.startsWith("your-")) {
    return demoResponse(mode, messages);
  }

  try {
    const client = new Anthropic({ apiKey });
    const model = process.env.ANTHROPIC_MODEL ?? "claude-sonnet-4-6";
    const system = buildSystemPrompt(mode, ctx);

    const response = await client.messages.create({
      model,
      max_tokens: 1500,
      system,
      messages: messages.map((m) => ({ role: m.role, content: m.content }))
    });

    const block = response.content[0];
    if (block && block.type === "text") return block.text;
    return "(no response)";
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return `[Claude API error: ${message}]\n\nFalling back to demo response.\n\n${demoResponse(mode, messages)}`;
  }
}

/**
 * Canned responses for when no ANTHROPIC_API_KEY is set.
 * Gives Sam a visual preview of how each mode feels.
 */
function demoResponse(mode: SmartToolMode, messages: SmartToolMessage[]): string {
  const last = messages.filter((m) => m.role === "user").pop()?.content ?? "";
  const preview = last.length > 80 ? `${last.slice(0, 80)}…` : last;

  switch (mode) {
    case "brainstorm":
      return `*(Demo response. Set ANTHROPIC_API_KEY in .env.local for real output.)*

Three approaches to: "${preview}"

**1. Pick the lane with Sam this week.**
Your blocker, in your own words, is locking in. Four candidate lanes: operator, builder, connector, performer. Pick one with Sam on a single call this week and commit to a 90-day window before reassessing.
First step: text Sam tonight, propose a 45-minute call before Friday.
Risk: you turn it into a four-hour exploration instead of a forced choice.

**2. Book two DJ gigs for May.**
DJing is the only skill you have actually been paid for. Two gigs is the fastest path toward the $6k stability floor and gets the music creation cadence back online.
First step: borrow a board and message every host who has booked you in the last twelve months.
Risk: you wait until you have your own gear, the May window closes, and the gigs do not happen.

**3. Finish the offer tool to a portfolio-grade v1.**
The PDF extraction is 80% there. Even if the Meridian ERP never accepts the paste, the tool itself is portfolio-grade. Finish the extraction module, screen-record a 90-second walkthrough, and you have a real artifact for any conversation about your builder side.
First step: block one weekend in the next two for the extraction module only.
Risk: the ERP gap demoralizes you and the file sits unfinished.

**Recommended: approach 1.** Without locking in, the other two are noise. Make Sam force the call.`;

    case "decision":
      return `*(Demo response. Set ANTHROPIC_API_KEY for real output.)*

**Decision: "${preview}"**

**Option A. Stay at Meridian through end of year, lock in on the operator pillar.**
- Pro: steady $3.6k to $4k baseline, access stays intact, the contemporary department keeps you in the room
- Pro: Bradley, Todd, John as the in-building career models you wrote about in the questionnaire
- Con: post-Silver Lake the trainee track is unclear, the cleanup-projects role does not point at the agent seat
- Weighted score: 7/10

**Option B. Stay at Meridian, but lean into the connector pillar on nights and weekends.**
- Pro: monetizable in 30 days through DJ gigs (your only proven income skill)
- Pro: the May move-in unlocks the roommate-hosted Hunker Night room
- Con: night energy is finite, the operator track at Meridian slips
- Weighted score: 6/10

**Option C. Quietly draft the Meridian exit memo with Sam and prepare a 60-day exit window.**
- Pro: forces a real decision instead of drift
- Con: zero runway, $51.7k debt, no second income lined up, May move just landed, this is a knife not a scalpel
- Weighted score: 3/10

**Recommendation: A, with a hard 90-day check-in.**
Confidence: 7/10. Run the operator lane for 90 days while booking two DJ gigs per month on the side as the connector hedge. If the cleanup-projects role has not started pointing at the trainee track by day 90, revisit.`;

    case "strategy":
      return `*(Demo response. Set ANTHROPIC_API_KEY for real output.)*

Quick clarifier before the full strategy: when you say "${preview}", are you optimizing for **first dollar outside salary** or **position inside the industry 12 months from now**? Those two answers point to different plans.

Assuming first dollar outside salary, draft strategy:

**Situation.** Music Central Assistant at Meridian Music. $3.6k to $4k per month salary, $51,700 total debt, zero savings, zero runway. The only income skill you have actually been paid for is DJing. Music creation is on pause because of no audio interface and no DJ board. Your stated stability floor is $6k per month.

**Goal.** Add $2,000 per month in non-salary income inside 60 days.

**Constraints.** May 1 apartment move. Meridian day job carries the baseline. No new gear budget over $200.

**Three approaches.**
1. Two DJ gigs per month at $500 each, borrow a board, buy a basic interface for under $200.
2. One paid project-management or consulting gig per month at $1,500 to $2,000 through Rob or Justin.
3. Productize the offer tool as a small-agency consult and sell one engagement at $2,500.

**Recommended: approach 1 plus a parallel ask to Rob about approach 2.**

**Next 14 days.**
- [ ] Borrow a DJ board from anyone in the network
- [ ] Buy a basic audio interface (under $200)
- [ ] Message every host who booked you in the last 12 months
- [ ] Call Rob Dorsey with a specific consulting ask
- [ ] Finish the PDF extraction module on the offer tool`;

    case "draft":
      return `*(Demo response. Set ANTHROPIC_API_KEY for real output.)*

Here's a draft for: "${preview}"

Hey Rob,

Quick one. I'm trying to add $2k of non-salary income per month inside the next 60 days, and consulting or project work is the lane I think you can help me think through.

I'm not asking for an intro to anyone yet. I'm asking for 20 minutes to walk through who in your world might actually want a project-managing operator on a one-off basis, and what shape an offer would need to take to be worth their time.

Can I grab you on a call this week?

Jordan

This keeps the ask bounded (your time, not your network), names a specific dollar target, and gives you a real reason to follow up after the call. If you want a version that swaps in a specific intro request, I can revise.`;

    case "briefing":
      return `*(Demo response. Set ANTHROPIC_API_KEY for real output.)*

**Morning. Here's where things stand.**

Yesterday the questionnaire intake closed and the brand spine moved from v0.3 hypothesis to v1.0 grounded. The dashboard is now seeded off your real answers, not the OSINT placeholder.

Today the single most leveraged move is the lock-in call with Sam. It is the action with the must priority on the goals list and the first thing the strategy depends on. Get it on the calendar before noon.

Two things from the network worth touching this week: Rob Dorsey for the consulting ask, and a follow-up to the incoming Marcheeta roommate to confirm the May 1 logistics and start mapping the Hunker Night room.

Runway note: zero savings, $51,700 in debt, monthly burn at roughly $4,145 against $3,900 income at the salary midpoint. You are not in collapse. You are in the kind of math where one $500 DJ gig is meaningful and one $60 subscription matters.

One action for today: text Sam to lock the call. Everything else can wait.`;

    case "outreach":
      return `*(Demo response. Set ANTHROPIC_API_KEY for real output.)*

**Outreach draft for: "${preview}"**

Hey [Name],

I run the offer-processing workflow for Music Central at Meridian and I built a PDF extraction tool that compresses the intake side by about 60%. I think a version of the same logic could work for what you're doing with [their context].

Would 20 minutes this week make sense to walk through it?

Jordan

**Why this framing:** leading with the artifact (the tool) rather than the title gets past the title. It is a specific credibility claim, not a resume line. The ask is bounded: your time, not an introduction or a job.`;

    case "content":
      return `*(Demo response. Set ANTHROPIC_API_KEY for real output.)*

**Content angles for: "${preview}"**

**Hook:** The agent who automates his own job.

**Three ideas:**
1. **The offer tool walkthrough (Builder angle).** A 90-second screen recording of the PDF extraction flow. Caption: "This is what I built to compress the offer intake process at Meridian. No SaaS, no approval needed. Just Python and a Power Automate flow." Posts well on LinkedIn and X as a builder signal.
2. **The DJ set drop (Performer angle).** One archived jordanlane set from SoundCloud with a caption that names the room and the year. Anchor it to a current moment: "Playing [venue/event] [date]. This is where the sound was then."
3. **The operator take (Connector angle).** One observation from inside the music industry that most outsiders get wrong. Written as a short thread or a single LinkedIn post. Example: "Everyone thinks ticketing agents manage relationships. Most of the job is data cleanup."

**Ready to post:**
"Built this PDF extraction tool to compress the offer-processing workflow at Meridian. It does not exist in any official system. That is the point." [attach screen recording or screenshot]`;

    case "spec":
      return `*(Demo response. Set ANTHROPIC_API_KEY for real output.)*

**Spec for: "${preview}"**

**Problem.** [State problem in one sentence based on what you typed.]

**Who it is for.** Music Central Assistants and similar ops roles at mid-size agencies who process high volumes of offer PDFs manually today.

**What it does.**
- Extracts structured offer data (artist, venue, date, guarantee, deal points) from unstructured PDF inputs
- Outputs to a paste-ready format for the ERP or a structured CSV
- Flags fields it could not confidently parse for manual review

**What it does not do.** It does not connect directly to Meridian's internal ERP, submit data on its own, or handle contracts outside the offer format.

**Success metric.** Offer intake time drops from [current time] to under 2 minutes per document.

**Smallest shippable version.** A Python script that takes one PDF as input and returns a JSON object with the six key fields. No UI. No automation. Just the extraction.`;

    case "analyze":
      return `*(Demo response. Set ANTHROPIC_API_KEY for real output.)*

**Analysis of: "${preview}"**

**Key insight.** [The pattern in one sentence once you provide real context.]

**Three supporting observations from your dashboard:**
1. Income is $3.6k to $4k per month against a stated stability floor of $6k. The gap is not a rounding error. It is a structural $2k monthly shortfall that compounds against $51,700 in debt with zero savings buffer.
2. The only skill you have been paid for outside salary is DJing. Every other income lane (consulting, the offer tool, content) is speculative. The data does not support treating them as equivalent options right now.
3. Your network is heavy on industry contacts (Meridian-adjacent, music, Hunker Night) and light on people who have actually hired freelancers or paid for an external consultant. The contacts list may feel dense but the buyer signal inside it is thin.

**Complication.** The May move-in changes the social surface area. Industry-connected roommates and the Hunker Night room are real assets that do not yet appear in the numbers because they have not been activated yet.

**Single most useful action.** Book two DJ gigs for May before the move. It is the only path with a proven payment mechanism and it uses the new room as a staging ground.`;

    default:
      return `*(Demo response.)* Received: "${preview}"`;
  }
}
