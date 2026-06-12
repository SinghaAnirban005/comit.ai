import { intro, cancel, isCancel } from "@clack/prompts";
import pc from "picocolors";

export function printHeader(): void {
  console.log();
  intro(
    pc.bgCyan(pc.black(" comit.ai ")) +
      pc.dim(" AI-powered conventional commits")
  );
}

export function exitWithCancel(message = "Operation cancelled."): never {
  cancel(pc.yellow(message));
  process.exit(0);
}

export function handleSignal(value: unknown): void {
  if (isCancel(value)) {
    exitWithCancel("Aborted. No commit was made.");
  }
}