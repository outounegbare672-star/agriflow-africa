import assert from "node:assert/strict";
import { test } from "node:test";
import braces from "braces";

test("brace patterns at the nesting limit still work", () => {
  const pattern = `${"{".repeat(100)}value${"}".repeat(100)}`;

  assert.doesNotThrow(() => braces.compile(pattern));
  assert.deepEqual(braces("{a,b}", { expand: true }), ["a", "b"]);
});

test("brace and parenthesis nesting beyond the limit is rejected", () => {
  const nestedBraces = `${"{".repeat(101)}value${"}".repeat(101)}`;
  const nestedParens = `${"(".repeat(101)}value${")".repeat(101)}`;

  assert.throws(() => braces.compile(nestedBraces), /max depth \(100\)/);
  assert.throws(() => braces.expand(nestedBraces), /max depth \(100\)/);
  assert.throws(() => braces.compile(nestedParens), /max depth \(100\)/);
});
