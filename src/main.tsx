import { createRoot } from "react-dom/client";
import App from "./App";
import { start } from "./store";
import "./styles.css";

// No browser menu (Reload, Print, Inspect) in the shipped app. Text fields keep theirs.
document.addEventListener("contextmenu", (e) => {
  const t = e.target as HTMLElement;
  if (!import.meta.env.DEV && t.tagName !== "INPUT") e.preventDefault();
});

void start();
createRoot(document.getElementById("root")!).render(<App />);
