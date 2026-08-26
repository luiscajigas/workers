import { Injectable, Signal, signal } from '@angular/core';
import type { WorkerStatus, WorkerRequest, WorkerResponse } from '@core/interfaces/worker-messages';
import type {
  CsvStatistics,
  CsvSearchResult,
  ProcessingProgress,
} from '@core/interfaces/csv';

type CsvRow = Record<string, string>;

interface ParsedCsv {
  columns: string[];
  numericColumns: string[];
  rows: CsvRow[];
}

interface PendingRequest {
  resolve: (value: unknown) => void;
  reject: (reason: unknown) => void;
  progressCallback?: (p: ProcessingProgress) => void;
}

@Injectable({ providedIn: 'root' })
export class WebWorkerService {
  private worker: Worker | null = null;
  private readonly pending = new Map<string, PendingRequest>();

  private readonly _status = signal<WorkerStatus>('idle');
  readonly status: Signal<WorkerStatus> = this._status.asReadonly();

  async initialize(): Promise<void> {
    if (this.worker) return;
    if (typeof Worker === 'undefined') {
      this._status.set('error');
      throw new Error('Web Workers no soportados');
    }
    this._status.set('connecting');
    try {
      this.worker = new Worker(new URL('../../workers/csv.worker.ts', import.meta.url), {
        type: 'module',
      });
      this.worker.onmessage = (event: MessageEvent) => this.handleMessage(event);
      this.worker.onerror = (e) => {
        console.error('[WebWorker] Error:', e);
        this._status.set('error');
      };
      await this.ping();
      this._status.set('active');
    } catch (err) {
      this._status.set('error');
      throw err;
    }
  }

  terminate(): void {
    if (this.worker) {
      this.worker.terminate();
      this.worker = null;
    }
    this.pending.clear();
    this._status.set('terminated');
  }

  ping(): Promise<'PONG'> {
    return this.sendRequest<'PING', never, 'PONG'>('PING', undefined as never);
  }

  heavyCalc(
    iterations: number,
    onProgress?: (p: ProcessingProgress) => void
  ): Promise<number> {
    return this.sendRequest<'HEAVY_CALC', { iterations: number }, number>(
      'HEAVY_CALC',
      { iterations },
      onProgress
    );
  }

  parseCsv(
    text: string,
    delimiter = ',',
    onProgress?: (p: ProcessingProgress) => void
  ): Promise<ParsedCsv> {
    return this.sendRequest<'PARSE_CSV', { text: string; delimiter: string }, ParsedCsv>(
      'PARSE_CSV',
      { text, delimiter },
      onProgress
    );
  }

  computeStats(
    rows: CsvRow[],
    column: string,
    onProgress?: (p: ProcessingProgress) => void
  ): Promise<CsvStatistics> {
    return this.sendRequest<
      'COMPUTE_STATS',
      { rows: CsvRow[]; column: string },
      CsvStatistics
    >('COMPUTE_STATS', { rows, column }, onProgress);
  }

  searchRows(
    rows: CsvRow[],
    query: string,
    column?: string
  ): Promise<CsvSearchResult<CsvRow>> {
    return this.sendRequest<
      'SEARCH_ROWS',
      { rows: CsvRow[]; query: string; column?: string },
      CsvSearchResult<CsvRow>
    >('SEARCH_ROWS', { rows, query, column });
  }

  sortRows(
    rows: CsvRow[],
    column: string,
    direction: 'asc' | 'desc' = 'asc'
  ): Promise<CsvRow[]> {
    return this.sendRequest<
      'SORT_ROWS',
      { rows: CsvRow[]; column: string; direction: 'asc' | 'desc' },
      CsvRow[]
    >('SORT_ROWS', { rows, column, direction });
  }

  sabIncrement(
    buffer: SharedArrayBuffer,
    index: number,
    count: number
  ): Promise<void> {
    return this.sendRequest<
      'SAB_INCREMENT',
      { buffer: SharedArrayBuffer; index: number; count: number },
      void
    >('SAB_INCREMENT', { buffer, index, count });
  }

  private sendRequest<TType extends string, TPayload, TResult>(
    type: TType,
    payload: TPayload,
    onProgress?: (p: ProcessingProgress) => void
  ): Promise<TResult> {
    if (!this.worker) {
      return Promise.reject(new Error('Worker no inicializado'));
    }
    const id = `${type}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    return new Promise<TResult>((resolve, reject) => {
      this.pending.set(id, {
        resolve: resolve as (v: unknown) => void,
        reject,
        progressCallback: onProgress,
      });
      const request: WorkerRequest<TPayload> = { type, id, payload };
      this.worker!.postMessage(request);
    });
  }

  private handleMessage(event: MessageEvent): void {
    const data = event.data as WorkerResponse<unknown> | { type: 'PROGRESS'; id: string; payload: ProcessingProgress };
    if (!data || !data.id) return;

    if (data.type === 'PROGRESS') {
      const pending = this.pending.get(data.id);
      pending?.progressCallback?.(data.payload as ProcessingProgress);
      return;
    }

    const pending = this.pending.get(data.id);
    if (!pending) return;
    this.pending.delete(data.id);

    if (data.type === 'ERROR') {
      pending.reject(new Error((data as WorkerResponse).error ?? 'Error desconocido'));
    } else {
      pending.resolve((data as WorkerResponse).payload);
    }
  }
}
