import { execSync, exec } from "node:child_process";
import { promisify } from "node:util";

const execAsync = promisify(exec);

const EXCLUDED_FILE_PATTERNS: RegExp[] = [
  /package-lock\.json$/,
  /pnpm-lock\.yaml$/,
  /yarn\.lock$/,
  /bun\.lockb$/,
  /composer\.lock$/,
  /Gemfile\.lock$/,
  /poetry\.lock$/,
  /\.min\.(js|css)$/,
  /\.map$/,
  /dist\//,
  /build\//,
  /\.cache\//,
  /node_modules\//,
  /\.(png|jpg|jpeg|gif|ico|svg|woff|woff2|ttf|eot|mp4|mp3|pdf|zip|tar|gz)$/i,
];

const MAX_DIFF_CHARS = 8000;

export interface GitStatus {
  isRepo: boolean;
  hasStagedFiles: boolean;
  stagedFiles: string[];
}

export function isGitRepository(): boolean {
  try {
    execSync("git rev-parse --is-inside-work-tree", {
      stdio: "pipe",
      cwd: process.cwd(),
    });
    return true;
  } catch {
    return false;
  }
}

export function getStagedFiles(): string[] {
  try {
    const output = execSync("git diff --cached --name-only", {
      encoding: "utf-8",
      stdio: "pipe",
      cwd: process.cwd(),
    });
    return output
      .trim()
      .split("\n")
      .filter((f) => f.length > 0);
  } catch {
    return [];
  }
}

function shouldExcludeFile(filePath: string): boolean {
  return EXCLUDED_FILE_PATTERNS.some((pattern) => pattern.test(filePath));
}

export async function getStagedDiff(): Promise<{
  diff: string;
  truncated: boolean;
  excludedFiles: string[];
  originalLength: number;
}> {
  const stagedFiles = getStagedFiles();
  const includedFiles: string[] = [];
  const excludedFiles: string[] = [];

  for (const file of stagedFiles) {
    if (shouldExcludeFile(file)) {
      excludedFiles.push(file);
    } else {
      includedFiles.push(file);
    }
  }

  if (includedFiles.length === 0) {
    return {
      diff: `[Only non-semantic files changed: ${excludedFiles.join(", ")}]`,
      truncated: false,
      excludedFiles,
      originalLength: 0,
    };
  }

  const fileArgs = includedFiles.map((f) => `"${f}"`).join(" ");
  let rawDiff: string;

  try {
    const { stdout } = await execAsync(
      `git diff --cached --unified=3 -- ${fileArgs}`,
      {
        cwd: process.cwd(),
        maxBuffer: 1024 * 1024 * 10,
      }
    );
    rawDiff = stdout;
  } catch (err) {
    // Fallback: full diff without file filtering
    try {
      const { stdout } = await execAsync("git diff --cached --unified=3", {
        cwd: process.cwd(),
        maxBuffer: 1024 * 1024 * 10,
      });
      rawDiff = stdout;
    } catch {
      return {
        diff: "",
        truncated: false,
        excludedFiles,
        originalLength: 0,
      };
    }
  }

  const originalLength = rawDiff.length;
  let diff = rawDiff;
  let truncated = false;

  if (diff.length > MAX_DIFF_CHARS) {
    truncated = true;
    diff =
      diff.slice(0, MAX_DIFF_CHARS) +
      "\n\n[... diff truncated for token efficiency. Remaining changes follow the same patterns shown above ...]";
  }

  return { diff, truncated, excludedFiles, originalLength };
}

export async function executeGitCommit(message: string): Promise<string> {
  const safeMessage = message.replace(/"/g, '\\"');
  const { stdout, stderr } = await execAsync(
    `git commit -m "${safeMessage}"`,
    {
      cwd: process.cwd(),
    }
  );

  if (stderr && !stdout) {
    throw new Error(stderr.trim());
  }

  return stdout.trim();
}

export function getCurrentBranch(): string {
  try {
    return execSync("git branch --show-current", {
      encoding: "utf-8",
      stdio: "pipe",
      cwd: process.cwd(),
    }).trim();
  } catch {
    return "unknown";
  }
}

export function getStagedSummary(): string {
  try {
    return execSync("git diff --cached --stat", {
      encoding: "utf-8",
      stdio: "pipe",
      cwd: process.cwd(),
    }).trim();
  } catch {
    return "";
  }
}

export function checkGitStatus(): GitStatus {
  const isRepo = isGitRepository();
  if (!isRepo) {
    return { isRepo: false, hasStagedFiles: false, stagedFiles: [] };
  }
  const stagedFiles = getStagedFiles();
  return {
    isRepo: true,
    hasStagedFiles: stagedFiles.length > 0,
    stagedFiles,
  };
}
