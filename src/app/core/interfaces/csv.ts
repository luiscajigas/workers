export interface CsvFileInfo {
  name: string;
  size: number;
  rowsCount: number;
  columns: string[];
  numericColumns: string[];
}

export interface CsvStatistics {
  totalRows: number;
  numericColumn: string;
  average: number | null;
  minimum: number | null;
  maximum: number | null;
  sum: number | null;
}

export interface CsvSearchResult<T = Record<string, string>> {
  matches: T[];
  totalFound: number;
  query: string;
  column?: string;
}

export interface ProcessingProgress {
  percent: number;
  stage: string;
  currentRow: number;
  totalRows: number;
}

export type ProcessingStatus = 'idle' | 'parsing' | 'processing' | 'completed' | 'error';

export interface SharedProcessingState {
  fileName: string | null;
  rowsCount: number;
  progress: number;
  status: ProcessingStatus;
  lastUpdate: number;
}
