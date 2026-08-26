import { Component, Signal, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { WorkerFacade } from '@core/services/worker-facade.service';
import { FileService } from '@core/services/file.service';
import type {
  CsvFileInfo,
  CsvStatistics,
  ProcessingProgress,
  CsvSearchResult,
  SharedProcessingState,
  ProcessingStatus,
} from '@core/interfaces/csv';

type CsvRow = Record<string, string>;

@Component({
  selector: 'dw-dashboard',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './dashboard.component.html',
  styleUrls: ['./dashboard.component.css'],
})
export class DashboardComponent {
  readonly selectedFile = signal<CsvFileInfo | null>(null);
  readonly rawFile = signal<File | null>(null);
  readonly csvText = signal<string>('');
  readonly rows = signal<CsvRow[]>([]);
  readonly progress = signal<ProcessingProgress | null>(null);
  readonly statistics = signal<CsvStatistics | null>(null);
  readonly searchQuery = signal('');
  readonly searchColumn = signal<string>('');
  readonly searchResults = signal<CsvSearchResult<CsvRow> | null>(null);
  readonly processing = signal<ProcessingStatus>('idle');
  readonly selectedNumericColumn = signal<string>('');
  readonly searchBusy = signal(false);

  readonly canProcess: Signal<boolean> = computed(
    () => !!this.rawFile() && this.processing() !== 'processing' && this.processing() !== 'parsing'
  );
  readonly columnsDisplay: Signal<string[]> = computed(() => this.selectedFile()?.columns ?? []);
  readonly numericOptions: Signal<string[]> = computed(() => this.selectedFile()?.numericColumns ?? []);
  readonly previewRows: Signal<CsvRow[]> = computed(() => this.rows().slice(0, 10));
  readonly resultColumns: Signal<string[]> = computed(() =>
    (this.searchResults()?.matches[0] ? Object.keys(this.searchResults()!.matches[0]) : this.columnsDisplay()).slice(0, 6)
  );

  constructor(
    readonly facade: WorkerFacade,
    readonly fileService: FileService
  ) {}

  async onFileSelected(event: Event): Promise<void> {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;

    this.rawFile.set(file);
    this.progress.set(null);
    this.statistics.set(null);
    this.searchResults.set(null);
    this.selectedNumericColumn.set('');
    this.processing.set('idle');

    await this.facade.ensureInitialized();
    try {
      this.processing.set('parsing');
      const text = await this.fileService.readFileAsText(file);
      this.csvText.set(text);

      const parsed = await this.facade.webWorker.parseCsv(text, ',', (p) => this.progress.set(p));
      this.rows.set(parsed.rows);
      const firstNumeric = parsed.numericColumns[0] ?? '';

      this.selectedFile.set({
        name: file.name,
        size: file.size,
        rowsCount: parsed.rows.length,
        columns: parsed.columns,
        numericColumns: parsed.numericColumns,
      });
      this.selectedNumericColumn.set(firstNumeric);
      this.searchColumn.set(firstNumeric || parsed.columns[0] || '');
      this.processing.set('idle');
      this.broadcastSharedState();
    } catch (err) {
      console.error(err);
      this.processing.set('error');
    }
  }

  async onProcess(): Promise<void> {
    if (!this.canProcess() || this.rows().length === 0) return;
    const column = this.selectedNumericColumn();
    if (!column) return;

    await this.facade.ensureInitialized();
    this.processing.set('processing');
    this.statistics.set(null);
    try {
      const stats = await this.facade.webWorker.computeStats(this.rows(), column, (p) => this.progress.set(p));
      this.statistics.set(stats);
      this.processing.set('completed');
      this.broadcastSharedState();
    } catch {
      this.processing.set('error');
    }
  }

  async onSearch(): Promise<void> {
    const q = this.searchQuery().trim();
    if (!q || this.rows().length === 0) return;
    this.searchBusy.set(true);
    this.searchResults.set(null);
    try {
      await this.facade.ensureInitialized();
      const result = await this.facade.webWorker.searchRows(
        this.rows(),
        q,
        this.searchColumn() || undefined
      );
      this.searchResults.set({
        matches: result.matches.slice(0, 100),
        totalFound: result.totalFound ?? result.matches.length,
        query: q,
        column: result.column,
      });
    } finally {
      this.searchBusy.set(false);
    }
  }

  onNumericColumnChange(): void {
    // Re-compute stats on change if already processed
    if (this.statistics()) {
      this.statistics.set(null);
      void this.onProcess();
    }
  }

  private broadcastSharedState(): void {
    const sf = this.selectedFile();
    const pr = this.progress();
    const state: SharedProcessingState = {
      fileName: sf?.name ?? null,
      rowsCount: sf?.rowsCount ?? 0,
      progress: pr?.percent ?? 0,
      status: this.processing(),
      lastUpdate: Date.now(),
    };
    this.facade.broadcastSharedState(state);
  }

  formatNumber(n: number | null | undefined): string {
    if (n === null || n === undefined) return '—';
    return Number.isInteger(n) ? n.toLocaleString('es-ES') : n.toFixed(3);
  }

  trackByIndex(index: number): number {
    return index;
  }

  trackByValue(_index: number, value: string): string {
    return value;
  }
}
