import pc from "picocolors"
import { getDisplayConfig, clearApiKey, resetConfig, getConfig, saveApiKey, saveConfig } from "../config.js";
import { note, outro, confirm, select, password, text, cancel, spinner } from "@clack/prompts";
import { handleSignal, printHeader, exitWithCancel } from "../utils/index.js";
import { checkGitStatus, getCurrentBranch, getStagedDiff, getStagedSummary } from "../git.js";
import { resolveApiKey, doCommit } from "../lib/index.js";
import { generateCommitMessage, validateCommitMessage } from "../ai.js";

export async function runConfigCommand(subcommand?: string): Promise<void> {
  printHeader();

  if (subcommand === "show") {
    const display = getDisplayConfig();
    const lines = Object.entries(display)
      .map(([k, v]) => `  ${pc.dim(k.padEnd(14))} ${pc.cyan(v)}`)
      .join("\n");
    note(lines, "Current Configuration");
    outro(pc.green("Done"));
    return;
  }

  if (subcommand === "reset") {
    const confirmed = await confirm({
      message: "Reset all settings to defaults? (API key will be preserved)",
    });
    handleSignal(confirmed);
    if (confirmed) {
      resetConfig(false);
      outro(pc.green("Configuration reset to defaults."));
    } else {
      outro(pc.dim("No changes made."));
    }
    return;
  }

  if (subcommand === "clear-key") {
    const confirmed = await confirm({
      message: "Remove the stored Groq API key?",
    });
    handleSignal(confirmed);
    if (confirmed) {
      clearApiKey();
      outro(pc.green("API key removed."));
    } else {
      outro(pc.dim("No changes made."));
    }
    return;
  }

  const action = await select({
    message: "What would you like to configure?",
    options: [
      { value: "apikey", label: "Set Groq API key" },
      { value: "model", label: "Change AI model" },
      { value: "temperature", label: "Adjust creativity (temperature)" },
      { value: "show", label: "Show current configuration" },
      { value: "reset", label: "Reset to defaults" },
    ],
  });
  handleSignal(action);

  const config = getConfig();

  switch (action) {
    case "apikey": {
      const key = await password({
        message: "Enter your Groq API key (get one at console.groq.com):",
        validate: (v: any) => {
          if (!v || v.trim().length < 10) return "Please enter a valid API key";
          return;
        },
      });
      handleSignal(key);
      saveApiKey(String(key));
      outro(pc.green("API key saved securely."));
      break;
    }

    case "model": {
      const model = await select({
        message: "Select the Groq model to use:",
        options: [
          {
            value: "llama-3.3-70b-versatile",
            label: "llama-3.3-70b-versatile",
            hint: "recommended — fast + high quality",
          },
          {
            value: "llama-3.1-8b-instant",
            label: "llama-3.1-8b-instant",
            hint: "ultra-fast, lighter reasoning",
          },
        ],
      });
      handleSignal(model);
      saveConfig({ model: String(model) });
      outro(pc.green(`Model set to ${pc.cyan(String(model))}`));
      break;
    }

    case "temperature": {
      const tempStr = await text({
        message: `Set temperature (0.0–1.0). Current: ${config.temperature}`,
        placeholder: "0.4",
        validate: (v) => {
          const n = parseFloat(v as string);
          if (isNaN(n) || n < 0 || n > 1)
            return "Enter a number between 0.0 and 1.0";
          return;
        },
      });
      handleSignal(tempStr);
      saveConfig({ temperature: parseFloat(String(tempStr)) });
      outro(pc.green(`Temperature set to ${pc.cyan(String(tempStr))}`));
      break;
    }

    case "show": {
      const display = getDisplayConfig();
      const lines = Object.entries(display)
        .map(([k, v]) => `  ${pc.dim(k.padEnd(14))} ${pc.cyan(v)}`)
        .join("\n");
      note(lines, "Current Configuration");
      outro(pc.green("Done"));
      break;
    }

    case "reset": {
      const confirmed = await confirm({
        message: "Reset all settings to defaults? (API key will be preserved)",
      });
      handleSignal(confirmed);
      if (confirmed) {
        resetConfig(false);
        outro(pc.green("Configuration reset."));
      } else {
        outro(pc.dim("No changes made."));
      }
      break;
    }
  }
}

