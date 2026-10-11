# Supabase Edge Function: `parse-entry`

Provides an LLM-backed natural language parser fallback for SpendWise quick entry.

## Setup & Deployment

1. **Deploy the Edge Function to your Supabase project:**
   ```bash
   supabase functions deploy parse-entry --no-verify-jwt
   ```
   *(Note: The function validates caller JWT tokens internally via `supabase.auth.getUser()` using the `Authorization: Bearer <token>` header).*

2. **Configure Provider Secrets:**
   Set the provider and API key in Supabase Dashboard (**Edge Functions → Secrets**) or via the CLI:

   ```bash
   # Option 1: OpenAI (default)
   supabase secrets set LLM_PROVIDER=openai
   supabase secrets set LLM_API_KEY=your_openai_api_key_here
   supabase secrets set LLM_MODEL=gpt-4o-mini

   # Option 2: Anthropic Claude
   supabase secrets set LLM_PROVIDER=anthropic
   supabase secrets set LLM_API_KEY=your_anthropic_api_key_here
   supabase secrets set LLM_MODEL=claude-3-5-haiku-20241022

   # Option 3: Google Gemini
   supabase secrets set LLM_PROVIDER=gemini
   supabase secrets set LLM_API_KEY=your_gemini_api_key_here
   supabase secrets set LLM_MODEL=gemini-3.5-flash-lite
   ```

## Rate Limiting & Security
- **Max 50 requests per user per day:** Tracked via the `public.llm_usage` table and `bump_llm_usage()` PostgreSQL function.
- **Strict authentication:** Unauthenticated requests receive HTTP 401.
- **Privacy:** User text and API keys are never logged in function logs.

