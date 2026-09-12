import "jsr:@supabase/functions-js/edge-runtime.d.ts"
import { createClient } from "jsr:@supabase/supabase-js@2"
import nacl from "npm:tweetnacl@1.0.3"

// supabase holds all state here
// no gateway, discord posts to this endpoint when it is set

const CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"

function randomToken(): string {
  const a = new Uint8Array(4)
  crypto.getRandomValues(a)
  let out = ""
  for (let i = 0; i < 4; i++) out += CHARS[a[i] % CHARS.length]
  return out
}

function hexToUint8(hex: string): Uint8Array {
  return new Uint8Array(hex.match(/.{1,2}/g)!.map((b) => parseInt(b, 16)))
}

async function verifyDiscord(req: Request, body: string): Promise<boolean> {
  const sig = req.headers.get("x-signature-ed25519")
  const ts = req.headers.get("x-signature-timestamp")
  const pub = Deno.env.get("DISCORD_PUBLIC_KEY")
  if (!sig || !ts || !pub) return false
  try {
    return nacl.sign.detached.verify(
      new TextEncoder().encode(ts + body),
      hexToUint8(sig),
      hexToUint8(pub),
    )
  } catch {
    return false
  }
}

function json(data: unknown): Response {
  return new Response(JSON.stringify(data), {
    headers: { "Content-Type": "application/json" },
  })
}

// edit the deferred "thinking" message after background work finishes
// webhook token in the url is the auth, no bot token needed
async function followup(appId: string, interToken: string, content: string) {
  try {
    await fetch(
      `https://discord.com/api/v10/webhooks/${appId}/${interToken}/messages/@original`,
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content, flags: 64 }),
      },
    )
  } catch (_) {}
}

