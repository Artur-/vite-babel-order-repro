import { resolve } from 'path';
import { readFileSync } from 'fs';
import { defineConfig } from 'vite';
import reactPlugin from '@vitejs/plugin-react';
import babel from '@rolldown/plugin-babel';
import { transformSync } from '@babel/core';
import * as t from '@babel/types';

// MODE controls which configuration to use:
//   (default)         — @rolldown/plugin-babel with enforce:'post' via .then()
//                       Shows: __debugSourceDefine WRONG, jsxDEV correct
//   MODE=pre          — @rolldown/plugin-babel with default enforce:'pre'
//                       Shows: __debugSourceDefine correct, jsxDEV WRONG
//   MODE=workaround   — custom plugin reading original file from disk
//                       Shows: both correct
const MODE = process.env.MODE || 'post';

/**
 * Babel plugin that inserts `Foo.__debugSourceDefine = {fileName, lineNumber, columnNumber}`
 * after each React function component declaration.
 *
 * This demonstrates a real-world use case: embedding original source positions
 * in the code so dev tools can map components back to their source files.
 */
function addSourceLocationPlugin({ useOriginalFile = false } = {}) {
  function isReactFunctionName(name: string) {
    return name && name.match(/^[A-Z].*/);
  }

  // --- Workaround: read original file to get correct positions ---
  const originalSources: Record<string, string[]> = {};

  function getOriginalLines(filename: string): string[] {
    if (!originalSources[filename]) {
      try {
        originalSources[filename] = readFileSync(filename, 'utf-8').split('\n');
      } catch {
        originalSources[filename] = [];
      }
    }
    return originalSources[filename];
  }

  function findFunctionLineFromFile(filename: string, functionName: string) {
    const lines = getOriginalLines(filename);
    for (let i = 0; i < lines.length; i++) {
      const funcMatch = lines[i].match(new RegExp(`\\bfunction\\s+${functionName}\\s*\\(`));
      const constMatch = lines[i].match(new RegExp(`\\b(?:const|let|var)\\s+${functionName}\\s*=`));
      if (funcMatch) {
        const braceCol = lines[i].indexOf('{', funcMatch.index! + funcMatch[0].length);
        if (braceCol >= 0) return { line: i + 1, column: braceCol + 1 };
        for (let j = i + 1; j < lines.length; j++) {
          const bc = lines[j].indexOf('{');
          if (bc >= 0) return { line: j + 1, column: bc + 1 };
        }
      }
      if (constMatch) {
        for (let j = i; j < Math.min(i + 5, lines.length); j++) {
          const arrowIdx = lines[j].indexOf('=>');
          if (arrowIdx >= 0) {
            const afterArrow = lines[j].substring(arrowIdx + 2);
            const trimmed = afterArrow.trim();
            if (trimmed.length > 0) {
              const bodyStart = arrowIdx + 2 + afterArrow.indexOf(trimmed.charAt(0));
              return { line: j + 1, column: bodyStart + 1 };
            }
            if (j + 1 < lines.length) return { line: j + 2, column: 1 };
          }
        }
      }
    }
    return null;
  }
  // --- End workaround ---

  function addDebugInfo(path: any, name: string, filename: string, babelLoc: any) {
    let line: number;
    let column: number;

    if (useOriginalFile) {
      // WORKAROUND: read original file to get correct positions
      const loc = findFunctionLineFromFile(filename, name);
      if (!loc) return;
      line = loc.line;
      column = loc.column;
    } else {
      // DEFAULT: use Babel AST loc (wrong after OXC transform)
      line = babelLoc.start.line;
      column = babelLoc.start.column + 1;
    }

    const debugSourceMember = t.memberExpression(t.identifier(name), t.identifier('__debugSourceDefine'));
    const debugSourceDefine = t.objectExpression([
      t.objectProperty(t.identifier('fileName'), t.stringLiteral(filename)),
      t.objectProperty(t.identifier('lineNumber'), t.numericLiteral(line)),
      t.objectProperty(t.identifier('columnNumber'), t.numericLiteral(column)),
    ]);
    const assignment = t.expressionStatement(t.assignmentExpression('=', debugSourceMember, debugSourceDefine));
    const condition = t.binaryExpression('===', t.unaryExpression('typeof', t.identifier(name)), t.stringLiteral('function'));
    const ifFunction = t.ifStatement(condition, t.blockStatement([assignment]));
    path.insertAfter(ifFunction);
  }

  return {
    visitor: {
      FunctionDeclaration(path: any, state: any) {
        const name = path.node?.id?.name;
        if (!isReactFunctionName(name)) return;
        if (path.node.body.loc) {
          addDebugInfo(path, name, state.file.opts.filename, path.node.body.loc);
        }
      },
      VariableDeclaration(path: any, state: any) {
        path.node.declarations.forEach((declaration: any) => {
          if (declaration.id.type !== 'Identifier') return;
          const name = declaration?.id?.name;
          if (!isReactFunctionName(name)) return;
          if (declaration?.init?.body?.loc) {
            addDebugInfo(path, name, state.file.opts.filename, declaration.init.body.loc);
          }
        });
      },
    },
  };
}

export default defineConfig({
  resolve: {
    alias: {
      'jsx-dev-transform': resolve(__dirname, 'src/jsx-dev-transform'),
    },
  },
  plugins: [
    // OXC transforms JSX and embeds source locations in jsxDEV() calls
    reactPlugin({
      include: '**/*.tsx',
      jsxImportSource: 'jsx-dev-transform',
    }),

    // Babel plugin configuration — varies by MODE
    ...(MODE === 'workaround'
      ? [
          // WORKAROUND: custom plugin with enforce:'post' and original file reading
          // Result: both __debugSourceDefine AND jsxDEV are correct
          {
            name: 'babel-post',
            enforce: 'post' as const,
            transform(code: string, id: string) {
              if (!id.endsWith('.tsx')) return null;
              const result = transformSync(code, {
                filename: id,
                plugins: [() => addSourceLocationPlugin({ useOriginalFile: true })],
                sourceMaps: true,
                sourceFileName: id,
              });
              if (!result?.code) return null;
              return { code: result.code, map: result.map };
            },
          },
        ]
      : MODE === 'pre'
        ? [
            // enforce:'pre' (default for @rolldown/plugin-babel)
            // Result: __debugSourceDefine correct, jsxDEV WRONG
            babel({
              include: '**/*.tsx',
              plugins: [() => addSourceLocationPlugin({ useOriginalFile: false })],
            }),
          ]
        : [
            // enforce:'post' via .then() override
            // Result: __debugSourceDefine WRONG, jsxDEV correct
            babel({
              include: '**/*.tsx',
              plugins: [() => addSourceLocationPlugin({ useOriginalFile: false })],
            }).then((p: any) => {
              p.enforce = 'post';
              return p;
            }),
          ]),
  ],
});
