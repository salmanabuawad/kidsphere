// Local development PostgreSQL without Docker.
//
// Runs a real PostgreSQL server (binaries shipped via the `embedded-postgres`
// npm package) with its data stored in ./.data/pg. Keep this process running
// in its own terminal while developing:
//
//   npm run db:start
//
// Production uses a regular PostgreSQL installation (see deploy/install.sh).
import EmbeddedPostgres from "embedded-postgres";
import { existsSync } from "node:fs";
import path from "node:path";

const port = Number(process.env.DEV_PG_PORT ?? 5433);
const databaseDir = path.resolve(".data/pg");
// UTF-8 is required (Arabic/Hebrew). Created from template0 so the OS locale never leaks in.
const databases = ["ks_app", "ks_test", "ks_e2e"];

const pg = new EmbeddedPostgres({
  databaseDir,
  user: "kidsphere",
  password: "kidsphere",
  port,
  persistent: true,
  initdbFlags: ["--encoding=UTF8", "--locale=C"],
  onLog: () => {},
});

const fresh = !existsSync(path.join(databaseDir, "PG_VERSION"));
if (fresh) {
  console.log("Initialising new PostgreSQL cluster in .data/pg ...");
  await pg.initialise();
}
await pg.start();

const client = pg.getPgClient("postgres");
await client.connect();
for (const name of databases) {
  const { rowCount } = await client.query("SELECT 1 FROM pg_database WHERE datname = $1", [name]);
  if (!rowCount) {
    await client.query(`CREATE DATABASE "${name}" ENCODING 'UTF8' LC_COLLATE 'C' LC_CTYPE 'C' TEMPLATE template0`);
    console.log(`Created database ${name}`);
  }
}
await client.end();

console.log(`PostgreSQL ready on postgresql://kidsphere:kidsphere@localhost:${port} (Ctrl+C to stop)`);

const shutdown = async () => {
  await pg.stop();
  process.exit(0);
};
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
setInterval(() => {}, 1 << 30);
