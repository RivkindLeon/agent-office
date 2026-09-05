export function calculate(left, right, operation) {
  if (operation === "add") {
    return left + right;
  }
  if (operation === "subtract") {
    return left - right;
  }
  if (operation === "multiply") {
    return left * right;
  }
}
