import { spawn } from "node:child_process";
import { mkdir } from "node:fs/promises";
import net from "node:net";
import path from "node:path";

const host = "127.0.0.1";
const port = 27017;
const dbPath = path.join(process.cwd(), ".mongodb-data");
const logPath = path.join(dbPath, "mongod.log");

function isPortOpen() {
  return new Promise<boolean>((resolve) => {
    const socket = net.createConnection({ host, port });

    socket.on("connect", () => {
      socket.destroy();
      resolve(true);
    });

    socket.on("error", () => {
      resolve(false);
    });
  });
}

async function main() {
  if (await isPortOpen()) {
    console.log(`[mongo] using existing MongoDB on ${host}:${port}`);
    setInterval(() => undefined, 60_000);
    return;
  }

  await mkdir(dbPath, {
    recursive: true,
  });

  const child = spawn(
    "mongod",
    [
      "--dbpath",
      dbPath,
      "--logpath",
      logPath,
      "--bind_ip",
      host,
      "--port",
      String(port),
      "--quiet",
    ],
    {
      stdio: "inherit",
    },
  );

  console.log(`[mongo] started local MongoDB on ${host}:${port}`);

  const shutdown = () => {
    if (!child.killed) {
      child.kill("SIGTERM");
    }
  };

  process.on("SIGINT", () => {
    shutdown();
    process.exit(0);
  });

  process.on("SIGTERM", () => {
    shutdown();
    process.exit(0);
  });

  child.on("exit", (code) => {
    if (code && code !== 0) {
      console.error(`[mongo] mongod exited with code ${code}`);
      process.exit(code);
      return;
    }

    process.exit(0);
  });
}

void main();
