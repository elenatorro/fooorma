import type { Context } from "@netlify/edge-functions"

const CRAWLER_RE = /bot|crawl|spider|slurp|facebookexternalhit|Twitterbot|LinkedInBot|WhatsApp|Discordbot|TelegramBot|Baiduspider|Bluesky|Mastodon/i

const SUPABASE_URL = Deno.env.get("VITE_SUPABASE_URL") ?? ""

function thumbUrl(userId: string, slug: string): string {
  return `${SUPABASE_URL}/storage/v1/object/public/shared/${userId}/${slug}.thumb.png`
}

function profileUrl(userId: string): string {
  return `${SUPABASE_URL}/storage/v1/object/public/shared/${userId}/_profile.json`
}

async function fetchAuthorName(userId: string): Promise<string | null> {
  try {
    const res = await fetch(profileUrl(userId))
    if (!res.ok) return null
    const data = await res.json()
    return data.name ?? null
  } catch {
    return null
  }
}

export default async (request: Request, context: Context) => {
  const ua = request.headers.get("user-agent") ?? ""

  // Only intercept crawlers — browsers get the SPA
  if (!CRAWLER_RE.test(ua)) {
    return context.next()
  }

  const match = new URL(request.url).pathname.match(/^\/view\/([^/]+)\/(.+)$/)
  if (!match) return context.next()

  const userId = match[1]
  const slug = decodeURIComponent(match[2])
  const author = await fetchAuthorName(userId)
  const title = author ? `${slug} by ${author} — fooorma` : `${slug} — fooorma`
  const description = author
    ? `Procedural art by ${author}, created with fooorma`
    : `Procedural art created with fooorma`
  const image = thumbUrl(userId, slug)
  const url = request.url

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <title>${title}</title>
  <meta name="description" content="${description}" />

  <meta property="og:type" content="website" />
  <meta property="og:site_name" content="fooorma" />
  <meta property="og:title" content="${title}" />
  <meta property="og:description" content="${description}" />
  <meta property="og:image" content="${image}" />
  <meta property="og:image:type" content="image/png" />
  <meta property="og:image:width" content="1200" />
  <meta property="og:image:height" content="1200" />
  <meta property="og:url" content="${url}" />

  <meta name="twitter:card" content="summary_large_image" />
  <meta name="twitter:title" content="${title}" />
  <meta name="twitter:description" content="${description}" />
  <meta name="twitter:image" content="${image}" />
</head>
<body></body>
</html>`

  return new Response(html, {
    headers: { "content-type": "text/html; charset=utf-8" },
  })
}

export const config = {
  path: "/view/*",
}
