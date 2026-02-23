import { createApp } from "./app.js";
import { logInfo } from "./observability/logger.js";
const PORT = Number(process.env.PORT ?? 4000);

const app = await createApp();

app.listen(PORT, () => {
  logInfo("backend.started", {
    context: { request_id: "system", tenant_id: "system", agent_id: "system", run_id: "system" },
    data: { port: PORT, url: `http://localhost:${PORT}` }
  });
});
