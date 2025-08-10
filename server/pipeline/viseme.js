import { spawn } from "child_process";
import { randomUUID } from "crypto";
import ffmpegPath from "ffmpeg-static";
import { existsSync } from "fs";
import { mkdir, readFile, rm } from "fs/promises";
import os from "os";
import { join, resolve } from "path";
import { platform } from "process";

const platformDir =
  platform === "win32"
    ? "win32"
    : platform === "darwin"
      ? "darwin"
      : platform === "linux"
        ? "linux"
        : null;

export const RHUBARB = resolve(
  "../bin",
  platformDir,
  platform === "win32" ? "rhubarb.exe" : "rhubarb",
);

function runCommand(command, args = [], stdinBuffer = null) {
  return new Promise((resolve, reject) => {
    const proc = spawn(command, args);

    let stderr = "";
    proc.stderr?.on("data", (data) => (stderr += data.toString()));

    proc.on("error", reject);
    proc.on("close", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`${command} exited with code ${code}: ${stderr}`));
    });

    if (stdinBuffer) {
      proc.stdin.write(stdinBuffer);
      proc.stdin.end();
    }
  });
}

export async function generateVisemes(audioBuffer) {
  if (!existsSync(RHUBARB)) {
    throw new Error(`Rhubarb binary not found at: ${RHUBARB}`);
  }

  const baseDir = join(os.tmpdir(), "pitchroom", randomUUID());
  const wavPath = join(baseDir, "audio.wav");
  const jsonPath = join(baseDir, "output.json");

  await mkdir(baseDir, { recursive: true });

  try {
    await runCommand(
      ffmpegPath,
      [
        "-y",
        "-f",
        "mp3",
        "-i",
        "pipe:0",
        "-ar",
        "16000",
        "-ac",
        "1",
        "-c:a",
        "pcm_s16le",
        wavPath,
      ],
      audioBuffer,
    );

    await runCommand(RHUBARB, [
      "-r",
      "phonetic",
      "-f",
      "json",
      wavPath,
      "-o",
      jsonPath,
    ]);

    const visemeData = await readFile(jsonPath, "utf8");
    return JSON.parse(visemeData);
  } finally {
    await rm(baseDir, { recursive: true, force: true });
  }
}
