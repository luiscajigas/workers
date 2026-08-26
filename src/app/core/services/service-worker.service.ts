import { Injectable, signal } from '@angular/core';
import type { WorkerState } from '@core/interfaces/worker-messages';

@Injectable({ providedIn: 'root' })
export class ServiceWorkerService {
  readonly registrationStatus = signal<
    'unregistered' | 'registering' | 'registered' | 'redundant' | 'error'
  >('unregistered');

  register(): void {
    if (!('serviceWorker' in navigator)) {
      this.registrationStatus.set('error');
      return;
    }
    this.registrationStatus.set('registering');
    const swPath = '/sw.js';
    navigator.serviceWorker
      .register(swPath)
      .then((registration) => {
        this.registrationStatus.set('registered');
        registration.addEventListener('updatefound', () => {});
      })
      .catch(() => {
        this.registrationStatus.set('error');
      });
  }

  getState(): WorkerState['serviceWorker'] {
    return this.registrationStatus();
  }
}
