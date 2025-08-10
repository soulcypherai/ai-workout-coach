// dev-tunnel.js
import { spawn } from "child_process";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const ENV_PATH = path.join(__dirname, "server", ".env");
const FARCASTER_PATH = path.join(__dirname,"public", ".well-known", "farcaster.json");
const INDEX_PATH = path.join(__dirname, "index.html");
const FRONTEND_KEY = "FRONTEND_URL=";

console.log("🚀 Starting Cloudflare tunnel...");

const tunnel = spawn(
  "cloudflared",
  ["tunnel", "--url", "http://localhost:3004"],
  {
    stdio: ["ignore", "pipe", "pipe"],
  },
);

let buffer = "";
let updated = false;

// ✅ Update .env file
function updateEnv(tunnelUrl) {
  let envContent = fs.readFileSync(ENV_PATH, "utf8");

  if (/^FRONTEND_URL=/m.test(envContent)) {
    envContent = envContent.replace(
      /^FRONTEND_URL=.*/m,
      `${FRONTEND_KEY}${tunnelUrl}`,
    );
  } else {
    envContent += `\n${FRONTEND_KEY}${tunnelUrl}\n`;
  }

  fs.writeFileSync(ENV_PATH, envContent);
  console.log("🔄 Updated FRONTEND_URL in .env file.");
}

// ✅ Update farcaster.json file
function updateFarcasterJson(tunnelUrl) {
  try {
    const farcasterData = JSON.parse(fs.readFileSync(FARCASTER_PATH, "utf8"));

    function replaceUrls(obj) {
      for (const key in obj) {
        if (
          typeof obj[key] === "string" &&
          obj[key].includes("trycloudflare.com")
        ) {
          obj[key] = obj[key].replace(
            /https:\/\/[^/\s]+\.trycloudflare\.com/g,
            tunnelUrl,
          );
        } else if (Array.isArray(obj[key])) {
          obj[key] = obj[key].map((item) =>
            typeof item === "string" && item.includes("trycloudflare.com")
              ? item.replace(
                  /https:\/\/[^/\s]+\.trycloudflare\.com/g,
                  tunnelUrl,
                )
              : item,
          );
        } else if (typeof obj[key] === "object" && obj[key] !== null) {
          replaceUrls(obj[key]);
        }
      }
    }

    replaceUrls(farcasterData);

    fs.writeFileSync(FARCASTER_PATH, JSON.stringify(farcasterData, null, 2));
    console.log("🔄 Updated URLs in farcaster.json file.");
  } catch (err) {
    console.error("❌ Failed to update farcaster.json:", err);
  }
}
function updateViteConfig(tunnelUrl) {
    try {
      let viteConfig = fs.readFileSync(path.join(__dirname, "vite.config.ts"), "utf8");
  
      // Extract hostname from URL (remove https://)
      const newHost = tunnelUrl.replace(/^https?:\/\//, "");
  
      viteConfig = viteConfig.replace(
        /allowedHosts:\s*\[\s*"[^"]*"\s*\]/,
        `allowedHosts: ["${newHost}"]`
      );
  
      fs.writeFileSync(path.join(__dirname, "vite.config.ts"), viteConfig);
      console.log("🔄 Updated allowedHosts in vite.config.ts.");
    } catch (err) {
      console.error("❌ Failed to update vite.config.ts:", err);
    }
  }

  
function updateIndexHtml(tunnelUrl) {
    try {
      let html = fs.readFileSync(INDEX_PATH, "utf8");
  
      // ✅ Replace all trycloudflare URLs inside fc:frame
      html = html.replace(
        /(<meta\s+name="fc:frame"\s+content='[^']*')/g,
        (match) => match.replace(/https:\/\/[^'\s]+\.trycloudflare\.com/g, tunnelUrl)
      );
  
      // ✅ Replace all trycloudflare URLs inside fc:miniapp
      html = html.replace(
        /(<meta\s+name="fc:miniapp"\s+content='[^']*')/g,
        (match) => match.replace(/https:\/\/[^'\s]+\.trycloudflare\.com/g, tunnelUrl)
      );
  
      // ✅ Replace trycloudflare URL in og:image tag
      html = html.replace(
        /(<meta\s+property="og:image"\s+content=")[^"\s]+\.trycloudflare\.com([^"]*")/g,
        `$1${tunnelUrl}$2`
      );
  
      fs.writeFileSync(INDEX_PATH, html);
      console.log("🔄 Updated trycloudflare URLs in fc:frame, fc:miniapp, and og:image meta tags.");
    } catch (err) {
      console.error("❌ Failed to update index.html:", err);
    }
  }
    

function handleData(data, streamName) {
  const text = data.toString();
  process.stdout.write(`${streamName}: ${text}`);
  buffer += text;

  const urlMatch = buffer.match(/https:\/\/[^\s]+\.trycloudflare\.com/);
  if (urlMatch && !updated) {
    const tunnelUrl = urlMatch[0].trim();
    console.log(`\n✅ Tunnel URL found: ${tunnelUrl}\n`);

    try {
      updateEnv(tunnelUrl);
      updateFarcasterJson(tunnelUrl);
      updateIndexHtml(tunnelUrl);
      updateViteConfig(tunnelUrl);
      updated = true;
    } catch (err) {
      console.error("❌ Update failed:", err);
    }
  }
}

tunnel.stdout.on("data", (data) => handleData(data, "LOG"));
tunnel.stderr.on("data", (data) => handleData(data, "LOG"));

tunnel.on("close", (code) => {
  console.log(`Tunnel process exited with code ${code}`);
});
