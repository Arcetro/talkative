import cors from "cors";
import express from "express";
import { agentHub } from "./agents/agentHub.js";
import { authenticateRequest, authorizeRoleForRequest } from "./auth/middleware.js";
import { validateSecurityConfig } from "./auth/config.js";
import { attachRequestContext, logRequestLifecycle, logUnhandledError } from "./observability/requestContext.js";
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

export async function createApp() {
  validateSecurityConfig();

  const app = express();

  app.use(cors());
  app.use(express.json());
  app.use(attachRequestContext);
  app.use(logRequestLifecycle);

  app.get("/health", (_req, res) => {
    res.json({ ok: true, service: "workflow-agent-backend" });
  });

  app.use(authenticateRequest);
  app.use(authorizeRoleForRequest);

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
  app.use(logUnhandledError);
  return app;
}
