import { spawn } from "node:child_process";

const commands = [
  {
    label: "api",
    command: "node",
    args: ["server/api-server.mjs"],
  },
  {
    label: "preview",
    command: "node",
    args: ["scripts/static-preview.mjs"],
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
