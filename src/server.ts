
import "dotenv/config";
import app from "./app";

const PORT = Number(process.env.PORT) || 3000;
const HOST = "0.0.0.0";

const server = app.listen(PORT, HOST, () => {
  console.log(`Lost & Found server listening on port ${PORT}`);
});

function shutdown() {
  console.log("Shutting down server...");
  server.close(() => {
    process.exit(0);
  });
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
