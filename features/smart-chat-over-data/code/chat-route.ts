import { NextResponse } from "next/server";
import { isAuthenticated } from "@/lib/auth";
import {
  callClaude,
  extractInsights,
  type DashboardContext,
  type SmartToolMessage,
  type SmartToolMode
} from "@/lib/claude";
import {
  listGoals,
  listActions,
  listContacts,
  listFinances,
  listJournalEntries,
  listSkills,
  listProspects,
  listDiscoveryIdeas,
  getProfileQuestionnaire
} from "@/lib/repo";
import { isDashboardVertical, type DashboardVertical } from "@/lib/profile-mapping";
import { getSql, DEMO_SENTINEL_USER_ID } from "@/lib/neon";

/**
 * POST /api/chat
 * Body: { mode, messages, vertical? }
 * Returns: { reply, insights: { goals, actions } }
 *
 * After getting Claude's reply, runs a lightweight extraction pass to
 * surface actionable goals and actions from the conversation. The full
 * session is saved to chat_sessions for history.
 */
export async function POST(request: Request) {
  if (!(await isAuthenticated())) {
    return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
  }

  let body: {
    mode?: SmartToolMode;
    messages?: SmartToolMessage[];
    vertical?: string;
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const mode = body.mode ?? "brainstorm";
  const messages = Array.isArray(body.messages) ? body.messages : [];

  if (messages.length === 0) {
    return NextResponse.json({ error: "No messages provided." }, { status: 400 });
  }

  let vertical: DashboardVertical | null = null;
  if (typeof body.vertical === "string") {
    if (!isDashboardVertical(body.vertical)) {
      return NextResponse.json(
        { error: `Unknown vertical: ${body.vertical}` },
        { status: 400 }
      );
    }
    vertical = body.vertical;
  }

  const [goals, actions, contacts, finances, journal, skills, prospects, discoveryIdeas, profile] =
    await Promise.all([
      listGoals(),
      listActions(),
      listContacts(),
      listFinances(),
      listJournalEntries(),
      listSkills(),
      listProspects(),
      listDiscoveryIdeas(),
      getProfileQuestionnaire()
    ]);

  const ctx: DashboardContext = {
    goals,
    actions,
    contacts,
    finances,
    journal,
    skills,
    prospects,
    discoveryIdeas,
    profile,
    vertical
  };

  try {
    const reply = await callClaude(mode, messages, ctx);

    // Build the full conversation including the assistant reply for extraction.
    const fullConversation: SmartToolMessage[] = [
      ...messages,
      { role: "assistant", content: reply }
    ];

    // Run extraction and session save in parallel — neither blocks the reply.
    const [insights] = await Promise.all([
      extractInsights(fullConversation),
      saveChatSession(mode, vertical, fullConversation)
    ]);

    return NextResponse.json({ reply, insights });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

async function saveChatSession(
  mode: SmartToolMode,
  vertical: DashboardVertical | null,
  messages: SmartToolMessage[]
): Promise<void> {
  const sql = getSql();
  if (!sql) return;
  try {
    await sql`
      insert into public.chat_sessions (user_id, mode, vertical, messages)
      values (
        ${DEMO_SENTINEL_USER_ID},
        ${mode},
        ${vertical ?? null},
        ${JSON.stringify(messages)}::jsonb
      )
    `;
  } catch (err) {
    // Non-fatal — log but never let it break the chat response.
    console.error("saveChatSession error:", err);
  }
}
