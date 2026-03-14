// HTTP server entry point – starts the Express app on the configured port.

import { createApp } from "./app";

function resolvePort(raw: string | undefined): number {
  const n = raw !== undefined ? Number(raw) : 3000;
  if (Number.isFinite(n) && Number.isInteger(n) && n > 0) return n;
  console.error(`Invalid PORT value "${raw}", falling back to 3000`);
  return 3000;
}

const PORT = resolvePort(process.env.PORT);

const app = createApp();
app.listen(PORT, () => {
  console.log(`DeskGame server listening on port ${PORT}`);
});
