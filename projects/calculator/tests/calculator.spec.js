import { expect, test } from "@playwright/test";

test("adds two finite numbers", async () => {
  const { calculate } = await import("../src/calculator.js");
  const examples = [
    { left: 2, right: 3, expected: 5 },
    { left: -4, right: 1.5, expected: -2.5 },
    { left: 1.25, right: 2.5, expected: 3.75 },
  ];

  for (const { left, right, expected } of examples) {
    expect(calculate(left, right, "add")).toBe(expected);
  }
});

test("subtracts two finite numbers", async () => {
  const { calculate } = await import("../src/calculator.js");
  const examples = [
    { left: 7, right: 4, expected: 3 },
    { left: -2, right: 3.5, expected: -5.5 },
    { left: 1.25, right: -2.5, expected: 3.75 },
  ];

  for (const { left, right, expected } of examples) {
    expect(calculate(left, right, "subtract")).toBe(expected);
  }
});
