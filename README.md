# Agent Office

An experimental multi-agent organization runtime.

The project explores a practical question: can a group of AI agents build products as an organization when roles, authority, handoffs, review, and durable state are explicit rather than implicit in a chat transcript?

## What the experiment models

- **Role-based agents** — a role is a package of charter, boundaries, instructions, communication rules, and acceptance criteria.
- **Hiring and role packages** — roles are proposed, versioned, reviewed, and hired instead of appearing as untracked prompts.
- **Explicit authority** — the founder, functions, and agents have different decision rights.
- **Work handoffs** — work moves through durable artifacts in known paths.
- **Review and acceptance gates** — delivery is not complete until the responsible reviewer accepts it against explicit criteria.
- **Durable state and an event journal** — machine-readable state and append-only events preserve what happened between runs.
- **Machine-readable facts vs prose** — parsers consume manifests, front matter, schemas, and identifiers; human-facing documents can evolve independently.

The intended outcome is not a fictional org chart. It is a runtime where organizational constraints are executable and inspectable, so agents can coordinate work and build products with less hidden context.

## How it works

```text
role packages → hiring decision → durable state → work handoff
                                      │
                                      ▼
                         review / acceptance gates
                                      │
                                      ▼
                              event journal
```

The repository currently contains the governance/runtime core, role packages, project artifacts, scenario tests, and journal validation. It is an experiment in coordination and state management, not a finished end-user product.

## Quick start

Requires Node.js 22+.

```bash
node org/tools/state.mjs
node org/tools/gate.mjs head-of-people
node org/tools/check-all.mjs
node org/tools/validate-journal.mjs
node org/tools/org.mjs --check
node org/tools/scenarios.mjs
node --test org/tools/*.test.mjs
```

Useful entry points:

- [`COMPANY.md`](COMPANY.md) — founder charter and operating principles
- [`org/HIRING.md`](org/HIRING.md) — role package and hiring flow
- [`org/ORG.md`](org/ORG.md) — derived organization state
- [`docs/EVENT_SCHEMA.md`](docs/EVENT_SCHEMA.md) — event journal contract
- [`docs/PROGRESS.md`](docs/PROGRESS.md) — current experiment status
- [`org/scenarios/`](org/scenarios/) — executable acceptance scenarios

## Language choice

The project’s code, identifiers, schemas, manifests, and machine-readable facts are English. Russian prose in the internal/company documents is intentional: it is the current operating language for those artifacts, while the root README gives international readers an English entry point. Translating those documents is not required for the runtime and could obscure the distinction between parsed facts and human-facing prose.

## Repository status

This is a living research/engineering experiment. Some product work is deliberately waiting for organizational decisions and role ownership. The README and progress documents distinguish the runtime capabilities that exist today from the product that may be built on top of them.
