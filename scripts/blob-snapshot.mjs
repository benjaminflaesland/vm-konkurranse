import { mkdir, writeFile } from "node:fs/promises";
import { getStore } from "@netlify/blobs";

const siteID = process.env.NETLIFY_SITE_ID;
const token = process.env.NETLIFY_AUTH_TOKEN;

if (!siteID || !token) {
  throw new Error("NETLIFY_SITE_ID og NETLIFY_AUTH_TOKEN må være satt");
}

const store = getStore({ name: "vm2026", siteID, token });
const data = await store.get("competition-data", { type: "json" });
if (!data?.participants) throw new Error("Fant ikke gyldig competition-data i Blob-lageret");

const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
const path = `backups/competition-data-${timestamp}.json`;
await mkdir("backups", { recursive: true });
await writeFile(path, `${JSON.stringify(data, null, 2)}\n`, { flag: "wx", mode: 0o600 });
console.log(`Snapshot lagret i ${path}`);
