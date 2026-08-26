import { Injectable, Signal, signal } from '@angular/core';
import type { WorkerStatus } from '@core/interfaces/worker-messages';
import type { SharedProcessingState } from '@core/interfaces/csv';

@Injectable({ providedIn: 'root' })
export class SharedWorkerService {
  private worker: SharedWorker | null = null;
  private readonly _status = signal<WorkerStatus>('idle');
  private readonly _tabsConnected = signal<number>(1);
  private readonly _sharedState = signal<SharedProcessingState>({
    fileName: null,
    rowsCount: 0,
    progress: 0,
    status: 'idle',
    lastUpdate: 0,
  });

  readonly status: Signal<WorkerStatus> = this._status.asReadonly();
  readonly tabsConnected: Signal<number> = this._tabsConnected.asReadonly();
  readonly sharedState: Signal<SharedProcessingState> = this._sharedState.asReadonly();

  connect(): void {
    if (typeof SharedWorker === 'undefined') {
      this._status.set('error');
      return;
    }
    if (this.worker) return;
    try {
      this._status.set('connecting');
      this.worker = new SharedWorker(new URL('../../workers/shared.worker.ts', import.meta.url), {
        name: 'dataworker-shared',
      });
      this.worker.port.start();
      this.worker.port.onmessage = (event: MessageEvent) => this.handleMessage(event);
      this.worker.port.postMessage({ type: 'PING' });
      this._status.set('active');
    } catch {
      this._status.set('error');
    }
  }

  broadcastState(state: SharedProcessingState): void {
    if (!this.worker) return;
    this.worker.port.postMessage({ type: 'STATE_UPDATE', payload: state });
  }

  disconnect(): void {
    if (this.worker) {
      this.worker.port.close();
      this.worker = null;
    }
    this._status.set('terminated');
  }

  private handleMessage(event: MessageEvent): void {
    const data = event.data as { type: string; payload?: unknown };
    switch (data.type) {
      case 'PONG':
        this._status.set('active');
        break;
      case 'TAB_COUNT':
        if (typeof data.payload === 'number') this._tabsConnected.set(data.payload);
        break;
      case 'STATE_SYNC':
        if (data.payload) this._sharedState.set(data.payload as SharedProcessingState);
        break;
    }
  }
}
