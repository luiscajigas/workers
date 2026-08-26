import { Injectable, Signal, signal } from '@angular/core';
import { WebWorkerService } from './web-worker.service';
import { SharedWorkerService } from './shared-worker.service';
import { ServiceWorkerService } from './service-worker.service';
import type { WorkerState, WorkerStatus } from '@core/interfaces/worker-messages';
import type { SharedProcessingState } from '@core/interfaces/csv';

@Injectable({ providedIn: 'root' })
export class WorkerFacade {
  private readonly _initialized = signal<boolean>(false);
  readonly initialized: Signal<boolean> = this._initialized.asReadonly();

  constructor(
    readonly webWorker: WebWorkerService,
    readonly sharedWorker: SharedWorkerService,
    readonly serviceWorker: ServiceWorkerService
  ) {}

  async ensureInitialized(): Promise<void> {
    if (this._initialized()) return;
    try {
      await this.webWorker.initialize();
      this._initialized.set(true);
    } catch (err) {
      console.error('[Facade] Fallo inicializando workers:', err);
    }
  }

  getFullState(): WorkerState {
    return {
      webWorker: this.webWorker.status(),
      sharedWorker: this.sharedWorker.status(),
      serviceWorker: this.serviceWorker.registrationStatus(),
      online: navigator.onLine,
      tabsConnected: this.sharedWorker.tabsConnected(),
    };
  }

  sharedState(): Signal<SharedProcessingState> {
    return this.sharedWorker.sharedState;
  }

  broadcastSharedState(state: SharedProcessingState): void {
    this.sharedWorker.broadcastState(state);
  }

  statusLabel(status: WorkerStatus): string {
    switch (status) {
      case 'active': return 'Activo';
      case 'connecting': return 'Conectando';
      case 'error': return 'Error';
      case 'terminated': return 'Terminado';
      default: return 'Inactivo';
    }
  }
}
