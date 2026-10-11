import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

interface RequestPayload {
  text: string;
  categories: { id: string; name: string }[];
  contacts: string[];
  today: string;
  cards?: string[];
}

const SYSTEM_PROMPT = `You are a financial transaction parser for an Indian personal-finance app (SpendWise).
You understand English, Hindi, and Hinglish (Hindi written in Latin script).
Analyze natural language messages describing expenses, loans, bill splits, repayments, or card payments.

You MUST output ONLY a valid JSON object matching the JSON schema below. Do NOT output markdown code fences (\`\`\`json) or any other text.

JSON Schema:
{
  "kind": "expense" | "lent" | "borrowed" | "split" | "settlement" | "card_payment",
  "amount": number,                 // > 0, max 2 decimals, extracted strictly from user text
  "person": string | null,          // for lent/borrowed/settlement
  "note": string,                   // short, cleaned, <= 80 chars (e.g. "D-Mart shopping")
  "categoryId": string | null,      // MUST be one of the provided category ids, else null
  "paymentMethod": "upi" | "cash" | "debit" | "credit" | "bank" | "unknown",
  "cardName": string | null,        // required if paymentMethod is credit or kind is card_payment
  "direction": "in" | "out" | null, // for settlement: "in" (received money), "out" (paid money)
  "shares": [{"name": string, "amount": number, "isMe": boolean}] | null, // for split
  "date": "YYYY-MM-DD" | null,      // resolve "kal", "parso", "yesterday", "today" using \`today\`
  "confidence": number,             // 0.0 to 1.0
  "ambiguous": boolean,
  "alternatives": [ { "kind": "expense"|"lent"|"borrowed"|"split"|"settlement"|"card_payment", "label": string, "shares"?: [{"name": string, "amount": number, "isMe": boolean}] | null } ]
}

CRITICAL RULES:
1. NEVER invent amounts. Amount must be clearly present in the user text. If no clear amount exists or multiple conflicting amounts exist, return {"error": "unclear"}.
2. categoryId: MUST be chosen ONLY from the provided categories list by matching id, or null if debt/settlement/card bill.
3. Match person names case-insensitively with the provided contacts if possible; otherwise use the name in Title Case.
4. Default paymentMethod is "upi" for plain expenses when not specified in text. Never output "unknown" for paymentMethod.
5. If text mentions credit card / cc, require cardName (e.g. "SBI", "HDFC").
6. Resolve relative dates ("kal" = yesterday, "parso" = 2 days ago, "aaj" = today) relative to the provided \`today\` ("YYYY-MM-DD").

SEMANTIC PATTERNS & EXAMPLES:
- "X se mujhe N lene hain" / "X ne mujhse N liye" / "maine X ko N diye udhaar" -> kind: "lent", person: "X", direction: null.
- "mujhe X ko N dene hain" / "maine X se N udhaar liye" / "I owe X N" -> kind: "borrowed", person: "X", direction: null.
- "X take N dinner" / "X ka hissa N" -> kind: "split", shares: [{"name": "Me", "amount": 0, "isMe": true}, {"name": "X", "amount": N, "isMe": false}].
- "X ne N wapas kiye" / "X ne N de diye" -> kind: "settlement", direction: "in", person: "X".
- "maine X ko N wapas kiye" -> kind: "settlement", direction: "out", person: "X".
- "SBI card bill N bhara" -> kind: "card_payment", cardName: "SBI", paymentMethod: "bank" (or specified method).
- Otherwise plain expense; map to nearest category (chai/food -> Food, auto/cab/petrol -> Transport, D-Mart/shopping -> Shopping, etc.).

KEY AMBIGUITY:
"Arbaz se mujhe 200 lene hai D mart ki shopping k" (or similar):
Primary interpretation: kind: "lent", person: "Arbaz", amount: 200, note: "D-Mart shopping", categoryId: Shopping ID, ambiguous: true.
Alternatives list MUST include:
[
  {
    "kind": "split",
    "label": "Split: Arbaz owes ₹200",
    "shares": [{"name": "Me", "amount": 0, "isMe": true}, {"name": "Arbaz", "amount": 200, "isMe": false}]
  }
]
`;

