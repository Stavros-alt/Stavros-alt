import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from 'jsr:@supabase/supabase-js@2';

const DISCORD_BOT_TOKEN = Deno.env.get("DISCORD_BOT_TOKEN") ?? "";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// postgrest throws plain { message } objects on gateway 504s when the db is
// busy. those are transient, so retry with backoff instead of 500ing.
async function withRetry<T>(fn: () => Promise<T>, attempts = 4): Promise<T> {
  let last: unknown;
  for (let i = 0; i < attempts; i++) {
    try {
      return await fn();
    } catch (e) {
      last = e;
      await sleep(1000 * 2 ** i);
    }
  }
  throw last;
}

Deno.serve(async (req: Request) => {
  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    // find the expired stuff.
    const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

    const { data: suggestions, error } = await withRetry(() =>
      supabase
        .from('feature_suggestions')
        .select('*')
        .eq('status', 'pending')
        .not('discord_message_id', 'is', null)
        .lt('created_at', twentyFourHoursAgo)
        .throwOnError()
    );

    if (error) throw error;
    if (!suggestions || suggestions.length === 0) {
      return new Response(JSON.stringify({ message: "Nothing to process." }), { status: 200 });
    }

    const results = [];
    const failures = [];

    for (const sugg of suggestions) {
      try {
        const response = await withRetry(() =>
          fetch(`https://discord.com/api/v10/channels/${sugg.discord_channel_id}/messages/${sugg.discord_message_id}`, {
            headers: { "Authorization": `Bot ${DISCORD_BOT_TOKEN}` },
            signal: AbortSignal.timeout(8000),
          })
        );

        if (!response.ok) {
          console.error(`Failed to fetch message ${sugg.discord_message_id}: ${response.status}`);
          failures.push({ id: sugg.id, reason: `discord ${response.status}` });
          continue;
        }

        const msg = await response.json();
        const poll = msg.poll;

        if (!poll) continue;

        const yesVotes = poll.answers.find((a: any) => a.answer_id === 1)?.count || 0;
        const noVotes = poll.answers.find((a: any) => a.answer_id === 2)?.count || 0;

        const verdict = yesVotes > noVotes ? "APPROVED" : "REJECTED";

        // just mark it done and move on.
        await withRetry(() =>
          supabase
            .from('feature_suggestions')
            .update({ status: 'processed' })
            .eq('id', sugg.id)
            .throwOnError()
        );

        results.push({ id: sugg.id, verdict });
      } catch (e) {
        console.error(`row ${sugg.id} failed, continuing:`, e);
        failures.push({ id: sugg.id, reason: String((e as any)?.message ?? e) });
      }
    }

    return new Response(JSON.stringify({ success: true, processed: results, failures }), {
      headers: { "Content-Type": "application/json" },
      status: 200,
    });
  } catch (err) {
    console.error(err);
    return new Response(JSON.stringify({ error: (err as any)?.message ?? "unknown" }), {
      headers: { "Content-Type": "application/json" },
      status: 500,
    });
  }
});
