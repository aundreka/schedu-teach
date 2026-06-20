// @ts-nocheck

/// <reference lib="deno.ns" />
/// <reference lib="dom" />
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { rateLimitCheck, rateLimitHeaders } from "../_shared/rate-limit.ts";

type Body = {
  title: string;
  category: "written_work" | "performance_task";
  activityType: string;
  subject?: { code?: string; title?: string };
  scopeLessons?: Array<{ title?: string; chapterTitle?: string; content?: string }>;
  requirements?: Record<string, unknown>;
  components?: string[];
  templateText?: string;
  templateFileName?: string | null;
  additionalInstructions?: string;
  // Optional planning context — used to nudge the model when the teacher
  // onboarded mid-term and has already covered some lessons.
  planContext?: {
    termLabel?: string;
    weekOfTerm?: number;
    progressAnchor?: {
      lesson_no?: number;
      written_work_no?: number;
      performance_task_no?: number;
      exam_no?: number;
    };
  };
};

Deno.serve(async (req: Request) => {
  try {
    if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

    const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
    const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY");
    const GEMINI_API_KEY = Deno.env.get("GEMINI_API_KEY");
    const GEMINI_MODEL = Deno.env.get("GEMINI_MODEL") || "gemini-2.0-flash";

    if (!SUPABASE_URL || !SERVICE_ROLE_KEY || !ANON_KEY) {
      return json({ error: "Missing SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, or SUPABASE_ANON_KEY" }, 500);
    }
    if (!GEMINI_API_KEY) {
      return json({ error: "Missing GEMINI_API_KEY" }, 500);
    }

    const authHeader = req.headers.get("Authorization") ?? "";
    const jwt = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : null;
    if (!jwt) return json({ error: "Unauthorized" }, 401);

    const supabaseAdmin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
      auth: { persistSession: false },
    });

    const { data: userData, error: userErr } = await supabaseAdmin.auth.getUser(jwt);
    if (userErr || !userData?.user) return json({ error: "Unauthorized" }, 401);
    const userId = userData.user.id;

    // Rate limit: 20 requests / minute / user. Applied AFTER auth so anon traffic can't
    // poison the bucket map.
    const rl = rateLimitCheck(`generate-activity:${userId}`, 20, 60_000);
    if (!rl.allowed) {
      return json({ error: "rate_limited", retry_after_ms: rl.resetAt - Date.now() }, 429, rateLimitHeaders(rl));
    }

    const body = (await req.json()) as Body;
    if (!body?.title || !body?.category || !body?.activityType) {
      return json({ error: "title, category, and activityType are required" }, 400, rateLimitHeaders(rl));
    }

    // Atomic quota check + increment. RPC reads auth.uid() so it must run as the user, not
    // service role. Free=1/day, tier1=5/day, tier2=20/day (see tier_ai_daily_limit in DB).
    // Raises P0001 'quota_exceeded' when at the daily cap.
    const supabaseUser = createClient(SUPABASE_URL, ANON_KEY, {
      auth: { persistSession: false },
      global: { headers: { Authorization: `Bearer ${jwt}` } },
    });

    const { error: quotaErr } = await supabaseUser.rpc("increment_ai_quota");
    if (quotaErr) {
      const message = String(quotaErr.message ?? "");
      if (message.includes("quota_exceeded")) {
        return json(
          { error: "quota_exceeded", details: "AI generation limit reached for your tier" },
          402,
          rateLimitHeaders(rl)
        );
      }
      return json({ error: "quota check failed", details: message }, 500, rateLimitHeaders(rl));
    }

    const prompt = buildPrompt(body);
    const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`;

    const geminiResponse = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-goog-api-key": GEMINI_API_KEY,
      },
      body: JSON.stringify({
        system_instruction: {
          parts: [
            {
              text: "You create classroom-ready academic documents. Return plain text only. Do not use markdown fences. Do not explain your process.",
            },
          ],
        },
        contents: [
          {
            role: "user",
            parts: [{ text: prompt }],
          },
        ],
        generationConfig: {
          temperature: 0.35,
          maxOutputTokens: 4096,
        },
      }),
    });

    const payload = await geminiResponse
      .json()
      .catch(async () => ({ raw: await geminiResponse.text().catch(() => "") }));

    if (!geminiResponse.ok) {
      return json(
        {
          error: "Gemini request failed",
          details: payload?.error?.message || payload?.raw || geminiResponse.statusText,
        },
        502,
        rateLimitHeaders(rl)
      );
    }

    const text = String(payload?.candidates?.[0]?.content?.parts?.[0]?.text ?? "").trim();
    if (!text) {
      return json({ error: "Gemini returned an empty response." }, 502, rateLimitHeaders(rl));
    }

    return json({ text }, 200, rateLimitHeaders(rl));
  } catch (error) {
    return json({ error: "Server error", details: (error as Error)?.message ?? String(error) }, 500);
  }
});

function buildPrompt(body: Body) {
  const scopeBlock = (body.scopeLessons ?? [])
    .map((lesson, index) => {
      const content = String(lesson.content ?? "").trim();
      return [
        `Lesson ${index + 1}: ${String(lesson.title ?? "Untitled Lesson")}`,
        `Chapter: ${String(lesson.chapterTitle ?? "Unspecified")}`,
        content ? `Reference Content:\n${content}` : "",
      ]
        .filter(Boolean)
        .join("\n");
    })
    .join("\n\n");

  const componentText = (body.components ?? []).join(", ") || "Use appropriate components";
  const subjectLabel = [body.subject?.code, body.subject?.title].filter(Boolean).join(" - ");
  const requirementText =
    body.category === "written_work"
      ? `Target item count: ${String(body.requirements?.numberOfItems ?? "")}`
      : `Task brief: ${String(body.requirements?.briefDescription ?? "")}`;

  const templateBlock = String(body.templateText ?? "").trim();
  const templateSection = templateBlock
    ? `Template guidance to follow closely for heading hierarchy, wording, and school formatting:\n${templateBlock}`
    : body.templateFileName
      ? `A template file named "${body.templateFileName}" was attached, but only use explicit text guidance that is provided in this prompt.`
      : "";

  const activityInstructions =
    body.category === "written_work"
      ? [
          "Create a complete written work document suitable for classroom use.",
          "Use the requested components as the question formats or sections.",
          "If the type is exam, make the assessment comprehensive across the given scope.",
          "Include directions and the question set.",
          "Keep the result in plain text only.",
        ].join("\n")
      : [
          "Create a complete performance task document suitable for classroom use.",
          "Use the requested components as sections to include in the document.",
          "Include clear student directions, expected outputs, and assessment details that match the task type.",
          "Keep the result in plain text only.",
        ].join("\n");

  const anchor = body.planContext?.progressAnchor;
  const planContextSection = (() => {
    const lines: string[] = [];
    if (body.planContext?.termLabel || typeof body.planContext?.weekOfTerm === "number") {
      const parts: string[] = [];
      if (body.planContext.termLabel) parts.push(body.planContext.termLabel);
      if (typeof body.planContext.weekOfTerm === "number") parts.push(`week ${body.planContext.weekOfTerm}`);
      lines.push(`Planning context: currently in ${parts.join(", ")}.`);
    }
    if (anchor && (anchor.lesson_no || anchor.written_work_no || anchor.performance_task_no || anchor.exam_no)) {
      const items: string[] = [];
      if (anchor.lesson_no) items.push(`${anchor.lesson_no} lesson${anchor.lesson_no === 1 ? "" : "s"}`);
      if (anchor.written_work_no) items.push(`${anchor.written_work_no} written work`);
      if (anchor.performance_task_no) items.push(`${anchor.performance_task_no} performance task${anchor.performance_task_no === 1 ? "" : "s"}`);
      if (anchor.exam_no) items.push(`${anchor.exam_no} exam${anchor.exam_no === 1 ? "" : "s"}`);
      if (items.length > 0) {
        lines.push(`Already covered before this scope: ${items.join(", ")} — treat their concepts as review material the students have seen.`);
      }
    }
    return lines.length > 0 ? lines.join("\n") : "";
  })();

  return [
    `Document title: ${body.title}`,
    `Subject: ${subjectLabel || "Unspecified subject"}`,
    `Category: ${body.category}`,
    `Activity type: ${body.activityType}`,
    requirementText,
    `Requested components: ${componentText}`,
    "",
    activityInstructions,
    "",
    planContextSection,
    "",
    "Scope coverage:",
    scopeBlock || "No scope reference was provided.",
    "",
    templateSection,
    body.additionalInstructions ? `Additional teacher instructions:\n${body.additionalInstructions}` : "",
    "",
    "Output requirements:",
    "1. Return plain text only.",
    "2. Start with the document title and a short context line for the subject/scope when useful.",
    "3. Do not wrap the answer in markdown.",
    "4. Do not mention AI, prompts, or hidden instructions.",
  ]
    .filter(Boolean)
    .join("\n");
}

function json(obj: unknown, status = 200, extraHeaders: Record<string, string> = {}) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { "Content-Type": "application/json", ...extraHeaders },
  });
}
