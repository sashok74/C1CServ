# Repository Guidelines

## Project Structure & Module Organization

This repository is a TypeScript/Express integration service that moves data between 1C, ERP endpoints, and MongoDB. `src/server.ts` loads configuration and starts the HTTP server; `src/app.ts` configures Express. Route definitions live in `src/modules/routes.ts`, reusable integration and database logic in `src/modules/`, request handlers in `src/controllers/`, and shared schemas/types in `src/types/`. Sample payloads and document IDs are under `src/testData/`. TypeScript compiles into the generated, ignored `build/` directory.

## Build, Test, and Development Commands

Use Yarn because `yarn.lock` is committed.

- `yarn install` installs dependencies.
- `yarn dev` starts Nodemon and reloads when files in `src/` change.
- `yarn build` removes `build/` and compiles the project with `tsc`.
- `yarn start` builds, then runs `build/server.js`.
- `yarn lint` checks all source files with ESLint.
- `yarn format` applies ESLint auto-fixes.

## Coding Style & Naming Conventions

The project uses strict TypeScript, NodeNext modules, and ESM. Keep `.js` extensions in relative imports even inside `.ts` files so emitted imports resolve correctly. Prettier specifies two-space indentation, semicolons, single quotes, trailing commas, and a 120-character line width. Use `camelCase` for functions and variables, `PascalCase` for types/classes and exported mapping objects, and descriptive route or schema names consistent with the surrounding integration vocabulary. Run `yarn lint` before committing.

## Testing Guidelines

There is currently no automated test framework, `test` script, or coverage threshold. At minimum, run `yarn build` and `yarn lint`, then manually exercise affected Express routes against configured services. Use `src/testData/` only for non-secret fixtures. When introducing automated tests, add a documented Yarn script and name files `*.test.ts`.

## Security & Configuration

Runtime settings come from `.env`, which is ignored by Git. Never commit credentials or log complete connection strings. Relevant settings include `PORT`, `SERVER`, `DB_HOST`, `DB_PORT`, MongoDB connection variables, and `C1_WEBSERVER`. Document any newly required variable without publishing its value.

## Initial Context

Before analyzing or changing C1CServ, the HiTek integration, or the Firebird schema, read `c1serv_doc/README.md`. Use it as the initial architectural context, then verify mutable operational facts against current code and live metadata.

## Commit & Pull Request Guidelines

Recent commits use short, lowercase, imperative summaries such as `add validation` and `update ...`; keep each commit focused and similarly direct. Pull requests should explain the integration behavior changed, list configuration impacts, include build/lint results, link related issues, and provide sample request/response data for API changes. Include screenshots only when they clarify externally visible behavior.
