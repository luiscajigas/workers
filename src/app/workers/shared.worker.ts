/// <reference lib="webworker" />

declare const self: SharedWorkerGlobalScope;

type IncomingMessage = { type: string; payload?: unknown };

const ports: MessagePort[] = [];
let sharedState = {
  fileName: null as string | null,
  rowsCount: 0,
  progress: 0,
  status: 'idle',
  lastUpdate: Date.now(),
};

self.addEventListener('connect', (event: MessageEvent) => {
  const port = event.ports[0];
  if (!port) return;
  ports.push(port);
  port.start();

  port.postMessage({ type: 'TAB_COUNT', payload: ports.length });
  broadcast({ type: 'TAB_COUNT', payload: ports.length });
  port.postMessage({ type: 'STATE_SYNC', payload: sharedState });

  port.addEventListener('message', (ev: MessageEvent<IncomingMessage>) => {
    const data = ev.data;
    switch (data.type) {
      case 'PING':
        port.postMessage({ type: 'PONG' });
        break;
      case 'STATE_UPDATE': {
        if (data.payload) {
          sharedState = { ...(data.payload as typeof sharedState), lastUpdate: Date.now() };
          broadcast({ type: 'STATE_SYNC', payload: sharedState });
        }
        break;
      }
    }
  });

  port.addEventListener('close', () => {
    const idx = ports.indexOf(port);
    if (idx !== -1) ports.splice(idx, 1);
    broadcast({ type: 'TAB_COUNT', payload: ports.length });
  });
});

function broadcast(message: unknown): void {
  for (const p of ports) {
    try {
      p.postMessage(message);
    } catch {
      // Ignore errors on closed ports
    }
  }
}
