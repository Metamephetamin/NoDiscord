import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import Renderer from "./renderer";
import { initializeAppLogoPreference } from "./utils/appLogo";

const container = document.getElementById("root");
const root = createRoot(container);

initializeAppLogoPreference();

document.addEventListener("contextmenu", (event) => {
  event.preventDefault();
});

root.render(
  <BrowserRouter>
    <Renderer />
  </BrowserRouter>
);
