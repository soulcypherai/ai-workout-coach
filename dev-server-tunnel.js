// dev-server-tunnel.js
import { spawn } from "child_process";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const ENV_PATH = path.join(__dirname, ".env");
const SERVER_KEY = "VITE_SERVER_URL=";

console.log("🚀 Starting Cloudflare tunnel for SERVER (port 3005)...");

const tunnel = spawn(
  "cloudflared",
  ["tunnel", "--url", "http://localhost:3005"],
  {
    stdio: ["ignore", "pipe", "pipe"],
  },
);

let buffer = "";
let updated = false;

function updateServerUrl(tunnelUrl) {
  try {
    let envContent = fs.readFileSync(ENV_PATH, "utf8");

    if (new RegExp(`^${SERVER_KEY}`, "m").test(envContent)) {
      envContent = envContent.replace(
        new RegExp(`^${SERVER_KEY}.+`, "m"),
        `${SERVER_KEY}${tunnelUrl}`,
      );
    } else {
      envContent += `\n${SERVER_KEY}${tunnelUrl}\n`;
    }

    fs.writeFileSync(ENV_PATH, envContent);
    console.log("🔄 Updated VITE_SERVER_URL in .env file.");
  } catch (err) {
    console.error("❌ Failed to update .env:", err);
  }
}

function handleData(data, streamName) {
  const text = data.toString();
  process.stdout.write(`${streamName}: ${text}`);
  buffer += text;

  const urlMatch = buffer.match(/https:\/\/[^\s]+\.trycloudflare\.com/);
  if (urlMatch && !updated) {
    const tunnelUrl = urlMatch[0].trim();
    console.log(`\n✅ Server Tunnel URL found: ${tunnelUrl}\n`);

    try {
      updateServerUrl(tunnelUrl);
      updated = true;
    } catch (err) {
      console.error("❌ Update failed:", err);
    }
  }
}

tunnel.stdout.on("data", (data) => handleData(data, "LOG"));
tunnel.stderr.on("data", (data) => handleData(data, "LOG"));

tunnel.on("close", (code) => {
  console.log(`Server tunnel process exited with code ${code}`);
});
