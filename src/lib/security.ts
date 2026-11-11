import { createHash, randomBytes, scrypt as scryptCallback, timingSafeEqual, createCipheriv, createDecipheriv } from "node:crypto";
import { encryptionKey } from "./key";
import { promisify } from "node:util";
const scrypt = promisify(scryptCallback);
export const hashToken = (token: string) => createHash("sha256").update(token).digest("hex");
export const newToken = () => randomBytes(32).toString("hex");
export async function hashPassword(password: string) {
  const salt = randomBytes(16).toString("hex");
  const key = await scrypt(password, salt, 64) as Buffer;
  return `${salt}:${key.toString("hex")}`;
}
export async function verifyPassword(password: string, stored: string | null) {
  if (!stored) { await scrypt(password, "deployflow-dummy-salt", 64); return false; }
  const [salt, hash] = stored.split(":");
  const key = await scrypt(password, salt, 64) as Buffer;
  const expected = Buffer.from(hash, "hex");
  return key.length === expected.length && timingSafeEqual(key, expected);
}
export function encrypt(value: string) {
  const iv = randomBytes(12); const cipher = createCipheriv("aes-256-gcm", encryptionKey(), iv);
  const encrypted = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
  return [iv.toString("hex"), cipher.getAuthTag().toString("hex"), encrypted.toString("hex")].join(":");
}
export function decrypt(value: string) {
  const [iv, tag, data] = value.split(":"); const decipher = createDecipheriv("aes-256-gcm", encryptionKey(), Buffer.from(iv, "hex"));
  decipher.setAuthTag(Buffer.from(tag, "hex")); return Buffer.concat([decipher.update(Buffer.from(data, "hex")), decipher.final()]).toString("utf8");
}
export function safeEqual(a: string, b: string) { const x = Buffer.from(a); const y = Buffer.from(b); return x.length === y.length && timingSafeEqual(x, y); }
export function branchSlug(name: string, id: string) {
  const label = name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 42).replace(/-$/g, "") || "branch";
  return `${label}-${createHash("sha256").update(id).digest("hex").slice(0, 8)}`;
}
export const canDeploy = (role: string) => ["Owner", "Admin", "Developer"].includes(role);
export const canAdmin = (role: string) => ["Owner", "Admin"].includes(role);
