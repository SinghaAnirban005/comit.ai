import { note, password, confirm, spinner, outro, cancel } from "@clack/prompts";
import { getApiKey, saveApiKey } from "../config.js";
import { handleSignal } from "../utils/index.js";
import { executeGitCommit } from "../git.js";
import pc from "picocolors"

export async function resolveApiKey(): Promise<string> {
  const existing = getApiKey();
  if (existing) return existing;

  note(
    [
      "No Groq API key found in environment or config.",
      "",
      `Get a free API key at: ${pc.cyan("https://console.groq.com")}`,
    ].join("\n"),
    "API Key Required"
  );

  const key = await password({
    message: "Enter your Groq API key:",
    validate: (v: any) => {
      if (!v || v.trim().length < 10) return "Please enter a valid API key";
      return;
    },
  });

  handleSignal(key);

  const keyStr = String(key).trim();

  const shouldSave = await confirm({
    message: "Save this API key for future use?",
  });
  handleSignal(shouldSave);

  if (shouldSave) {
    saveApiKey(keyStr);
    note("API key saved to global config. You won't be asked again.", " Saved");
  }

  return keyStr;
}

export function printHelp(): void {
  console.log(`
${pc.bold(pc.cyan("comit.ai"))} — AI-powered conventional commit messages

${pc.bold("USAGE")}
  comit                    Generate a commit message for staged changes
  comit config             Interactive configuration setup
  comit config show        Show current configuration
  comit config reset       Reset settings to defaults
  comit config clear-key   Remove stored API key
  comit --help             Show this help

${pc.bold("EXAMPLES")}
  git add .
  comit

  ${pc.dim("# Set API key once, then use forever:")}
  comit config
  git add src/
  comit

${pc.bold("ENVIRONMENT")}
  GROQ_API_KEY   Groq API key (overrides stored config)

${pc.bold("MORE INFO")}
  Groq console:       ${pc.cyan("https://console.groq.com")}
  Conventional Commits: ${pc.cyan("https://www.conventionalcommits.org")}
`);
}

export async function doCommit(message: string): Promise<void> {
  const s = spinner();
  s.start("Committing…");

  try {
    const output = await executeGitCommit(message);
    s.stop(pc.green("Committed successfully!"));
    console.log();
    if (output) {
      output
        .split("\n")
        .filter((l) => l.trim())
        .forEach((line) => console.log(`  ${pc.dim(line)}`));
    }
    outro(pc.green("Done! Your changes have been committed."));
  } catch (err) {
    s.stop(pc.red("✗ Commit failed."));
    cancel(err instanceof Error ? err.message : "Unknown git error.");
    process.exit(1);
  }
}