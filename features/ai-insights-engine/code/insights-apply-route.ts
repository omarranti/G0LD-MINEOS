import { NextResponse } from "next/server";
import { isAuthenticated } from "@/lib/auth";
import { getSql, DEMO_SENTINEL_USER_ID } from "@/lib/neon";
import { revalidatePath } from "next/cache";

/**
 * POST /api/insights/apply
 * Body: { type: "goal" | "action", data: { title, description?, category?, priority? } }
 *
 * Creates a goal or action from an insight extracted during a chat session.
 */
export async function POST(request: Request) {
  if (!(await isAuthenticated())) {
    return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
  }

  let body: {
    type?: string;
    data?: Record<string, string>;
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  if (!body.type || !body.data?.title) {
    return NextResponse.json({ error: "type and data.title are required." }, { status: 400 });
  }

  const sql = getSql();
  if (!sql) {
    return NextResponse.json({ ok: true, message: "Demo mode — not persisted." });
  }

  const VALID_CATEGORIES = ["career", "financial", "creative", "personal", "network"] as const;
  const VALID_PRIORITIES = ["must", "should", "could"] as const;

  try {
    if (body.type === "goal") {
      const title = body.data.title.trim();
      const description = body.data.description?.trim() || null;
      const cat = body.data.category ?? "";
      const category = VALID_CATEGORIES.includes(cat as typeof VALID_CATEGORIES[number])
        ? cat
        : null;

      const now = new Date();
      const quarter = Math.floor(now.getMonth() / 3) + 1;
      const year = now.getFullYear();

      await sql`
        insert into public.goals
          (user_id, title, description, category, progress, status, quarter, year)
        values
          (${DEMO_SENTINEL_USER_ID}, ${title}, ${description}, ${category},
           0, 'active', ${quarter}, ${year})
      `;

      revalidatePath("/goals");
      revalidatePath("/dashboard");
      return NextResponse.json({ ok: true, message: "Goal added." });
    }

    if (body.type === "action") {
      const title = body.data.title.trim();
      const pri = body.data.priority ?? "should";
      const priority = VALID_PRIORITIES.includes(pri as typeof VALID_PRIORITIES[number])
        ? pri
        : "should";

      await sql`
        insert into public.actions (user_id, title, priority, status)
        values (${DEMO_SENTINEL_USER_ID}, ${title}, ${priority}, 'pending')
      `;

      revalidatePath("/actions");
      revalidatePath("/dashboard");
      return NextResponse.json({ ok: true, message: "Action added." });
    }

    return NextResponse.json({ error: `Unknown type: ${body.type}` }, { status: 400 });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
