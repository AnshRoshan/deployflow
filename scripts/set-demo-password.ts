import "dotenv/config";
import { eq } from "drizzle-orm";
import { db, pool } from "../src/db";
import { users } from "../src/db/schema";
import { DEMO_EMAIL, DEMO_PASSWORD } from "../src/lib/demo";
import { hashPassword } from "../src/lib/security";
async function main() {
  const passwordHash = await hashPassword(DEMO_PASSWORD);
  const [user] = await db.update(users).set({ passwordHash, emailVerified: true }).where(eq(users.email, DEMO_EMAIL)).returning({ id: users.id, email: users.email });
  if (!user) throw new Error("Demo user not found. Run scripts/reset-demo.ts first.");
  console.log(`Demo login ready: ${user.email} / ${DEMO_PASSWORD}`);
}
main().catch(e => { console.error(e); process.exitCode = 1; }).finally(() => pool.end());
