import dotenv from "dotenv";
import session from "express-session";
import pg from "pg";
import connectPgSimple from "connect-pg-simple";
import { createApp } from "./app";
import { startAuditRetentionScheduler } from "./auditRetention";

dotenv.config();

const port = Number(process.env.PORT || 4000);
const PgSession = connectPgSimple(session);
const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL
});
const store = new PgSession({ pool, createTableIfMissing: true });

const app = createApp(store);

app.listen(port, () => {
  console.log(`api listening on :${port}`);
});

startAuditRetentionScheduler();
