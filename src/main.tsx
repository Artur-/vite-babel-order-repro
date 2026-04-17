import { createRoot } from 'react-dom/client';
import { App, HelloView } from './App';

const root = createRoot(document.getElementById('root')!);
root.render(<App />);

// Known correct line numbers from App.tsx:
//   HelloView function:     line 10 (body { on same line)
//   <div class="hello">:    line 13
//   <h1>:                   line 14
//   App function:           line 22 (body { on same line)
//   <div class="app">:      line 25

const EXPECTED = {
  helloFunc: 10,
  helloDivJsx: 13,
  h1Jsx: 14,
  appFunc: 22,
  appDivJsx: 25,
};

setTimeout(async () => {
  const results: string[] = [];

  function check(label: string, actual: number | undefined, expected: number) {
    if (actual === undefined) {
      results.push(`  ${label}: NOT FOUND`);
      return false;
    }
    const ok = actual === expected;
    results.push(`  ${label}: line ${actual} ${ok ? '✅' : `❌ expected ${expected}, off by ${actual - expected}`}`);
    return ok;
  }

  function getFiberSource(el: Element | null) {
    if (!el) return undefined;
    const fiberKey = Object.keys(el).find(k => k.startsWith('__reactFiber$'));
    if (!fiberKey) return undefined;
    const fiber = (el as any)[fiberKey];
    return fiber?._debugSource || fiber?._debugInfo?.source;
  }

  // Check __debugSourceDefine (set by our Babel plugin)
  const helloDefine = (HelloView as any).__debugSourceDefine;
  const appDefine = (App as any).__debugSourceDefine;

  results.push('__debugSourceDefine (Babel plugin — function body location):');
  const b1 = check('HelloView', helloDefine?.lineNumber, EXPECTED.helloFunc);
  const b2 = check('App', appDefine?.lineNumber, EXPECTED.appFunc);
  results.push('');

  // Check _debugInfo.source (set by OXC jsxDEV via custom jsx-dev-transform)
  const helloSource = getFiberSource(document.querySelector('.hello'));
  const appSource = getFiberSource(document.querySelector('.app'));

  results.push('_debugInfo.source (OXC jsxDEV — JSX element location):');
  const j1 = check('<div class="hello">', helloSource?.lineNumber, EXPECTED.helloDivJsx);
  const j2 = check('<div class="app">', appSource?.lineNumber, EXPECTED.appDivJsx);
  results.push('');

  // Verdict
  const allPass = b1 && b2 && j1 && j2;
  if (allPass) {
    results.push('✅ ALL PASS');
  } else {
    results.push('❌ SOME CHECKS FAILED — see above');
    results.push('');
    if (!b1 || !b2) {
      results.push('__debugSourceDefine is wrong because Babel AST loc values');
      results.push('refer to OXC-transformed code, not the original source.');
    }
    if (!j1 || !j2) {
      results.push('jsxDEV source info is wrong because Babel ran before OXC');
      results.push('and inserted lines that shifted OXC\'s line numbers.');
    }
    results.push('');
    results.push('Try:');
    results.push('  npx vite              — enforce:post (default), __debugSourceDefine wrong');
    results.push('  MODE=pre npx vite     — enforce:pre, jsxDEV wrong');
    results.push('  MODE=workaround npx vite — both correct');
  }

  document.getElementById('output')!.textContent = results.join('\n');
}, 1000);
