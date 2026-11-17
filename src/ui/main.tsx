import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

import { App } from "./App";
import { initDrafts } from "./drafts";
import { t } from "./i18n";
import { openSession } from "./session";
import { initWorkspace } from "./workspace";
import "./app.css";

const container = document.querySelector("#root");
if (!container) {
  throw new Error("找不到 #root");
}

// 先读出上次的工作区（IndexedDB），再显示界面
const record = await openSession(t().workspace.defaultName);
initWorkspace(record);
initDrafts();

createRoot(container).render(
  <StrictMode>
    <App />
  </StrictMode>
);
