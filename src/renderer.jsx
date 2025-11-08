import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import Auth from "./components/auth";

const container = document.getElementById("root");
const root = createRoot(container);

root.render(
  <BrowserRouter>
    <Auth />
  </BrowserRouter>
);
