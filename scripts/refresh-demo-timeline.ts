import "dotenv/config";
import { and, eq, like } from "drizzle-orm";
import { db, pool } from "../src/db";
import * as s from "../src/db/schema";
import { DEMO_ORG_ID } from "../src/lib/seed";
async function main() {
  const now = Date.now(); const rows = (await db.select().from(s.deployments).where(eq(s.deployments.organizationId, DEMO_ORG_ID))).filter(row => row.id.startsWith("10000000-0000-4000-0006-"));
  const counts = [12,18,24,21,27,16,19];
  for (const row of rows) {
    const i = Number(row.id.slice(-12)) - 1; let createdAt: Date;
    if (i < 5) createdAt = new Date(now - [2,5,12,18,24][i] * 60000);
    else { let cursor = i - 5; let day = 0; while (day < 6 && cursor >= counts[day]) { cursor -= counts[day]; day++; } const date = new Date(now); date.setHours(0,0,0,0); date.setDate(date.getDate() - (6-day)); const minutes = day === 6 ? (cursor*7)%Math.max(1,Math.floor((now-date.getTime())/60000)) : (cursor*73+45)%1440; createdAt = new Date(date.getTime()+minutes*60000); }
    const duration = i === 3 ? null : row.status === "build_failed" ? 47 : 60+(i*17)%49;
    await db.update(s.deployments).set({ createdAt, durationSeconds: duration, startedAt: i === 3 ? null : createdAt, finishedAt: duration ? new Date(createdAt.getTime()+duration*1000) : null, leaseUntil: null, ...(i === 3 ? { status: "building", attempts: 0, imageDigest: null, error: null } : {}) }).where(eq(s.deployments.id,row.id));
    const logs = await db.select().from(s.deploymentLogs).where(eq(s.deploymentLogs.deploymentId,row.id));
    for (const log of logs) { if (i === 3) await db.delete(s.deploymentLogs).where(eq(s.deploymentLogs.id,log.id)); else await db.update(s.deploymentLogs).set({ createdAt: new Date(log.createdAt.getTime()+createdAt.getTime()-row.createdAt.getTime()) }).where(eq(s.deploymentLogs.id,log.id)); }
    if (i === 3) await db.insert(s.deploymentLogs).values({ organizationId: DEMO_ORG_ID, deploymentId: row.id, stage: "queued", message: "Deployment queued. Waiting for an available sandbox worker.", createdAt });
  }
  console.log(`Refreshed ${rows.length} sample deployment timelines; personal projects were not modified.`);
}
main().catch(error=>{console.error(error);process.exitCode=1;}).finally(()=>pool.end());
