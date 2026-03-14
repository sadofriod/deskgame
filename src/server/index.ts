// HTTP server entry point – starts the Express app on the configured port.

import { createApp } from "./app";

const PORT = process.env.PORT ? Number(process.env.PORT) : 3000;

const app = createApp();
app.listen(PORT, () => {
  console.log(`DeskGame server listening on port ${PORT}`);
});
