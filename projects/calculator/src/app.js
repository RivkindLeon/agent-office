import { calculate } from "./calculator.js";

const form = document.querySelector("#calculator");
const left = document.querySelector("#left");
const operation = document.querySelector("#operation");
const right = document.querySelector("#right");
const result = document.querySelector("#result");

form.addEventListener("submit", (event) => {
  event.preventDefault();
  result.textContent = String(
    calculate(Number(left.value), Number(right.value), operation.value),
  );
});