async function callLLM(prompt: string, timeoutMs = 10000): Promise<string> {
  const provider = Deno.env.get("LLM_PROVIDER")?.toLowerCase() || "openai";
  const apiKey = Deno.env.get("LLM_API_KEY");
  const model = Deno.env.get("LLM_MODEL");

  if (!apiKey) {
    throw new Error("LLM_API_KEY is not configured in Edge Function secrets.");
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    if (provider === "anthropic") {
      const resp = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": apiKey,
          "anthropic-version": "2023-06-01",
        },
        body: JSON.stringify({
          model: model || "claude-3-5-haiku-20241022",
          system: SYSTEM_PROMPT,
          messages: [{ role: "user", content: prompt }],
          max_tokens: 1024,
          temperature: 0,
        }),
        signal: controller.signal,
      });
      if (!resp.ok) {
        throw new Error(`Anthropic error ${resp.status}: ${await resp.text()}`);
      }
      const data = await resp.json();
      const content = data.content?.[0]?.text ?? "";
      return cleanJsonOutput(content);
    }

    if (provider === "gemini") {
      const cleanKey = apiKey.trim();
      const geminiModel = (model || "gemini-3.5-flash-lite").trim();
      const url = `https://generativelanguage.googleapis.com/v1beta/models/${geminiModel}:generateContent?key=${cleanKey}`;
      const resp = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-goog-api-key": cleanKey,
        },
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: SYSTEM_PROMPT }] },
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: {
            responseMimeType: "application/json",
            maxOutputTokens: 512,
            temperature: 0,
          },
        }),
        signal: controller.signal,
      });
      if (!resp.ok) {
        const errText = await resp.text();
        throw new Error(`Gemini error (${resp.status}): ${errText}`);
      }
      const data = await resp.json();
      const content = data.candidates?.[0]?.content?.parts?.[0]?.text ?? "";
      return cleanJsonOutput(content);
    }

    // Default to OpenAI / OpenAI-compatible
    const resp = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: model || "gpt-4o-mini",
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          { role: "user", content: prompt },
        ],
        response_format: { type: "json_object" },
        temperature: 0,
      }),
      signal: controller.signal,
    });
    if (!resp.ok) {
      throw new Error(`OpenAI error ${resp.status}: ${await resp.text()}`);
    }
    const data = await resp.json();
    const content = data.choices?.[0]?.message?.content ?? "";
    return cleanJsonOutput(content);
  } finally {
    clearTimeout(timer);
  }
}

function cleanJsonOutput(raw: string): string {
  let cleaned = raw.trim();
  if (cleaned.startsWith("```json")) {
    cleaned = cleaned.replace(/^```json\s*/i, "").replace(/\s*```$/, "");
  } else if (cleaned.startsWith("```")) {
    cleaned = cleaned.replace(/^```\s*/, "").replace(/\s*```$/, "");
  }
  return cleaned.trim();
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const authHeader = req.headers.get("Authorization");
  if (!authHeader) {
    return new Response(JSON.stringify({ error: "Missing authorization header" }), {
      status: 401,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY");
  if (!supabaseUrl || !supabaseAnonKey) {
    return new Response(JSON.stringify({ error: "Supabase environment not configured" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const supabase = createClient(supabaseUrl, supabaseAnonKey, {
    global: { headers: { Authorization: authHeader } },
  });

  // Verify caller's JWT
  const { data: { user }, error: userError } = await supabase.auth.getUser();
  if (userError || !user) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  // Parse and validate input payload
  let payload: RequestPayload;
  try {
    payload = await req.json();
  } catch {
    return new Response(JSON.stringify({ error: "Invalid JSON body" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const { text, categories = [], contacts = [], today, cards = [] } = payload;

  if (!text || typeof text !== "string" || text.trim().length === 0 || text.length > 300) {
    return new Response(JSON.stringify({ error: "Text is required and must be under 300 characters" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  if (!Array.isArray(categories) || categories.length > 50) {
    return new Response(JSON.stringify({ error: "Categories list must have at most 50 items" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  if (!Array.isArray(contacts) || contacts.length > 200) {
    return new Response(JSON.stringify({ error: "Contacts list must have at most 200 items" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  // Rate limit: max 50 LLM calls per user per day
  const { data: count, error: rpcError } = await supabase.rpc("bump_llm_usage");
  if (rpcError) {
    return new Response(JSON.stringify({ error: "Failed to record rate limit usage" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  if (typeof count === "number" && count > 50) {
    return new Response(JSON.stringify({ error: "Daily AI parse limit reached (50/day). Try manual entry." }), {
      status: 429,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  // Build user prompt
  const userPromptObj = {
    text: text.trim(),
    today: today || new Date().toISOString().slice(0, 10),
    categories: categories.map((c) => ({ id: c.id, name: c.name })),
    contacts: contacts.slice(0, 200),
    cards: cards.slice(0, 30),
  };

  try {
    const rawResult = await callLLM(JSON.stringify(userPromptObj));
    const parsed = JSON.parse(rawResult);

    if (parsed.error) {
      return new Response(JSON.stringify({ error: parsed.error }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify(parsed), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "LLM parsing failed";
    return new Response(JSON.stringify({ error: message }), {
      status: 502,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

