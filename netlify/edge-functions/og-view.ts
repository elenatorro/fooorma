import type { Context } from "@netlify/edge-functions"

const CRAWLER_RE = /bot|crawl|spider|slurp|facebookexternalhit|Twitterbot|LinkedInBot|WhatsApp|Discordbot|TelegramBot|Baiduspider|bsky/i

const SUPABASE_URL = Deno.env.get("VITE_SUPABASE_URL") ?? ""

function thumbUrl(userId: string, slug: string): string {
  return `${SUPABASE_URL}/storage/v1/object/public/shared/${userId}/${slug}.thumb.webp`
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
  const title = `${slug} — fooorma`
  const description = "Procedural art made with fooorma"
  const image = thumbUrl(userId, slug)
  const url = request.url

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <title>${title}</title>
  <meta name="description" content="${description}" />
  <meta property="og:type" content="website" />
  <meta property="og:title" content="${title}" />
  <meta property="og:description" content="${description}" />
  <meta property="og:image" content="${image}" />
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
