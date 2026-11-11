import "dotenv/config";
import test from "node:test";
import assert from "node:assert/strict";
import { branchSlug, encrypt, decrypt, hashPassword, verifyPassword, canAdmin, canDeploy, safeEqual } from "../src/lib/security";
import { eligibleBranch, isRunning } from "../src/lib/deployments";
test("branch names become safe, collision-resistant DNS labels", () => {
  assert.match(branchSlug("feature/login", "branch-a"), /^feature-login-[a-f0-9]{8}$/);
  assert.notEqual(branchSlug("feature/login", "a"), branchSlug("feature-login", "b"));
  assert.match(branchSlug("../../$unsafe", "a"), /^unsafe-[a-f0-9]{8}$/);
  assert.ok(branchSlug("a".repeat(100), "a").split(".")[0].length <= 63);
});
test("secrets round-trip with authenticated encryption", () => { const value = "secret://test-value"; assert.equal(decrypt(encrypt(value)), value); assert.notEqual(encrypt(value), encrypt(value)); assert.throws(() => decrypt(encrypt(value).replace(/^./, "f"))); });
test("passwords are salted and verified without plaintext", async () => { const hash = await hashPassword("correct-horse-123"); assert.ok(!hash.includes("correct-horse")); assert.ok(await verifyPassword("correct-horse-123", hash)); assert.equal(await verifyPassword("wrong-password", hash), false); });
test("roles enforce administrative and deployment permissions", () => { assert.ok(canAdmin("Owner")); assert.equal(canAdmin("Developer"), false); assert.ok(canDeploy("Developer")); assert.equal(canDeploy("Viewer"), false); assert.equal(canDeploy("QA Engineer"), false); });
test("branch policies support scoped wildcards", () => { assert.ok(eligibleBranch("feature/login", "main,feature/*")); assert.equal(eligibleBranch("unsafe", "main,feature/*"), false); assert.ok(eligibleBranch("main", "*")); });
test("only valid queued states count as running", () => { assert.ok(isRunning("building")); assert.equal(isRunning("ready"), false); assert.equal(isRunning("build_failed"), false); });
test("signature comparisons are exact", () => { assert.ok(safeEqual("sha256=abc", "sha256=abc")); assert.equal(safeEqual("abc", "abcd"), false); });
