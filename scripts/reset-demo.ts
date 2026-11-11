import "dotenv/config";
import { inArray, eq } from "drizzle-orm";
import { db, pool } from "../src/db";
import * as s from "../src/db/schema";
import { DEMO_ORG_ID, DEMO_USER_ID, ensureDemo } from "../src/lib/seed";
// Rebuilds the public sandbox with valid UUIDs. Only the demo organization and its seeded users are touched.
async function main() {
  await db.delete(s.organizations).where(eq(s.organizations.id, DEMO_ORG_ID));
  const seededUsers = (await db.select({ id: s.users.id, email: s.users.email }).from(s.users)).filter(u => u.id === DEMO_USER_ID || u.id.startsWith("10000000-0000-4000-") || u.email.endsWith("@acme.dev"));
  if (seededUsers.length) await db.delete(s.users).where(inArray(s.users.id, seededUsers.map(u => u.id)));
  await ensureDemo();
  console.log("Demo sandbox reset with valid identifiers.");
}
main().catch(e => { console.error(e); process.exitCode = 1; }).finally(() => pool.end());
