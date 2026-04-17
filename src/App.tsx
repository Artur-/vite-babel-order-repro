// This file has known line numbers for testing source location accuracy.
// Do NOT reformat — the test depends on exact line positions.

// Lines 1-4: comments
// Lines 5-6: imports
import { useState } from 'react';
import { useEffect } from 'react';

// Line 9: HelloView function declaration
export function HelloView() {
  const [count, setCount] = useState(0);
  return (
    <div className="hello">
      <h1>Hello World</h1>
      <p>Count: {count}</p>
      <button onClick={() => setCount(count + 1)}>+1</button>
    </div>
  );
}

// Line 20: App function declaration
export function App() {
  useEffect(() => {}, []);
  return (
    <div className="app">
      <HelloView />
    </div>
  );
}
