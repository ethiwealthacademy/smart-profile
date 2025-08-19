// scripts/fetch_content.mjs
import fs from "fs/promises";
import path from "path";

const ROOT = path.resolve(process.cwd());
// <-- IMPORTANT: write inside /docs so Pages can see it
const CONTENT_PATH = path.join(ROOT, "docs", "content", "content.json");

// env from GitHub Actions secrets (with safe fallbacks)
const env = {
  YT_KEY: process.env.YOUTUBE_API_KEY,
  YT_CH: process.env.YOUTUBE_CHANNEL_ID,
  IG_TOKEN: process.env.INSTAGRAM_TOKEN,
  OPENAI: process.env.OPENAI_API_KEY,
  BRAND: process.env.BRAND_NAME || "My Brand",
  AUDIENCE: process.env.AUDIENCE || "general audience",
  OFFER_BASE: process.env.OFFER_BASELINE || "Check out my latest!"
};

async function safeJson(res) {
  try { return await res.json(); } catch { return null; }
}

async function fetchLatestYouTube() {
  if (!env.YT_KEY || !env.YT_CH) {
    console.warn("YouTube env missing (YOUTUBE_API_KEY or YOUTUBE_CHANNEL_ID). Skipping YouTube.");
    return null;
  }

  const url = new URL("https://www.googleapis.com/youtube/v3/search");
  url.searchParams.set("part", "snippet");
  url.searchParams.set("channelId", env.YT_CH);
  url.searchParams.set("maxResults", "1");
  url.searchParams.set("order", "date");
  url.searchParams.set("type", "video");
  url.searchParams.set("key", env.YT_KEY);

  const res = await fetch(url);
  if (!res.ok) {
    const body = await safeJson(res);
    console.error("YouTube API error:", res.status, res.statusText, body || "");
    return null; // don't throw; continue with fallback payload
  }

  const data = await res.json();
  const item = data.items?.[0];
  if (!item) {
    console.warn("YouTube returned no items. Ensure Channel ID starts with UC… and has public videos.");
    return null;
  }

  const videoId = item.id.videoId;
  return {
    platform: "youtube",
    videoId,
    title: item.snippet.title,
    publishedAt: item.snippet.publishedAt,
    url: `https://www.youtube.com/watch?v=${videoId}`,
    thumbnail: item.snippet.thumbnails?.high?.url
  };
}

// (Optional) Instagram — leave as null for now; add later if you obtain a token
async function fetchLatestInstagram() {
  if (!env.IG_TOKEN) return null;
  const fields = [
    "id","caption","permalink","media_type","media_url","thumbnail_url","timestamp"
  ].join(",");

  const url = `https://graph.instagram.com/me/media?fields=${fields}&access_token=${env.IG_TOKEN}`;
  const res = await fetch(url);
  if (!res.ok) {
    const body = await safeJson(res);
    console.error("Instagram API error:", res.status, res.statusText, body || "");
    return null;
  }
  const data = await res.json();
  const post = data.data?.[0];
  if (!post) return null;

  return {
    platform: "instagram",
    caption: post.caption || "",
    url: post.permalink,
    mediaType: post.media_type,
    mediaUrl: post.media_url,
    thumb: post.thumbnail_url || post.media_url,
    timestamp: post.timestamp
  };
}

async function generateAIHeadline({ brand, audience, yt, offer }) {
  if (!env.OPENAI) {
    const base = yt?.title || offer || "Welcome";
    return `${brand} — ${base}`.slice(0, 90);
  }

  try {
    const prompt = `Write a short, punchy landing page headline (max 12 words) for ${brand}.
Audience: ${audience}.
Latest YouTube title: ${yt?.title || "(none)"}.
Offer: ${offer}.`;

    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${env.OPENAI}`
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        messages: [
          { role: "system", content: "You are a concise marketing copywriter." },
          { role: "user", content: prompt }
        ],
        temperature: 0.7,
        max_tokens: 40
      })
    });

    if (!res.ok) {
      const body = await safeJson(res);
      console.error("OpenAI error:", res.status, res.statusText, body || "");
      return `${brand} — ${offer}`;
    }

    const data = await res.json();
    return data.choices?.[0]?.message?.content?.trim() || `${brand} — ${offer}`;
  } catch (e) {
    console.error("OpenAI call failed:", e.message);
    return `${brand} — ${offer}`;
  }
}

async function main() {
  const [yt, ig] = await Promise.all([
    fetchLatestYouTube().catch(e => (console.error("YT fetch failed:", e.message), null)),
    fetchLatestInstagram().catch(e => (console.error("IG fetch failed:", e.message), null))
  ]);

  const offer = env.OFFER_BASE;
  const headline = await generateAIHeadline({
    brand: env.BRAND,
    audience: env.AUDIENCE,
    yt,
    offer
  });

  const payload = {
    brand: env.BRAND,
    audience: env.AUDIENCE,
    updatedAt: new Date().toISOString(),
    headline,
    offer,
    youtube: yt,
    instagram: ig,
    buttons: [
      yt?.url && { label: "YouTube", href: yt.url },
      ig?.url && { label: "Instagram", href: ig.url }
    ].filter(Boolean),
    contact: [
      { label: "WhatsApp", href: "https://wa.me/9665XXXXXXXX" },
      { label: "Email", href: "mailto:you@example.com" }
    ]
  };

  await fs.mkdir(path.dirname(CONTENT_PATH), { recursive: true });
  await fs.writeFile(CONTENT_PATH, JSON.stringify(payload, null, 2), "utf8");
  console.log("Wrote:", CONTENT_PATH);
}

main().catch(e => {
  console.error("Fatal error:", e);
  // Do not exit with non-zero to avoid failing the workflow unnecessarily
});
