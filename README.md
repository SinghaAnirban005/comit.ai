# comit.ai

> AI powered conventional commit messages generated from your staged diff using Groq LLM.


## Features

- **Conventional Commits** — strict `type(scope): subject` format, always
- **Smart diff filtering** — skips lockfiles, minified files, and binaries
- **Token-efficient** — truncates large diffs gracefully with context preserved
- **Interactive loop** — commit, regenerate, edit inline, or cancel
- **Secure key storage** — API key stored via `conf`, never in your repo
- **Env override** — set `GROQ_API_KEY` to skip stored config entirely

## Installation

```bash
npm install -g @singha-labs/comit.ai
```

## Setup

Get a free Groq API key at **[console.groq.com](https://console.groq.com)**, then:

```bash
comit config
```

Follow the interactive prompts to save your key. That's it — gitwise remembers it globally.

Alternatively, set the environment variable:

```bash
export GROQ_API_KEY=gsk_your_key_here
```

## Usage

```bash
# Stage some files
git add src/feature.ts tests/feature.test.ts

# Run comit —> it reads the diff and generates a message
comit

# Configuration management
gitwise config           # Interactive setup
gitwise config show      # Display current settings
gitwise config reset     # Reset to defaults
gitwise config clear-key # Remove stored API key
```


## Configuration Options

| Setting     | Default                    | Description                  |
|-------------|----------------------------|------------------------------|
| model       | `llama-3.3-70b-versatile`  | Groq model to use            |
| temperature | `0.4`                      | Creativity (0 = precise)     |
| maxTokens   | `256`                      | Max tokens in response       |

## Building from Source

```bash
git clone https://github.com/yourname/comit.ai
cd comit.ai
npm install
npm run build
npm link          # Makes `gitwise` available globally
```

## License

MIT
