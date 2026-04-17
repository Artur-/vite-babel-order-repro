# Vite 8 Babel/OXC Plugin Order — Source Location Fix

## Problem

Vaadin Copilot needs accurate source location info for React components:

1. **`__debugSourceDefine`** — Added by a custom Babel plugin after each React function component declaration. Contains the `{fileName, lineNumber, columnNumber}` of the function body in the original source. Used to identify route views and match components to source files.

2. **`_debugInfo.source`** — Added by OXC's jsxDEV transform via a custom `jsxImportSource`. Contains the `{fileName, lineNumber, columnNumber}` of each JSX element in the original source. Used by the component tree to map DOM elements back to source code.

Both must point to correct positions in the **original** `.tsx` source file.

## How it worked with Vite 7

Vite 7 used **esbuild** for JSX transformation and **Babel** for everything else. The `@vitejs/plugin-react` plugin ran Babel with both JSX transform and the source location plugin in a single pass. Since Babel handled everything, its AST `loc` positions always referred to the original source.

## What broke with Vite 8

Vite 8 uses **OXC** (via `@vitejs/plugin-react` v6+) for JSX transformation and **`@rolldown/plugin-babel`** for additional transforms. Two problems:

### Problem 1: Plugin execution order

`@rolldown/plugin-babel` hardcodes `enforce: 'pre'`, making Babel run **before** OXC. The Babel source location plugin inserts ~4 lines of code (`if (typeof Foo === 'function') { Foo.__debugSourceDefine = {...} }`) after each component declaration. When OXC runs next, it sees the modified code and embeds **wrong line numbers** in `jsxDEV()` calls — shifted by the number of lines Babel inserted.

Attempting to override `enforce` via `Object.assign(babel({...}), { enforce: 'post' })` does not work because `@rolldown/plugin-babel` uses non-enumerable properties and reads `enforce` internally before the override takes effect.

### Problem 2: Babel AST positions after OXC

Even after fixing the execution order, Babel's AST `loc` values refer to the **OXC-transformed** code, not the original source. The transformed code has different line numbers because OXC rewrites imports, adds HMR boilerplate, etc. Using `loc.start.line` for `__debugSourceDefine` produces wrong positions.

## Solution

### Fix 1: Custom Vite plugin instead of @rolldown/plugin-babel

Replace `@rolldown/plugin-babel` with a custom Vite plugin that calls `@babel/core` `transformSync` directly and sets `enforce: 'post'`. This guarantees Babel runs **after** OXC, so OXC sees the original source and produces correct `jsxDEV()` line numbers.

### Fix 2: Read original file for __debugSourceDefine positions

The `addFunctionComponentSourceLocationBabel` plugin now reads the **original source file** from disk using `readFileSync` to find function declaration positions, instead of relying on Babel's AST `loc` values. This ensures `__debugSourceDefine` always contains correct original line numbers regardless of what transforms ran before Babel.

## Running the repro

```bash
npm install
npx vite
```

Open in browser. The page automatically checks:
- Whether `__debugSourceDefine` line numbers match the original source
- Whether `_debugInfo.source` (from jsxDEV) line numbers match the original source
- Displays ✅ PASS or ❌ FAIL with details

## Files

- `vite.config.ts` — Shows the custom Babel plugin with `enforce: 'post'` and original-file-based source location detection
- `src/App.tsx` — Test component with known line numbers
- `src/main.tsx` — Automated verification logic
- `src/jsx-dev-transform/` — Custom JSX dev runtime that stores source info on `_debugInfo.source` (needed for React 19)
