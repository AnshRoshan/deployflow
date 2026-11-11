import { sql } from "drizzle-orm";
import { db } from "@/db";
import { rateLimits } from "@/db/schema";
import { ApiError } from "./auth";
export async function rateLimit(key: string, limit = 15, windowSeconds = 60) {
  const now = new Date(); const bucket = Math.floor(now.getTime() / (windowSeconds * 1000));
  const [row] = await db.insert(rateLimits).values({ key: `${key}:${bucket}`, count: 1, expiresAt: new Date((bucket + 2) * windowSeconds * 1000) }).onConflictDoUpdate({ target: rateLimits.key, set: { count: sql`${rateLimits.count} + 1` } }).returning({ count: rateLimits.count });
  if (row.count > limit) throw new ApiError("Too many requests. Please wait a moment and try again.", 429);
}
