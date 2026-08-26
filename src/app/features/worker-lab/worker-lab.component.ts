import { Component, signal, OnInit, signal as _signal, DestroyRef, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { WorkerFacade } from '@core/services/worker-facade.service';
import type { ProcessingProgress } from '@core/interfaces/csv';

type SabStatus = 'idle' | 'running' | 'done' | 'unsupported';

@Component({
  selector: 'dw-worker-lab',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './worker-lab.component.html',
  styleUrls: ['./worker-lab.component.css'],
})
export class WorkerLabComponent implements OnInit {
  readonly iterations = signal<number>(8_000_000);
  readonly counter = signal<number>(0);
  readonly mainResult = signal<number | null>(null);
  readonly workerResult = signal<number | null>(null);
  readonly mainBusy = signal<boolean>(false);
  readonly workerBusy = signal<boolean>(false);
  readonly mainTime = signal<number | null>(null);
  readonly workerTime = signal<number | null>(null);
  readonly mainProgress = signal<number>(0);
  readonly workerProgress = signal<number>(0);

  readonly sabSupported = signal<boolean>(false);
  readonly sabStatus = signal<SabStatus>('idle');
  readonly sabMainValue = signal<number>(0);
  readonly sabWorkerValue = signal<number>(0);
  private sabBuffer: SharedArrayBuffer | null = null;
  private sabView: Uint32Array | null = null;
  private sabIntervalId: number | null = null;
  private readonly destroyRef = inject(DestroyRef);

  constructor(readonly facade: WorkerFacade) {}

  ngOnInit(): void {
    const supported = typeof SharedArrayBuffer !== 'undefined' && typeof Atomics !== 'undefined';
    this.sabSupported.set(supported);
    if (supported) {
      try {
        this.sabBuffer = new SharedArrayBuffer(4 * 2);
        this.sabView = new Uint32Array(this.sabBuffer);
        Atomics.store(this.sabView, 0, 0);
        Atomics.store(this.sabView, 1, 0);
      } catch {
        this.sabSupported.set(false);
      }
    }
    this.destroyRef.onDestroy(() => this.stopSabPolling());
  }

  incrementCounter(): void {
    this.counter.update((v) => v + 1);
  }

  runMainThread(): void {
    if (this.mainBusy()) return;
    this.mainBusy.set(true);
    this.mainResult.set(null);
    this.mainTime.set(null);
    this.mainProgress.set(0);
    const start = performance.now();
    const n = this.iterations();
    let sum = 0;
    const reportEvery = Math.max(1, Math.floor(n / 10));
    for (let i = 0; i < n; i++) {
      sum += Math.sqrt(i) * Math.sin(i);
      if (i % reportEvery === 0) {
        this.mainProgress.set(Math.round((i / n) * 100));
      }
    }
    this.mainProgress.set(100);
    this.mainResult.set(sum);
    this.mainTime.set(performance.now() - start);
    this.mainBusy.set(false);
  }

  async runWithWorker(): Promise<void> {
    if (this.workerBusy()) return;
    this.workerBusy.set(true);
    this.workerResult.set(null);
    this.workerTime.set(null);
    this.workerProgress.set(0);
    const start = performance.now();
    try {
      await this.facade.ensureInitialized();
      const onProgress = (p: ProcessingProgress) => this.workerProgress.set(p.percent);
      const result = await this.facade.webWorker.heavyCalc(this.iterations(), onProgress);
      this.workerProgress.set(100);
      this.workerResult.set(result);
      this.workerTime.set(performance.now() - start);
    } catch (err) {
      console.error(err);
    } finally {
      this.workerBusy.set(false);
    }
  }

  reset(): void {
    this.mainResult.set(null);
    this.workerResult.set(null);
    this.mainTime.set(null);
    this.workerTime.set(null);
    this.mainProgress.set(0);
    this.workerProgress.set(0);
  }

  async startSabDemo(): Promise<void> {
    if (!this.sabSupported() || !this.sabView || !this.sabBuffer || this.sabStatus() === 'running') return;
    this.sabStatus.set('running');
    Atomics.store(this.sabView, 0, 0);
    Atomics.store(this.sabView, 1, 0);
    this.sabMainValue.set(0);
    this.sabWorkerValue.set(0);

    this.sabIntervalId = window.setInterval(() => {
      if (!this.sabView) return;
      this.sabMainValue.set(Atomics.load(this.sabView, 0));
      this.sabWorkerValue.set(Atomics.load(this.sabView, 1));
      if (Atomics.load(this.sabView, 1) >= 1_000_000) {
        this.stopSabPolling();
        this.sabStatus.set('done');
      }
    }, 80);

    try {
      await this.facade.ensureInitialized();
      await this.facade.webWorker.sabIncrement(this.sabBuffer, 1, 1_000_000);
    } catch (err) {
      console.error(err);
      this.stopSabPolling();
      this.sabStatus.set('idle');
    }

    (async () => {
      const view = this.sabView;
      if (!view) return;
      for (let i = 0; i < 1_000_000; i++) {
        Atomics.add(view, 0, 1);
      }
    })();
  }

  resetSabDemo(): void {
    this.stopSabPolling();
    if (this.sabView) {
      Atomics.store(this.sabView, 0, 0);
      Atomics.store(this.sabView, 1, 0);
    }
    this.sabMainValue.set(0);
    this.sabWorkerValue.set(0);
    this.sabStatus.set('idle');
  }

  private stopSabPolling(): void {
    if (this.sabIntervalId !== null) {
      clearInterval(this.sabIntervalId);
      this.sabIntervalId = null;
    }
  }
}
