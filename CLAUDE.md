# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this service is

C1CServ is an Express HTTP service that synchronizes business objects (orders, nomenclature, counterparties, BOMs, etc.) between a **1C web server** (1С:УНФ / 1С:Бухгалтерия HTTP services), an **ERP database** (reached through an external SQL-execution HTTP service that runs stored procedures), and **MongoDB** (used as the sync log / GUID↔ref_id mapping store). Domain field names coming from 1C are in Russian (e.g. `response.Номенклатура.GUIDНоменклатуры`), and most code comments are in Russian.

## Commands

Yarn is the package manager (`yarn.lock`); scripts invoke tools through `ynpx`.

- `yarn dev` — run with nodemon + ts-node (`src/server.ts`), watches `src/`
- `yarn build` — `rimraf ./build && tsc` (outputs to `build/`)
- `yarn start` — build, then `node build/server.js`
- `yarn lint` / `yarn format` — ESLint check / autofix over `./src`

There are no tests. Server listens on `SERVER:PORT` from `.env` (defaults `127.0.0.1:3737`).

Required env vars are declared in `src/types/environment.d.ts`: `PORT`, `SERVER`, `DB_HOST`/`DB_PORT` (SQL-execution service), `MONGODB_SERVER`/`MONGODB_USER`/`MONGODB_PASSWORD`/`MONGODB_BASE`, `C1_WEBSERVER`.

## ESM gotchas

- `"type": "module"` with `module: NodeNext` — **all relative imports must use the `.js` extension**, even inside `.ts` files (`import routes from './modules/routes.js'`).
- CommonJS packages need interop workarounds, e.g. in `src/modules/validateRequest.ts`: `const Ajv = _Ajv as unknown as typeof _Ajv.default;`.
- `allowJs` is on; `src/modules/getDocLIst.js` is plain JS.

## Architecture

Entry chain: `src/server.ts` → `src/app.ts` (Express app, JSON middleware) → `src/modules/routes.ts` (all endpoints).

### Declarative export schemes drive everything

Each synced entity is described by an `ObjectSchemType` (defined in `src/types/C1Types.ts`) in `src/types/ExportSchemes.ts`:

- `collectionName` — MongoDB collection acting as the sync log for that entity
- `queryField` — dot-path to the 1C GUID inside the stored document
- `servC1Path` — 1C HTTP endpoint to fetch the object (`http://C1_WEBSERVER/<servC1Path>/<uid>`)
- `exportProcName` — ERP stored procedure that inserts/updates the record (e.g. `EXP_ZAKAZ_IU`)
- `prmMap` — SQL parameter → 1C field mapping (`createPrm`); an entry with `objScheme` is a **nested reference** that is exported first, recursively, and resolved to its ERP `ref_id`
- `arrMap` — nested arrays (document line items); each element gets `PARENT_ID` and is exported through its own scheme
- `afterPostMap` — follow-up export executed after the main record is saved

Mutually recursive schemes (Catalog→parent Catalog, Bom↔BomItems) are built via lazy factory functions in the same file. `objectInfoMap` maps string names → schemes for the `/C1_GUID` endpoint. **Adding a new synced entity = add a scheme + a route.**

### Core sync engine: `getObjectC1()` in `src/modules/1cdata.ts`

For a given scheme + 1C GUID:
1. Look up the GUID in the scheme's MongoDB collection (`src/modules/db.ts`); if a `ref_id` already exists, the object was already exported — return it (idempotency).
2. Otherwise fetch the object from the 1C web server via axios.
3. Build stored-procedure parameters with `getPrmSQLType()` (`src/modules/fbquery.ts`), recursively exporting nested `objScheme` references.
4. Execute the ERP stored procedure via `db_query()`, which POSTs `{procedureName, transactonType, prm}` to `http://DB_HOST:DB_PORT/query` and returns `ref_id`.
5. Insert the fetched 1C JSON plus `res: {insert_at, ref_id}` into MongoDB — this is the mapping record future lookups hit in step 1.

Errors are returned in the `err` field of the result object with numeric `errCode`s, not thrown.

### Other pieces

- `src/modules/routes.ts` — all routes follow the same shape: POST a list of 1C GUIDs (`DOC`), ERP ids (`REF_ID`/`NOM`), then loop calling `getObjectC1`. Request bodies are validated by Ajv middleware (`validateBody` in `src/modules/validateRequest.ts`) against JSON schemas in `src/types/schemas.ts`.
- `src/modules/fromERP.ts` — reverse direction: create objects in 1C from ERP data (`/ERP_NEW_NOM`, `/ERP_NEW_CATALOG`).
- `src/modules/parseNomenklature.ts` + `src/types/C1NomPaterns.ts` — extract structured attributes (component parameters) from nomenclature name strings using regex patterns, including Cyrillic→Latin lookalike-character normalization. Result is attached as an `ADD` field before export.
- `src/modules/objHelper.ts` — `getValueByPath()` dot-path accessor used everywhere schemes reference fields.
- `src/modules/db.ts` — singleton Mongo connection (`loadDB`) and `MongoDBCollection` wrapper keyed by a scheme's `queryField`; Sentry captures connection errors.
