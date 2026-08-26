import { Component, computed, Signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { WorkerFacade } from '@core/services/worker-facade.service';
import type { WorkerState, WorkerStatus } from '@core/interfaces/worker-messages';
import type { SharedProcessingState } from '@core/interfaces/csv';

type StatusDot = 'green' | 'yellow' | 'red' | 'gray';

@Component({
  selector: 'dw-worker-status',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './worker-status.component.html',
  styleUrls: ['./worker-status.component.css'],
})
export class WorkerStatusComponent {
  constructor(readonly facade: WorkerFacade) {}

  readonly state: Signal<WorkerState> = computed(() => this.facade.getFullState());
  readonly tabs: Signal<number> = computed(() => this.facade.sharedWorker.tabsConnected());
  readonly shared = this.facade.sharedState();

  dotFor(status: WorkerStatus | WorkerState['serviceWorker'] | boolean): StatusDot {
    if (typeof status === 'boolean') return status ? 'green' : 'red';
    if (status === 'active' || status === 'registered') return 'green';
    if (status === 'connecting' || status === 'registering') return 'yellow';
    if (status === 'error' || status === 'redundant') return 'red';
    return 'gray';
  }

  labelFor(status: WorkerStatus | WorkerState['serviceWorker']): string {
    if (status === 'registered') return 'Registrado';
    if (status === 'unregistered') return 'No registrado';
    if (status === 'registering') return 'Registrando…';
    if (status === 'redundant') return 'Redundante';
    return this.facade.statusLabel(status as WorkerStatus);
  }
}
