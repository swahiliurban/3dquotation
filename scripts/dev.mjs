import { spawn } from "node:child_process";

const hostClient = process.argv.includes("--host");
const clientArgs = process.platform === "win32"
  ? ["/c", "npm.cmd", "run", "dev:client"]
  : ["run", "dev:client"];

if (hostClient) {
  clientArgs.push("--", "--host", "0.0.0.0");
}

const commands = [
  {
    label: "api",
    command: process.platform === "win32" ? "cmd.exe" : "npm",
    args: process.platform === "win32" ? ["/c", "npm.cmd", "run", "dev:server"] : ["run", "dev:server"],
  },
  {
    label: "client",
    command: process.platform === "win32" ? "cmd.exe" : "npm",
    args: clientArgs,
  },
];

const children = commands.map(({ label, command, args }) => {
  const child = spawn(command, args, {
    cwd: process.cwd(),
    stdio: "inherit",
    shell: false,
  });

  child.on("exit", (code) => {
    if (code && code !== 0) {
      console.error(`[${label}] exited with code ${code}`);
      shutdown(code);
    }
  });

  return child;
});

let shuttingDown = false;

function shutdown(code = 0) {
  if (shuttingDown) {
    return;
  }

  shuttingDown = true;
  for (const child of children) {
    if (!child.killed) {
      child.kill("SIGTERM");
    }
  }

  process.exit(code);
}

process.on("SIGINT", () => shutdown(0));
process.on("SIGTERM", () => shutdown(0));
