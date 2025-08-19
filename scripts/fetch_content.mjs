s.env.OFFER_BASELINE || "Check out my latest!",
 };
 async function fetchLatestYouTube() {
 if (!env.YT_KEY || !env.YT_CH) return null;
 const url = new URL("https://www.googleapis.com/youtube/v3/search");
 url.searchParams.set("part", "snippet");
 url.searchParams.set("channelId", env.YT_CH);
 url.searchParams.set("maxResults", "1");
 url.searchParams.set("order", "date");
 url.searchParams.set("type", "video");
 url.searchParams.set("key", env.YT_KEY);
 const res = await fetch(url);
 if (!res.ok) throw new Error("YouTube API error: " + res.status);
 const data = await res.json();
 const item = data.items?.[0];
 if (!item) return null;
 const videoId = item.id.videoId;
 return {
 platform: "youtube",
 videoId,
 title: item.snippet.title,
 publishedAt: item.snippet.publishedAt,
 url: `https://www.youtube.com/watch?v=${videoId}`,
 thumbnail: item.snippet.thumbnails?.high?.url,
 };
 }
 async function fetchLatestInstagram() {
 if (!env.IG_TOKEN) return null;
 const fields =
 ram",
 caption: post.caption || "",
 url: post.permalink,
 mediaType: post.media_type,
 mediaUrl: post.media_url,
 thumb: post.thumbnail_url || post.media_url,
 timestamp: post.timestamp,
 };
 }
 async function generateAIHeadline({ brand, audience, yt, ig, offer }) {
 if (!env.OPENAI) {
 const base = yt?.title || ig?.caption || offer || "Welcome";
 return `${brand} — ${base}`.slice(0, 90);
 }
 const prompt = `Write a short, punchy landing page headline (max 12 
words) for ${brand}.
 Audience: ${audience}.
 Latest YouTube title: ${yt?.title || "(none)"}.
 Latest IG caption: ${ig?.caption?.slice(0, 180) || "(none)"}.
 Offer: ${offer}.`;
 const res = await fetch("https://api.openai.com/v1/chat/completions",
 {
 method: "POST",
 headers: {"Content-Type": "application/json", Authorization:
 `Bearer ${env.OPENAI}`},
 body: JSON.stringify({
 model: "gpt-4o-mini",
 messages: [
 { role: "system", content: "You are a concise marketing 
copywriter." },
 { role: "user", content: prompt },
 ],
 temperature: 0.7,
 max_tokens: 40,
 }),
 });
 if (!res.ok) throw new Error("OpenAI error: " + res.status);
 const data = await res.json();
 return data.choices?.[0]?.message?.content?.trim() || `${brand} — 
Welcome`;
 }
 async function main() {
 const [yt, ig] = await Promise.all([
 fetchLatestYouTube().catch(() => null),
 fetchLatestInstagram().catch(() => null),
 ]);
 const offer = env.OFFER_BASE;
 const headline = await generateAIHeadline({ brand: env.BRAND,
 audience: env.AUDIENCE, yt, ig, offer }).catch(() => `${env.BRAND} — $
 {offer}`);
 const payload = {
 brand: env.BRAND,
 audience: env.AUDIENCE,
 updatedAt: new Date().toISOString(),
 headline,
 offer,
 youtube: yt,
 instagram: ig,
 buttons: [ yt?.url && { label: "YouTube", href: yt.url }, ig?.url
 && { label: "Instagram", href: ig.url } ].filter(Boolean),
 contact: [ { label: "WhatsApp", href: "https://wa.me/
 9665XXXXXXXX" }, { label: "Email", href: "mailto:you@example.com" } ],
 };
 await fs.mkdir(path.dirname(CONTENT_PATH), { recursive: true });
 await fs.writeFile(CONTENT_PATH, JSON.stringify(payload, null, 2),
 "utf8");
 console.log("Updated:", CONTENT_PATH);
 }
 main().catch((e) => { console.error(e); process.exit(1); });