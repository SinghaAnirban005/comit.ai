#!/usr/bin/env node

import pc from "picocolors";
import { printHelp } from "./lib/index.js";

import { runConfigCommand, runCommitFlow } from "./workflows/index.js";

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const cmd = args[0];
  const subCmd = args[1];

  // Handle --help / -h
  if (cmd === "--help" || cmd === "-h") {
    printHelp();
    process.exit(0);
  }

  // Handle --version / -v
  if (cmd === "--version" || cmd === "-v") {
    console.log("comit.ai v1.0.0");
    process.exit(0);
  }

  // Handle config subcommand
  if (cmd === "config") {
    try {
      await runConfigCommand(subCmd);
    } catch (err) {
      console.error(pc.red("Error:"), err instanceof Error ? err.message : err);
      process.exit(1);
    }
    return;
  }

  // Unknown subcommand
  if (cmd && !cmd.startsWith("-")) {
    console.error(pc.red(`Unknown command: ${cmd}`));
    console.error(`Run ${pc.cyan("comit --help")} for usage.`);
    process.exit(1);
  }

  // Default: run the commit flow
  try {
    await runCommitFlow();
  } catch (err) {
    console.error();
    console.error(pc.red("Unexpected error:"), err instanceof Error ? err.message : err);
    if (process.env["DEBUG"]) {
      console.error(err);
    }
    process.exit(1);
  }
}

process.on("unhandledRejection", (reason) => {
  console.error(pc.red("\nUnhandled error:"), reason);
  process.exit(1);
});

main().catch((err) => {
  console.error(pc.red("Fatal:"), err instanceof Error ? err.message : err);
  process.exit(1);
});
