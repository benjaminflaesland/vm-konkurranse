// netlify/functions/wc.js — proxy for worldcup26.ir (unngår CORS)
const ALLOWED = ["groups", "games", "teams", "stadiums"];

export const handler = async (event) => {
  const headers = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
  };
  if (event.httpMethod === "OPTIONS") return { statusCode: 204, headers };

  const endpoint = event.queryStringParameters?.endpoint;
  if (!ALLOWED.includes(endpoint)) {
    return { statusCode: 400, headers, body: JSON.stringify({ error: "Ugyldig endpoint" }) };
  }
  try {
    const upstream = await fetch(`https://worldcup26.ir/get/${endpoint}`, {
      headers: { "User-Agent": "vm-konkurranse/1.0" },
    });
    if (!upstream.ok) {
      return { statusCode: upstream.status, headers, body: JSON.stringify({ error: "Upstream feilet" }) };
    }
    const data = await upstream.json();
    return {
      statusCode: 200,
      headers: { ...headers, "Cache-Control": "s-maxage=60, stale-while-revalidate=30", "Content-Type": "application/json" },
      body: JSON.stringify(data),
    };
  } catch (e) {
    return { statusCode: 500, headers, body: JSON.stringify({ error: e.message }) };
  }
};
