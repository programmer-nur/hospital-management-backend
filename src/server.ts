import mongoose from "mongoose";
import app from "./app";
import config from "./app/config";
import { seedDataBaseIfRequired } from "./seeder";

// Connect to MongoDB
mongoose
  .connect(config.database_url)
  .then(() => {
    console.log("Connected to MongoDB");
    seedDataBaseIfRequired();
    (async () => {})();
  })
  .catch((err) => {
    console.log("Error connecting to MongoDB", err);
  });

// Start server
const port: number = config.port ? parseInt(config.port) : 5000;

app.listen(port, "0.0.0.0", () => {
  console.log(`Server is running on port ${port} at http://localhost:${port}`);
});
