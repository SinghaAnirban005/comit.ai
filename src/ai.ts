import Groq from "groq-sdk";

export interface GenerateCommitOptions {
  apiKey: string;
  diff: string;
  model?: string;
  maxTokens?: number;
  temperature?: number;
  branch?: string;
  excludedFiles?: string[];
  truncated?: boolean;
}

export interface GenerateCommitResult {
  message: string;
  model: string;
  usage: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
}

const SYSTEM_PROMPT = `You are an expert software engineer writing Git commit messages that strictly follow the Conventional Commits specification (https://www.conventionalcommits.org).

RULES (non-negotiable):
1. Output ONLY the commit message — no explanations, no markdown, no code blocks, no backticks, no preamble, no postamble.
2. Use this exact format:  <type>(<scope>): <subject>
   - Optionally add a blank line and a body for context if truly needed (multi-line commits).
3. Types allowed: feat, fix, docs, style, refactor, perf, test, build, ci, chore, revert
4. Scope is optional but highly recommended — use the affected module, directory, or feature name (e.g., auth, api, button, config).
5. Subject must: start with a lowercase verb (add, fix, update, remove, refactor...), be ≤72 chars, have NO period at the end.
6. Infer intent from the diff — don't just describe file names. Explain WHY or WHAT changed.
7. If multiple concerns are changed, pick the most significant one. Do NOT use "and" to join two types.
8. Breaking changes must append a "!" after the scope: feat(api)!: change response format

EXAMPLES of perfect output:
feat(auth): add JWT token refresh with sliding expiration
fix(button): resolve focus ring disappearing on Safari
refactor(api): extract pagination logic into reusable hook
chore(deps): upgrade typescript to 5.7 and fix type errors
docs(readme): add installation and configuration sections
perf(images): lazy-load thumbnails to improve initial render
test(cart): add unit tests for discount calculation edge cases`;

function buildUserPrompt(options: GenerateCommitOptions): string {
  const parts: string[] = [];

  if (options.branch && options.branch !== "unknown") {
    parts.push(`Current branch: ${options.branch}`);
  }

  if (options.excludedFiles && options.excludedFiles.length > 0) {
    parts.push(
      `Note: The following files were excluded (lockfiles/binaries): ${options.excludedFiles.join(", ")}`
    );
  }

  if (options.truncated) {
    parts.push(
      "Note: The diff was truncated due to size. Focus on the visible changes."
    );
  }

  parts.push("Git diff of staged changes:");
  parts.push("---");
  parts.push(options.diff);
  parts.push("---");
  parts.push(
    "Generate a single Conventional Commit message for these changes. Output only the commit message, nothing else."
  );

  return parts.join("\n");
}

function sanitizeCommitMessage(raw: string): string {
  return (
    raw
      // Remove markdown code fences
      .replace(/```[a-z]*\n?/gi, "")
      // Remove inline backticks
      .replace(/`/g, "")
      // Remove leading "Commit message:" or similar prefixes
      .replace(/^(commit message:|message:|here('s| is) (the|your) commit( message)?:?)\s*/i, "")
      // Normalize line endings
      .replace(/\r\n/g, "\n")
      // Remove trailing whitespace on each line
      .split("\n")
      .map((l) => l.trimEnd())
      .join("\n")
      // Remove leading/trailing blank lines
      .trim()
  );
}

export function validateCommitMessage(message: string): {
  valid: boolean;
  reason?: string;
} {
  const firstLine = message.split("\n")[0] ?? "";
  const conventionalPattern =
    /^(feat|fix|docs|style|refactor|perf|test|build|ci|chore|revert)(\([^)]+\))?!?: .+/;

  if (!conventionalPattern.test(firstLine)) {
    return {
      valid: false,
      reason: `First line "${firstLine}" doesn't match Conventional Commits format.`,
    };
  }

  if (firstLine.length > 100) {
    return {
      valid: false,
      reason: `First line is too long (${firstLine.length} chars). Keep it under 100.`,
    };
  }

  return { valid: true };
}

export async function generateCommitMessage(
  options: GenerateCommitOptions
): Promise<GenerateCommitResult> {
  const {
    apiKey,
    model = "llama-3.3-70b-versatile",
    maxTokens = 256,
    temperature = 0.4,
  } = options;

  if (!apiKey) {
    throw new Error("Groq API key is required but was not provided.");
  }

  if (!options.diff || options.diff.trim().length === 0) {
    throw new Error("No diff content to analyze.");
  }

  const client = new Groq({ apiKey });

  const userPrompt = buildUserPrompt(options);

  let response: Groq.Chat.ChatCompletion;

  try {
    response = await client.chat.completions.create({
      model,
      max_tokens: maxTokens,
      temperature,
      messages: [
        {
          role: "system",
          content: SYSTEM_PROMPT,
        },
        {
          role: "user",
          content: userPrompt,
        },
      ],
    });
  } catch (err) {
    if (err instanceof Error) {
      const msg = err.message.toLowerCase();

      if (msg.includes("401") || msg.includes("invalid_api_key") || msg.includes("authentication")) {
        throw new Error(
          "Invalid Groq API key. Run `comit config` to update it."
        );
      }

      if (msg.includes("429") || msg.includes("rate_limit")) {
        throw new Error(
          "Groq API rate limit exceeded. Please wait a moment and try again."
        );
      }

      if (msg.includes("503") || msg.includes("overloaded")) {
        throw new Error(
          "Groq API is temporarily overloaded. Please try again in a few seconds."
        );
      }

      if (msg.includes("enotfound") || msg.includes("network")) {
        throw new Error(
          "Network error: Could not reach Groq API. Check your internet connection."
        );
      }

      throw new Error(`Groq API error: ${err.message}`);
    }
    throw new Error("Unknown error communicating with Groq API.");
  }

  const rawContent = response.choices[0]?.message?.content;

  if (!rawContent) {
    throw new Error("Groq API returned an empty response. Please try again.");
  }

  const message = sanitizeCommitMessage(rawContent);

  if (!message) {
    throw new Error(
      "Could not extract a valid commit message from the API response."
    );
  }

  return {
    message,
    model: response.model,
    usage: {
      promptTokens: response.usage?.prompt_tokens ?? 0,
      completionTokens: response.usage?.completion_tokens ?? 0,
      totalTokens: response.usage?.total_tokens ?? 0,
    },
  };
}
