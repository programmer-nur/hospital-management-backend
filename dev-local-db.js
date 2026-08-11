/**
 * Starts the API against an ephemeral in-process MongoDB.
 *
 * Development helper. The committed .env points at a MongoDB Atlas cluster
 * whose hostname no longer resolves, so this provides a working local database
 * for running and verifying the stack end to end.
 *
 *   node dev-local-db.js
 *
 * Data lives only for the lifetime of the process. On first boot the app's own
 * seeder creates admin@hospital.com / Abc1234#.
 */
const { MongoMemoryServer } = require("mongodb-memory-server");

(async () => {
  const mongod = await MongoMemoryServer.create({
    instance: { dbName: "hospital-management" },
  });

  // Set before requiring the app: dotenv does not override existing env vars,
  // so this takes precedence over DATABASE_URL in .env.
  process.env.DATABASE_URL = mongod.getUri("hospital-management");
  console.log("[dev-local-db] ephemeral mongodb at", process.env.DATABASE_URL);

  require("ts-node").register({ transpileOnly: true });
  require("./src/server.ts");

  const shutdown = async () => {
    await mongod.stop();
    process.exit(0);
  };
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
})();
