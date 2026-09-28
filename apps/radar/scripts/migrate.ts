// Applies SQL migrations in ./drizzle to DATABASE_URL (Neon), or to the local PGlite
// database when DATABASE_URL is unset. Runs before `next build` on Vercel.
import path from "node:path";

async function main() {
  const migrationsFolder = path.join(process.cwd(), "drizzle");
  const url = process.env.DATABASE_URL || process.env.POSTGRES_URL;

  if (!url) {
    if (process.env.VERCEL) {
      console.log("DATABASE_URL is not set; skipping migrations. Add a Neon database in Vercel.");
      return;
    }
    const { getDb } = await import("../src/db/index");
    await getDb(); // PGlite migrates itself on connect
    console.log("Local PGlite database is up to date.");
    return;
  }

  const { neon } = await import("@neondatabase/serverless");
  const { drizzle } = await import("drizzle-orm/neon-http");
  const { migrate } = await import("drizzle-orm/neon-http/migrator");
  await migrate(drizzle({ client: neon(url) }), { migrationsFolder });
  console.log("Neon database is up to date.");
}

// Exit explicitly: the embedded PGlite database keeps Node's event loop alive.
main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
