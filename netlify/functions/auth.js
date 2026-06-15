// netlify/functions/auth.js
export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.status(204).end();
  if (req.method !== "POST") return res.status(405).end();

  const { password } = req.body || {};
  const ok = !!process.env.ADMIN_PASSWORD && password === process.env.ADMIN_PASSWORD;
  res.json({ ok });
}
