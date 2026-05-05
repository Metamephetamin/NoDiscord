import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const authSource = readFileSync("src/components/Auth.jsx", "utf8");
const authCss = readFileSync("src/css/Auth.css", "utf8");

assert(authSource.includes("shouldShowRegistrationCodeStep"), "Registration email verification should have an inline code step.");
assert(authSource.includes("returnToRegistrationForm"), "Registration code step should provide a back action.");
assert(authSource.includes("auth-section--registration-code"), "Registration code step should render inside the auth card.");
assert(!authSource.includes("auth-verify-modal__backdrop"), "Registration verification should not render a separate modal backdrop.");
assert(!authSource.includes("auth-verify-modal__close"), "Registration verification should not render a modal close button.");
assert(authCss.includes(".auth-registration-code__actions"), "Registration code step actions should be styled.");

console.log("Auth registration code smoke checks passed.");
