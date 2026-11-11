import { createDecipheriv, randomBytes } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

const KEY_FILE = path.join(process.cwd(), ".secrets", "encryption-key");
let cached: Buffer | null = null;
let source: "env" | "file" | "ephemeral" = "ephemeral";

const isHexKey = (value: string | undefined): value is string => Boolean(value && /^[a-fA-F0-9]{64}$/.test(value.trim()));

// The managed sandbox can reset .env between runs, so a missing key must never take
// the control plane down. Prefer the environment variable, then a persisted local key,
// and only fall back to an ephemeral key (which keeps the app usable but not durable).
export function encryptionKey(): Buffer {
  if (cached) return cached;
  const fromEnv = process.env.SECRET_ENCRYPTION_KEY;
  if (isHexKey(fromEnv)) { cached = Buffer.from(fromEnv.trim(), "hex"); source = "env"; return cached; }
  try {
    if (existsSync(KEY_FILE)) {
      const stored = readFileSync(KEY_FILE, "utf8").trim();
      if (isHexKey(stored)) { cached = Buffer.from(stored, "hex"); source = "file"; return cached; }
    }
    mkdirSync(path.dirname(KEY_FILE), { recursive: true });
    const generated = randomBytes(32).toString("hex");
    writeFileSync(KEY_FILE, generated, { mode: 0o600 });
    cached = Buffer.from(generated, "hex"); source = "file";
    console.warn("[deployflow] SECRET_ENCRYPTION_KEY is not set. Generated a local key at .secrets/encryption-key. Set the environment variable for production.");
    return cached;
  } catch {
    cached = randomBytes(32); source = "ephemeral";
    console.warn("[deployflow] Unable to persist an encryption key. Secrets will not survive a restart.");
    return cached;
  }
}

export function keySource() { encryptionKey(); return source; }
export function safeDecrypt(value: string | null | undefined): string | null {
  if (!value) return null;
  try { return decryptValue(value); } catch { return null; }
}
function decryptValue(value: string) {
  const [iv, tag, data] = value.split(":");
  const decipher = createDecipheriv("aes-256-gcm", encryptionKey(), Buffer.from(iv, "hex"));
  decipher.setAuthTag(Buffer.from(tag, "hex"));
  return Buffer.concat([decipher.update(Buffer.from(data, "hex")), decipher.final()]).toString("utf8");
}