Deno.serve(async (req: Request) => {
  const supabase = createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
  )

  const url = new URL(req.url)
  if (req.method === "GET" && url.searchParams.get("cleanup") === "1") {
    const token = Deno.env.get("DISCORD_BOT_TOKEN")
    if (!token) return new Response("missing DISCORD_BOT_TOKEN", { status: 500 })
    const meRes = await fetch("https://discord.com/api/v10/applications/@me", { headers: { Authorization: `Bot ${token}` } })
    const me = await meRes.json()
    const del = await fetch(`https://discord.com/api/v10/applications/${me.id}/commands`, { method: "PUT", headers: { Authorization: `Bot ${token}`, "Content-Type": "application/json" }, body: JSON.stringify([]) })
    return new Response(`cleared global: ${await del.text()}`, { status: 200 })
  }
  if (req.method === "GET" && url.searchParams.get("register") === "1") {
    const token = Deno.env.get("DISCORD_BOT_TOKEN")
    if (!token) return new Response("missing DISCORD_BOT_TOKEN", { status: 500 })
    const meRes = await fetch("https://discord.com/api/v10/applications/@me", {
      headers: { Authorization: `Bot ${token}` },
    })
    if (!meRes.ok) return new Response(`failed to get app id: ${await meRes.text()}`, { status: 500 })
    const me = await meRes.json()
    const appId = me.id
    const commands = [
      { name: "gettoken", description: "get your private voting token (DM/ephemeral only)" },
      {
        name: "vote",
        description: "submit a ranked ballot",
        options: [
          { name: "token", description: "your 4-char token", type: 3, required: true },
          { name: "choices", description: "ranked choices comma separated, eg 12,4,7", type: 3, required: true },
        ],
      },
    ]
    const putRes = await fetch(`https://discord.com/api/v10/applications/${appId}/commands`, {
      method: "PUT",
      headers: { Authorization: `Bot ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify(commands),
    })
    const body2 = await putRes.text()
    const endpoint = "https://tsqubxgafnzmxejwknbm.supabase.co/functions/v1/election-bot"
    await fetch(`https://discord.com/api/v10/applications/${appId}`, {
      method: "PATCH",
      headers: { Authorization: `Bot ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ interactions_endpoint_url: endpoint }),
    })
    try {
      const guildsRes = await fetch("https://discord.com/api/v10/users/@me/guilds", {
        headers: { Authorization: `Bot ${token}` },
      })
      if (guildsRes.ok) {
        const guilds = await guildsRes.json()
        for (const g of guilds) {
          await fetch(`https://discord.com/api/v10/applications/${appId}/guilds/${g.id}/commands`, {
            method: "PUT",
            headers: { Authorization: `Bot ${token}`, "Content-Type": "application/json" },
            body: JSON.stringify(commands),
          })
        }
      }
    } catch (_) {}
    return new Response(body2, { status: putRes.status, headers: { "Content-Type": "application/json" } })
  }

  if (req.method !== "POST") return new Response("ok", { status: 200 })

  const body = await req.text()

  if (Deno.env.get("SKIP_VERIFY") !== "true") {
    const ok = await verifyDiscord(req, body)
    if (!ok) return new Response("invalid signature", { status: 401 })
  }

  const interaction = JSON.parse(body)

  if (interaction.type === 1) {
    return json({ type: 1 })
  }

  if (interaction.type === 2) {
    const name = interaction.data?.name
    const userId = interaction.member?.user?.id ?? interaction.user?.id

    if (name === "gettoken") {
      if (!userId) {
        return json({
          type: 4,
          data: { content: "could not resolve user", flags: 64 },
        })
      }

      const { data: existing } = await supabase
        .from("election_tokens")
        .select("token")
        .eq("user_id", String(userId))
        .maybeSingle()

      let token: string
      let isNew = false

      if (existing) {
        token = existing.token as string
      } else {
        for (let i = 0; i < 15; i++) {
          const t = randomToken()
          const { data, error } = await supabase
            .from("election_tokens")
            .insert({ user_id: String(userId), token: t })
            .select("token")
            .single()
          if (data && !error) {
            token = data.token as string
            isNew = true
            break
          }
          if (error && !error.message.includes("duplicate") && !error.message.includes("unique")) {
            throw error
          }
        }
        if (!token!) throw new Error("failed to issue token")
      }

      const dmAttempt = async () => {
        try {
          const dmRes = await fetch("https://discord.com/api/v10/users/@me/channels", {
            method: "POST",
            headers: {
              Authorization: `Bot ${Deno.env.get("DISCORD_BOT_TOKEN")}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({ recipient_id: String(userId) }),
          })
          if (!dmRes.ok) return
          const dm = await dmRes.json()
          await fetch(`https://discord.com/api/v10/channels/${dm.id}/messages`, {
            method: "POST",
            headers: {
              Authorization: `Bot ${Deno.env.get("DISCORD_BOT_TOKEN")}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              content: `your voting token: \`${token}\`${isNew ? "" : " (already issued, one per user)"}\nkeep it private`,
            }),
          })
        } catch (_) {}
      }
      // @ts-ignore
      const _ = dmAttempt()

      return json({
        type: 4,
        data: {
          content: `your voting token: \`${token}\`${isNew ? "" : " (already issued)"} also sent via DM if open`,
          flags: 64,
        },
      })
    }

    if (name === "vote") {
      // discord only waits 3s for an ack. cold boot plus db roundtrips
      // blew past that, so votes landed while discord showed a timeout.
      // ack deferred at once, do the db work in the background, then
      // edit the thinking message with the real result.
      const appId = String(interaction.application_id ?? "")
      const interToken = String(interaction.token ?? "")
      const opts = Object.fromEntries(
        (interaction.data?.options ?? []).map((o: any) => [o.name, o.value]),
      )
      const rawToken = String(opts.token ?? "").trim().toUpperCase()
      const rawChoices = String(opts.choices ?? "")

      const work = (async () => {
        const rankedChoices = rawChoices.split(",").map((s) => s.trim()).filter(Boolean)

        if (!rawToken || rankedChoices.length === 0) {
          await followup(appId, interToken, "rejected: missing token or choices")
          return
        }

        const { data: tokRow } = await supabase
          .from("election_tokens")
          .select("token")
          .eq("token", rawToken)
          .maybeSingle()
        if (!tokRow) {
          await followup(appId, interToken, "rejected: invalid token")
          return
        }

        const { error: usedErr } = await supabase.from("used_tokens").insert({ token: rawToken })
        if (usedErr) {
          if (usedErr.message.includes("duplicate") || usedErr.message.includes("unique")) {
            await followup(appId, interToken, "rejected: token already used")
          } else {
            await followup(appId, interToken, "error recording ballot, try again")
          }
          return
        }

        const { error: poolErr } = await supabase
          .from("election_pool")
          .insert({ ranked_choices: rankedChoices })
        if (poolErr) {
          await followup(appId, interToken, "error recording ballot, try again")
          return
        }

        await followup(appId, interToken, "ballot accepted")
      })()

      try {
        // @ts-ignore: supabase edge runtime background helper
        EdgeRuntime.waitUntil(work)
      } catch (_) {
        await work
      }

      return json({ type: 5, data: { flags: 64 } })
    }
  }

  return json({ type: 4, data: { content: "unknown command", flags: 64 } })
}
