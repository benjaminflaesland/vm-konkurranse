// api/wc.js — Vercel proxy for worldcup26.ir
// Unngår CORS ved å rute kall gjennom Vercel-funksjonen
export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.status(204).end();

  const { endpoint } = req.query;
  const allowed = ["groups", "games", "teams", "stadiums"];
  if (!allowed.includes(endpoint)) {
    return res.status(400).json({ error: "Ugyldig endpoint" });
  }
  try {
    const upstream = await fetch(`https://worldcup26.ir/get/${endpoint}`, {
      headers: { "User-Agent": "vm-konkurranse/1.0" },
    });
    if (!upstream.ok) {
      return res.status(upstream.status).json({ error: "Upstream feilet" });
    }
    const data = await upstream.json();
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Cache-Control", "s-maxage=60, stale-while-revalidate=30");
    res.json(data);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
}
