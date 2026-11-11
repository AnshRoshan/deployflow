import { db } from "@/db";
import { sql } from "drizzle-orm";
import { keySource } from "@/lib/key";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    await db.execute(sql`select 1`);
    return Response.json({ ok: true, keySource: keySource() });
  } catch {
    return Response.json({ ok: false }, { status: 500 });
  }
}
