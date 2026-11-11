import "dotenv/config";
import { ensureDemo } from "../src/lib/seed";
import { pool } from "../src/db";
ensureDemo().then(() => console.log("DeployFlow demo data is ready.")).catch(error => { console.error(error); process.exitCode = 1; }).finally(() => pool.end());
