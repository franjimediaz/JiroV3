import { execSync } from "node:child_process";

const ports = [3000, 3001, 3002];

function getListeningPids(port) {
  const output = execSync(`netstat -ano -p tcp | findstr :${port}`, {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "ignore"],
  });

  return output
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .filter((line) => line.includes("LISTENING"))
    .map((line) => line.split(/\s+/).at(-1))
    .filter(Boolean)
    .filter((pid) => pid !== process.pid.toString());
}

for (const port of ports) {
  let pids = [];

  try {
    pids = [...new Set(getListeningPids(port))];
  } catch {
    pids = [];
  }

  for (const pid of pids) {
    try {
      execSync(`taskkill /PID ${pid} /F`, { stdio: "ignore" });
      console.log(`Freed port ${port} by stopping PID ${pid}`);
    } catch {
      console.warn(`Could not stop PID ${pid} on port ${port}`);
    }
  }
}
