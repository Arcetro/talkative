import cors from "cors";
import express from "express";
import { agentHub } from "./agents/agentHub.js";
import { agentRouter } from "./routes/agentRoutes.js";
import { approvalRouter } from "./routes/approvalRoutes.js";
import { channelRouter } from "./routes/channelRoutes.js";
import { conversationRouter } from "./routes/conversationRoutes.js";
import { fleetRouter } from "./routes/fleetRoutes.js";
import { orchestratorRouter } from "./routes/orchestratorRoutes.js";
import { promptRouter } from "./routes/promptRoutes.js";
import { routerAdminRouter } from "./routes/routerAdminRoutes.js";
import { workflowRouter } from "./routes/workflowRoutes.js";
import { subscribeEvents } from "./services/eventBus.js";

const app = express();
const PORT = Number(process.env.PORT ?? 4000);

app.use(cors());
app.use(express.json());

app.get("/health", (_req, res) => {
  res.json({ ok: true, service: "workflow-agent-backend" });
});

app.use(workflowRouter);
app.use(conversationRouter);
app.use(agentRouter);
app.use(channelRouter);
app.use(promptRouter);
app.use(approvalRouter);
app.use(routerAdminRouter);
app.use(fleetRouter);
app.use(orchestratorRouter);

app.get("/events", (_req, res) => {
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.flushHeaders();

  const unsubscribe = subscribeEvents((event) => {
    res.write(`data: ${JSON.stringify(event)}\n\n`);
  });

  const heartbeat = setInterval(() => {
    res.write(": heartbeat\n\n");
  }, 20000);

  res.on("close", () => {
    clearInterval(heartbeat);
    unsubscribe();
    res.end();
  });
});

await agentHub.init();

app.listen(PORT, () => {
  // Keep startup log explicit for local POC runs.
  console.log(`Backend listening on http://localhost:${PORT}`);
});
