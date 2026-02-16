import { createApp } from "./app.js";
const PORT = Number(process.env.PORT ?? 4000);

const app = await createApp();

app.listen(PORT, () => {
  // Keep startup log explicit for local POC runs.
  console.log(`Backend listening on http://localhost:${PORT}`);
});