export async function runCommitFlow(): Promise<void> {
  printHeader();

  const status = checkGitStatus();

  if (!status.isRepo) {
    cancel(
      "Not a Git repository. Run `git init` or navigate to a Git project."
    );
    process.exit(1);
  }

  if (!status.hasStagedFiles) {
    note(
      [
        "No files are currently staged.",
        "",
        pc.dim("Stage files with:  ") + pc.cyan("git add <file>"),
        pc.dim("Stage all with:    ") + pc.cyan("git add ."),
      ].join("\n"),
      "Nothing to commit"
    );
    outro(pc.yellow("Tip: Stage your changes and run comit.ai again."));
    process.exit(0);
  }

  const branch = getCurrentBranch();
  const summary = getStagedSummary();

  note(
    [
      `${pc.dim("Branch:")}  ${pc.cyan(branch)}`,
      "",
      pc.dim("Staged changes:"),
      summary
        .split("\n")
        .map((l) => `  ${l}`)
        .join("\n"),
    ].join("\n"),
    "Ready to commit"
  );

  const s1 = spinner();
  s1.start("Analyzing staged changes…");

  let diffData: Awaited<ReturnType<typeof getStagedDiff>>;
  try {
    diffData = await getStagedDiff();
  } catch (err) {
    s1.stop(pc.red("Failed to read git diff."));
    cancel(err instanceof Error ? err.message : "Unknown git error.");
    process.exit(1);
  }

  s1.stop(
    pc.green("✓") +
      ` Diff collected (${diffData.originalLength.toLocaleString()} chars${diffData.truncated ? ", truncated" : ""})`
  );

  if (diffData.excludedFiles.length > 0) {
    console.log(
      pc.dim(
        `  Skipped ${diffData.excludedFiles.length} non-semantic file(s): ${diffData.excludedFiles.slice(0, 3).join(", ")}${diffData.excludedFiles.length > 3 ? "…" : ""}`
      )
    );
  }

  const apiKey = await resolveApiKey();
  const config = getConfig();

  let currentMessage: string | null = null;

  while (true) {
    const genSpinner = spinner();
    genSpinner.start(
      currentMessage
        ? "Generating alternative message…"
        : "Generating commit message…"
    );

    let result: Awaited<ReturnType<typeof generateCommitMessage>>;

    try {
      result = await generateCommitMessage({
        apiKey,
        diff: diffData.diff,
        model: config.model,
        maxTokens: config.maxTokens,
        temperature: config.temperature,
        branch,
        excludedFiles: diffData.excludedFiles,
        truncated: diffData.truncated,
      });
    } catch (err) {
      genSpinner.stop(pc.red("✗ Generation failed."));
      cancel(err instanceof Error ? err.message : "Unknown AI error.");
      process.exit(1);
    }

    currentMessage = result.message;

    genSpinner.stop(
      pc.green("✓") +
        ` Generated via ${pc.dim(result.model)} (${result.usage.totalTokens} tokens)`
    );

    const validation = validateCommitMessage(currentMessage);
    if (!validation.valid) {
      console.log(pc.yellow(`  ⚠ Warning: ${validation.reason}`));
    }

    console.log(
      pc.bgGreen(pc.black(" Proposed commit message ")) 
    );
    console.log();
    console.log(
      currentMessage
        .split("\n")
        .map((line, i) =>
          i === 0
            ? `  ${pc.bold(pc.white(line))}`
            : `  ${pc.dim(line)}`
        )
        .join("\n")
    );
    console.log();

    const action = await select({
      message: "What would you like to do?",
      options: [
        {
          value: "commit",
          label: `${pc.green("✅")} Commit`,
          hint: "Accept and run git commit",
        },
        {
          value: "regenerate",
          label: `${pc.blue("🔄")} Regenerate`,
          hint: "Ask for an alternative message",
        },
        {
          value: "edit",
          label: `${pc.yellow("✍️ ")} Edit manually`,
          hint: "Tweak the message before committing",
        },
        {
          value: "cancel",
          label: `${pc.red("❌")} Cancel`,
          hint: "Abort without committing",
        },
      ],
    });

    handleSignal(action);

    switch (action) {
      case "commit": {
        await doCommit(currentMessage);
        return;
      }

      case "regenerate": {
        continue;
      }

      case "edit": {
        const edited = await text({
          message: "Edit the commit message:",
          initialValue: currentMessage,
          validate: (v) => {
            if (!v || v.trim().length === 0)
              return "Commit message cannot be empty";
            if (v.trim().length > 500)
              return "Message too long (max 500 chars)";
            return;
          },
        });

        handleSignal(edited);
        currentMessage = String(edited).trim();

        console.log();
        console.log(pc.bgYellow(pc.black(" Edited commit message ")));
        console.log();
        console.log(`  ${pc.bold(pc.white(currentMessage.split("\n")[0] ?? ""))}`);
        if (currentMessage.includes("\n")) {
          currentMessage
            .split("\n")
            .slice(1)
            .forEach((line) => console.log(`  ${pc.dim(line)}`));
        }
        console.log();

        const doIt = await confirm({ message: "Commit with this message?" });
        handleSignal(doIt);

        if (doIt) {
          await doCommit(currentMessage);
          return;
        }
        continue;
      }

      case "cancel": {
        exitWithCancel("Cancelled. No commit was made.");
      }
    }
  }
}