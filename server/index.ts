import { createApp } from './app.js';

const { app, cache, close } = createApp();
const port = 3001;
// Yerel prototip varsayılan olarak yalnızca loopback'te dinler.
const server = app.listen(port, '127.0.0.1', () => {
  console.log('Backend server running on http://127.0.0.1:' + port);
  console.log('[L1 Cache] in-memory, ttlMs=' + cache.ttlMs + ', maxEntries=' + cache.maxEntries);
});
for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.once(signal, () => { close(); server.close(); });
}
