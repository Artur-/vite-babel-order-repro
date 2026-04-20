import { resolve } from 'path';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import babel from '@rolldown/plugin-babel';
import * as t from '@babel/types';

/**
 * Babel plugin that inserts `Foo.__debugSourceDefine = {fileName, lineNumber, columnNumber}`
 * after each React function component declaration, using Babel's own AST positions.
 */
function addSourceLocationPlugin() {
  function isReactFunctionName(name: string) {
    return name && name.match(/^[A-Z].*/);
  }

  function addDebugInfo(path: any, name: string, filename: string, loc: any) {
    const debugSourceMember = t.memberExpression(t.identifier(name), t.identifier('__debugSourceDefine'));
    const debugSourceDefine = t.objectExpression([
      t.objectProperty(t.identifier('fileName'), t.stringLiteral(filename)),
      t.objectProperty(t.identifier('lineNumber'), t.numericLiteral(loc.start.line)),
      t.objectProperty(t.identifier('columnNumber'), t.numericLiteral(loc.start.column + 1)),
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
    // react() provides Fast Refresh (HMR) and JSX transform via OXC.
    // The custom jsxImportSource wraps React 19's jsxDEV to preserve
    // source locations on _debugInfo (since React 19 dropped _source).
    react(),

    // Babel runs with enforce:'pre' (default), so it sees the original source.
    // Both the JSX dev transform and __debugSourceDefine get correct line numbers.
    babel({
      plugins: [
        ['@babel/plugin-transform-react-jsx-development', {
          importSource: 'jsx-dev-transform',
        }],
        () => addSourceLocationPlugin(),
      ],
    }),
  ],
});
