import { resolve } from 'path';
import { readFileSync } from 'fs';
import { defineConfig } from 'vite';
import reactPlugin from '@vitejs/plugin-react';
import { transformSync } from '@babel/core';
import * as t from '@babel/types';

/**
 * Babel plugin that inserts `Foo.__debugSourceDefine = {fileName, lineNumber, columnNumber}`
 * after each React function component declaration.
 *
 * When running after OXC (enforce: 'post'), Babel's AST positions refer to
 * the OXC-transformed code, not the original source. So we read the original
 * file to find the correct line numbers for function declarations.
 */
function addSourceLocationPlugin() {
  function isReactFunctionName(name: string) {
    return name && name.match(/^[A-Z].*/);
  }

  // Cache original file contents
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

  function findFunctionLine(filename: string, functionName: string): { line: number; column: number } | null {
    const lines = getOriginalLines(filename);
    for (let i = 0; i < lines.length; i++) {
      // Match "function FunctionName(" or "const FunctionName ="
      const funcMatch = lines[i].match(new RegExp(`\\bfunction\\s+${functionName}\\s*\\(`));
      const constMatch = lines[i].match(new RegExp(`\\b(?:const|let|var)\\s+${functionName}\\s*=`));
      if (funcMatch) {
        // Find the opening brace
        const braceCol = lines[i].indexOf('{', funcMatch.index! + funcMatch[0].length);
        if (braceCol >= 0) {
          return { line: i + 1, column: braceCol + 1 };
        }
        // Brace might be on next line
        for (let j = i + 1; j < lines.length; j++) {
          const bc = lines[j].indexOf('{');
          if (bc >= 0) return { line: j + 1, column: bc + 1 };
        }
      }
      if (constMatch) {
        // Find arrow function body: look for => and then { or (
        for (let j = i; j < Math.min(i + 5, lines.length); j++) {
          const arrowIdx = lines[j].indexOf('=>');
          if (arrowIdx >= 0) {
            // Body starts after =>
            const after = lines[j].substring(arrowIdx + 2).trim();
            if (after.startsWith('{') || after.startsWith('(')) {
              return { line: j + 1, column: arrowIdx + 3 };
            }
            // Next line
            if (j + 1 < lines.length) {
              return { line: j + 2, column: 1 };
            }
          }
        }
      }
    }
    return null;
  }

  function addDebugInfo(path: any, name: string, filename: string) {
    const loc = findFunctionLine(filename, name);
    if (!loc) return;
    const debugSourceMember = t.memberExpression(t.identifier(name), t.identifier('__debugSourceDefine'));
    const debugSourceDefine = t.objectExpression([
      t.objectProperty(t.identifier('fileName'), t.stringLiteral(filename)),
      t.objectProperty(t.identifier('lineNumber'), t.numericLiteral(loc.line)),
      t.objectProperty(t.identifier('columnNumber'), t.numericLiteral(loc.column)),
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
        addDebugInfo(path, name, state.file.opts.filename);
      },
      VariableDeclaration(path: any, state: any) {
        path.node.declarations.forEach((declaration: any) => {
          if (declaration.id.type !== 'Identifier') return;
          const name = declaration?.id?.name;
          if (!isReactFunctionName(name)) return;
          addDebugInfo(path, name, state.file.opts.filename);
        });
      },
    },
  };
}

/**
 * Custom Vite plugin that runs Babel AFTER OXC (enforce: 'post').
 * We can't use @rolldown/plugin-babel because it hardcodes enforce: 'pre'.
 */
function babelPostPlugin() {
  return {
    name: 'babel-post',
    enforce: 'post' as const,
    transform(code: string, id: string) {
      if (!id.endsWith('.tsx')) return null;
      const result = transformSync(code, {
        filename: id,
        plugins: [addSourceLocationPlugin],
        sourceMaps: true,
        sourceFileName: id,
      });
      if (!result?.code) return null;
      return { code: result.code, map: result.map };
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

    // Custom plugin that runs Babel AFTER OXC
    babelPostPlugin(),
  ],
});
