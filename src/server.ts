
import "dotenv/config";
import app from "./app";

const PORT = Number(process.env.PORT) || 3000;

const server = app.listen(PORT, () => {
  console.log(`Lost & Found API running at http://localhost:${PORT}`);
});

function shutdown() {
  console.log("Shutting down server...");
  server.close(() => {
    process.exit(0);
  });
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
