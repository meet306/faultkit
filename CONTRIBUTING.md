# Contributing to FaultKit

Thank you for your interest in contributing to FaultKit! We welcome bug reports, documentation improvements, and pull requests.

---

## 1. Development Principles

1. **Plain JavaScript Runtime:** All runtime code in `src/` must be written in plain modern JavaScript (ES Modules). No runtime TypeScript or compilation step is permitted.
2. **Zero Runtime Dependencies:** FaultKit relies strictly on Node.js 20+ built-ins (`fetch`, `AsyncLocalStorage`, etc.). Do not introduce runtime dependencies without prior discussion and strong justification.
3. **Deterministic & Isolated:** All fault simulations must be deterministic, isolated via `AsyncLocalStorage`, and safe for concurrent test execution.
4. **Strong Typing via JSDoc & `.d.ts`:** All public APIs must have thorough JSDoc comments, and changes must be reflected in `types/index.d.ts`.
5. **Security & Privacy by Default:** Ensure sensitive headers (`authorization`, `cookie`, `x-api-key`) remain redacted in diagnostics.

---

## 2. Local Setup

### Prerequisites

- Node.js 20.0.0 or higher.
- npm 10 or higher.

### Installation

```bash
git clone https://github.com/faultkit/faultkit.git
cd faultkit
npm install
```

---

## 3. Development Commands

| Command                 | Purpose                                                     |
| :---------------------- | :---------------------------------------------------------- |
| `npm test`              | Runs the test suite via Vitest                              |
| `npm run test:coverage` | Runs tests and verifies >=85% code coverage                 |
| `npm run lint`          | Runs ESLint                                                 |
| `npm run format`        | Checks formatting with Prettier                             |
| `npm run format:fix`    | Fixes formatting with Prettier                              |
| `npm run typecheck`     | Validates JSDoc and `types/index.d.ts` using `tsc --noEmit` |
| `npm run bench`         | Executes the performance benchmark suite                    |
| `npm pack --dry-run`    | Verifies package tarball contents                           |

---

## 4. Pull Request Guidelines

1. **Create a branch:** Use a descriptive branch name (e.g. `feature/header-matching`, `fix/timer-leak`).
2. **Write tests:** Every new feature, fault type, or bug fix must include corresponding unit and integration tests.
3. **Verify checks:** Before submitting your PR, ensure all checks pass:
   ```bash
   npm run lint
   npm run typecheck
   npm run test:coverage
   ```
4. **Commit messages:** Use clear, conventional commit messages (`feat: ...`, `fix: ...`, `docs: ...`, `test: ...`).
