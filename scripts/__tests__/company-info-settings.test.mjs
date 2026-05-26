import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const menuModelSource = readFileSync("src/utils/menuMainModel.js", "utf8");
const panelsSource = readFileSync("src/components/MenuSettingsPanels.jsx", "utf8");
const rendererSource = readFileSync("src/features/menu-main/MenuMainSettingsRenderer.jsx", "utf8");
const overlaysSource = readFileSync("src/components/MenuMainOverlays.jsx", "utf8");

test("settings expose product and company information with the configured INN", () => {
  assert(
    menuModelSource.includes('{ id: "company_info", label: "О продукте и компании", section: "О приложении" }'),
    "Settings navigation must include the company info item at the bottom."
  );

  assert(
    panelsSource.includes("export const ProductCompanyInfoSettings") &&
      panelsSource.includes("504417743063") &&
      panelsSource.includes("https://lanaya.space"),
    "ProductCompanyInfoSettings must render basic company/product details."
  );

  assert(
    rendererSource.includes("ProductCompanyInfoSettings") &&
      rendererSource.includes('case "company_info"'),
    "Settings renderer must route the company info tab."
  );

  assert(
    overlaysSource.includes("company_info"),
    "Settings nav icon set must support the company info tab."
  );
});
