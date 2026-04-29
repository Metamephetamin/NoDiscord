import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import Renderer from "./renderer";

const container = document.getElementById("root");
const root = createRoot(container);

document.addEventListener("contextmenu", (event) => {
  event.preventDefault();
});

root.render(
  <BrowserRouter>
    <Renderer />
  </BrowserRouter>
);
