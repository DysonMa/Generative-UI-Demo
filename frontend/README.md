# Frontend

React, Vite, json-render, shadcn catalog components, and Recharts based visualization widgets live here. The frontend owns the component registry and catalog in `src/catalog.js`; React renders the validated spec returned by the backend.

## Install and run

Run these commands from the `frontend/` directory:

```sh
npm install
npm run dev
```

Vite proxies `/api` to `http://127.0.0.1:3002` by default. Configure `VITE_API_PROXY_TARGET` in the repository root `.env` to use a different backend URL. The frontend does not contain or run an AI backend.

## Build and preview

Run from `frontend/`:

```sh
npm run build
npm run preview
```

Build artifacts are written to `frontend/dist/`.

## Export the catalog for backend use

After changing component definitions or descriptions in `src/catalog.js`, run from `frontend/`:

```sh
npm run export:catalog
```

This generates `../backend/Catalog/catalog-contract.json`, which contains component names, descriptions, examples, the catalog prompt, and the spec JSON Schema. Commit the generated file along with catalog changes. If you add a widget, also add its mapping and compile behavior in `../backend/Rendering/UiSpecCompiler.cs`.
