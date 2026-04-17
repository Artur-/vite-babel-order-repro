import { createRoot } from 'react-dom/client';
import { App, HelloView } from './App';

const root = createRoot(document.getElementById('root')!);
root.render(<App />);

// Wait for render, then check source locations
setTimeout(async () => {
  const results: string[] = [];

  // Expected line numbers from App.tsx original source:
  // Line 9:  export function HelloView() {
  // Line 11:   <div className="hello">
  // Line 12:     <h1>Hello World</h1>
  // Line 19: export function App() {
  // Line 21:   <div className="app">
  const helloFuncLine = 9;
  const appFuncLine = 19;
  const helloDivLine = 11;
  const appDivLine = 21;
  const h1Line = 12;

  // Check __debugSourceDefine (set by Babel plugin)
  const appDefine = (App as any).__debugSourceDefine;
  const helloDefine = (HelloView as any).__debugSourceDefine;
  results.push('=== __debugSourceDefine (from Babel plugin — points to function body) ===');

  function checkDefine(name: string, define: any, expectedLine: number) {
    const ok = define?.lineNumber === expectedLine;
    results.push(`${name}: line ${define?.lineNumber} (expected: ${expectedLine}) ${ok ? '✅' : '❌ OFF BY ' + (define?.lineNumber - expectedLine)}`);
  }
  checkDefine('HelloView', helloDefine, helloFuncLine);
  checkDefine('App', appDefine, appFuncLine);
  results.push('');

  // Check _debugInfo.source (set by custom jsx-dev-transform)
  results.push('=== _debugInfo.source (from OXC jsxDEV — points to JSX element) ===');

  function checkSource(el: Element | null, label: string, expectedLine: number) {
    if (!el) { results.push(`${label}: element not found`); return; }
    const fiberKey = Object.keys(el).find(k => k.startsWith('__reactFiber$'));
    if (!fiberKey) { results.push(`${label}: no fiber found`); return; }
    const fiber = (el as any)[fiberKey];
    const source = fiber?._debugSource || fiber?._debugInfo?.source;
    const line = source?.lineNumber;
    const ok = line === expectedLine;
    results.push(`${label}: line ${line} (expected: ${expectedLine}) ${ok ? '✅' : '❌ OFF BY ' + (line - expectedLine)}`);
  }

  checkSource(document.querySelector('.hello'), '<div class="hello">', helloDivLine);
  checkSource(document.querySelector('h1'), '<h1>', h1Line);
  checkSource(document.querySelector('.app'), '<div class="app">', appDivLine);
  results.push('');

  // Verdict
  const helloEl = document.querySelector('.hello');
  const fk = helloEl && Object.keys(helloEl).find(k => k.startsWith('__reactFiber$'));
  const helloFiber = fk && (helloEl as any)[fk];
  const helloSource = helloFiber?._debugSource || helloFiber?._debugInfo?.source;

  const jsxDevCorrect = helloSource?.lineNumber === helloDivLine;
  const babelCorrect = helloDefine?.lineNumber === helloFuncLine;

  results.push('=== VERDICT ===');
  if (jsxDevCorrect && babelCorrect) {
    results.push('✅ PASS: Both _debugInfo.source and __debugSourceDefine have correct line numbers');
  } else {
    if (!jsxDevCorrect) results.push(`❌ _debugInfo.source wrong: got ${helloSource?.lineNumber}, expected ${helloDivLine}`);
    if (!babelCorrect) results.push(`❌ __debugSourceDefine wrong: got ${helloDefine?.lineNumber}, expected ${helloFuncLine}`);
  }

  document.getElementById('output')!.textContent = results.join('\n');
}, 1000);
