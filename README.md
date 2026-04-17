# Babel AST `loc` produces wrong positions after OXC transform

Reproduction for https://github.com/vitejs/vite-plugin-react/issues/XXXX

## The problem

When a Babel plugin runs **after** `@vitejs/plugin-react`'s OXC JSX transform, the Babel AST `loc` values (e.g., `path.node.body.loc.start.line`) refer to the **OXC-transformed code**, not the original source file.

Any Babel plugin that reads `loc` to embed source positions in the output produces **wrong line numbers**.

This was not an issue with `@vitejs/plugin-react` v5, where Babel handled both JSX transform and custom plugins in a single pass — `loc` always pointed to the original source.

## Use case

We have a Babel plugin that inserts source location metadata after each React component:

```js
// Input:
export function HelloView() {     // line 10
  return <div>Hello</div>;
}

// Output (inserted by Babel plugin):
export function HelloView() {
  return <div>Hello</div>;
}
if (typeof HelloView === "function") {
  HelloView.__debugSourceDefine = {
    fileName: "/path/to/file.tsx",
    lineNumber: 10,     // ← should match original source
    columnNumber: 40
  };
}
```

Dev tools use `__debugSourceDefine` to map rendered components back to their source files. When line numbers are wrong, the mapping breaks.

## Running the reproduction

```bash
npm install
```

### Mode 1: enforce:'post' (default) — `__debugSourceDefine` wrong

```bash
npx vite
```

Babel runs AFTER OXC. OXC's `jsxDEV()` source info is correct, but Babel's AST `loc` values refer to the OXC-transformed code, so `__debugSourceDefine` line numbers are wrong.

### Mode 2: enforce:'pre' — `jsxDEV` source info wrong

```bash
MODE=pre npx vite
```

Babel runs BEFORE OXC (the `@rolldown/plugin-babel` default). Babel's `__debugSourceDefine` line numbers are correct, but Babel inserts extra lines that shift OXC's `jsxDEV()` source positions. Every JSX element in the app gets wrong line numbers.

### Mode 3: workaround — both correct

```bash
MODE=workaround npx vite
```

All checks pass. Uses a custom Vite plugin with `enforce: 'post'` and reads the original source file from disk to find function positions.

## What the workaround does

1. **Replaces `@rolldown/plugin-babel`** with a custom Vite plugin that calls `@babel/core` directly with `enforce: 'post'` (because `@rolldown/plugin-babel` hardcodes `enforce: 'pre'`)

2. **Reads the original file** from disk using `readFileSync` to find function declaration line numbers via regex, instead of relying on `loc.start.line`

## What would help

In `@vitejs/plugin-react` v5, custom Babel plugins could be passed via `react({ babel: { plugins: [...] } })`. They ran in the same Babel pass as the JSX transform, so `loc` values always referred to the original source.

Possible solutions:

- **Restore the `babel` option** — run custom Babel plugins within the react plugin's transform pipeline, with correct `loc` values
- **Remap `loc` values** — `@rolldown/plugin-babel` could use the combined source map from previous transforms to remap AST `loc` to original positions before plugins see them
- **Expose original source** — `@vitejs/plugin-react` could attach the original source text to Vite's module metadata for downstream plugins to access

## Files

- `vite.config.ts` — Plugin setup with `USE_WORKAROUND` toggle
- `src/App.tsx` — Test components with known line numbers
- `src/main.tsx` — Automated source position verification
- `src/jsx-dev-transform/` — Custom JSX dev runtime for React 19 `_debugInfo.source`

## Related issues

- [vitejs/vite-plugin-react#235](https://github.com/vitejs/vite-plugin-react/issues/235) — lineNumber error for __source prop
- [vitejs/vite-plugin-react#266](https://github.com/vitejs/vite-plugin-react/issues/266) — Babel reformats the input file, causing source references to be wrong
- [vitejs/vite-plugin-react#1139](https://github.com/vitejs/vite-plugin-react/issues/1139) — enforce: 'post' required for React Compiler
- [vitejs/vite#20576](https://github.com/vitejs/vite/issues/20576) — Vite plugin transform needs source map of input
