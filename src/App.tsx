// Line 1
// Line 2
// Line 3: This is a comment
// Line 4: Another comment
// Line 5: Yet another comment
// Line 6: One more comment

// Line 8: HelloView should be at line 9
export function HelloView() {
  return (
    <div className="hello">
      <h1>Hello World</h1>
      <p>This is a test</p>
    </div>
  );
}

// Line 18: App should be at line 19
export function App() {
  return (
    <div className="app">
      <HelloView />
    </div>
  );
}
