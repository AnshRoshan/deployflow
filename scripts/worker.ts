import "dotenv/config";
import { and, inArray, eq, or, isNull, lt } from "drizzle-orm";
import { db, pool } from "../src/db";
import { deployments, organizations } from "../src/db/schema";
import { ACTIVE_STATUSES, runDeployment, cleanupExpiredEnvironments } from "../src/lib/deployments";
let stopping = false;
process.on("SIGTERM", () => { stopping = true; });
process.on("SIGINT", () => { stopping = true; });
async function main() {
  console.log("DeployFlow sandbox worker started. No customer code is executed.");
  while (!stopping) {
    const jobs = await db.select({ id: deployments.id }).from(deployments).where(and(inArray(deployments.status, ACTIVE_STATUSES), or(isNull(deployments.leaseUntil), lt(deployments.leaseUntil, new Date())))).limit(5);
    await Promise.all(jobs.map(job => runDeployment(job.id)));
    const orgs = await db.select({ id: organizations.id }).from(organizations).where(eq(organizations.mode, "sandbox"));
    for (const org of orgs) await cleanupExpiredEnvironments(org.id);
    await new Promise(resolve => setTimeout(resolve, 2000));
  }
  await pool.end();
}
main().catch(async error => { console.error("Worker stopped:", error instanceof Error ? error.message : error); await pool.end(); process.exitCode = 1; });
