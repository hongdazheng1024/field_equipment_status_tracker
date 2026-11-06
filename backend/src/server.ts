import { createApp } from "./app.js";
import { config } from "./config.js";
import { pool } from "./db/pool.js";

const server = createApp().listen(config.PORT, () => {
  console.log(`API listening on http://localhost:${config.PORT}`);
});

// Close the HTTP server and DB pool cleanly on Ctrl+C / container stop.
for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.on(signal, () => {
    server.close(() => void pool.end());
  });
}
1;
