import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import net from "node:net";

const repositoryRoot = fileURLToPath(new URL("..", import.meta.url));
const localDatabaseUrl = "postgresql://postgres:postgres@localhost:5432/main";
const maximumAttempts = 30;
const retryDelayMilliseconds = 2_000;
let dependenciesStarted = false;

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: repositoryRoot,
    stdio: "inherit",
    ...options,
  });

  if (result.error) {
    throw new Error(`Unable to run ${command}: ${result.error.message}`, {
      cause: result.error,
    });
  }

  if (result.status !== 0) {
    throw new Error(`${command} exited with status ${result.status}.`);
  }
}

function succeeds(command, args) {
  const result = spawnSync(command, args, {
    cwd: repositoryRoot,
    stdio: "ignore",
  });

  return !result.error && result.status === 0;
}

function wait(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

function canConnect(host, port) {
  return new Promise((resolve) => {
    const socket = net.createConnection({ host, port });

    const finish = (connected) => {
      socket.destroy();
      resolve(connected);
    };

    socket.setTimeout(1_000);
    socket.once("connect", () => finish(true));
    socket.once("error", () => finish(false));
    socket.once("timeout", () => finish(false));
  });
}

async function waitFor({ description, isReady }) {
  console.log(`Waiting for ${description}...`);

  for (let attempt = 1; attempt <= maximumAttempts; attempt += 1) {
    if (await isReady()) {
      return;
    }

    if (attempt < maximumAttempts) {
      await wait(retryDelayMilliseconds);
    }
  }

  throw new Error(`${description} failed to become ready.`);
}

function runNpmScript(script) {
  if (process.env.npm_execpath) {
    run(process.execPath, [process.env.npm_execpath, "run", script], {
      env: { ...process.env, DATABASE_URL: localDatabaseUrl },
    });
    return;
  }

  const npmCommand = process.platform === "win32" ? "npm.cmd" : "npm";
  run(npmCommand, ["run", script], {
    env: { ...process.env, DATABASE_URL: localDatabaseUrl },
    shell: process.platform === "win32",
  });
}

async function main() {
  run("docker", ["compose", "up", "-d"]);
  dependenciesStarted = true;

  await waitFor({
    description: "Postgres",
    isReady: () =>
      succeeds("docker", [
        "compose",
        "exec",
        "-T",
        "postgres",
        "pg_isready",
        "-U",
        "postgres",
        "-d",
        "main",
      ]),
  });
  console.log("Postgres is ready.");

  console.log("Running database migrations...");
  runNpmScript("db:migrate");

  await waitFor({
    description: "the local Neon proxy",
    isReady: () => canConnect("127.0.0.1", 4444),
  });
  console.log("Local dependencies are ready.");
}

main().catch((error) => {
  console.error(error.message);

  if (dependenciesStarted) {
    try {
      run("docker", ["compose", "ps"]);
    } catch {
      // Keep the primary error if Docker becomes unavailable after startup.
    }
  }

  process.exitCode = 1;
});
