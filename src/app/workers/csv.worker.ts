/// <reference lib="webworker" />

interface RequestMessage<T = unknown> {
  type: string;
  id: string;
  payload: T;
}

interface ResponseMessage<T = unknown> {
  type: string;
  id: string;
  payload?: T;
  error?: string;
}

interface ProgressMessage {
  type: 'PROGRESS';
  id: string;
  payload: {
    percent: number;
    stage: string;
    currentRow: number;
    totalRows: number;
  };
}

interface HeavyCalcPayload {
  iterations: number;
}

interface ParseCsvPayload {
  text: string;
  delimiter?: string;
}

interface StatsPayload {
  rows: Record<string, string>[];
  column: string;
}

interface SearchPayload {
  rows: Record<string, string>[];
  query: string;
  column?: string;
}

interface SortPayload {
  rows: Record<string, string>[];
  column: string;
  direction?: 'asc' | 'desc';
}

interface SabIncrementPayload {
  buffer: SharedArrayBuffer;
  index: number;
  count: number;
}

type CsvRow = Record<string, string>;

const ctx: Worker = self as unknown as Worker;

ctx.addEventListener('message', async (event: MessageEvent<RequestMessage>) => {
  const { type, id, payload } = event.data;
  try {
    switch (type) {
      case 'PING':
        respond({ type: 'PONG', id });
        break;

      case 'HEAVY_CALC': {
        const { iterations } = payload as HeavyCalcPayload;
        const result = heavyCalc(iterations, (p) => sendProgress(id, p, 'Cálculo', iterations));
        respond({ type: 'HEAVY_CALC_RESULT', id, payload: result });
        break;
      }

      case 'PARSE_CSV': {
        const { text, delimiter } = payload as ParseCsvPayload;
        const parsed = parseCsv(text, delimiter ?? ',', (p, stage, cur, total) =>
          sendProgress(id, p, stage, cur, total)
        );
        respond({ type: 'PARSE_CSV_RESULT', id, payload: parsed });
        break;
      }

      case 'COMPUTE_STATS': {
        const { rows, column } = payload as StatsPayload;
        const stats = computeStats(rows, column, (p) => sendProgress(id, p, 'Estadísticas', rows.length));
        respond({ type: 'COMPUTE_STATS_RESULT', id, payload: stats });
        break;
      }

      case 'SEARCH_ROWS': {
        const { rows, query, column } = payload as SearchPayload;
        const matches = searchRows(rows, query, column ?? undefined);
        respond({ type: 'SEARCH_ROWS_RESULT', id, payload: { matches, query, column } });
        break;
      }

      case 'SORT_ROWS': {
        const { rows, column, direction } = payload as SortPayload;
        const sorted = sortRows(rows, column, direction ?? 'asc');
        respond({ type: 'SORT_ROWS_RESULT', id, payload: sorted });
        break;
      }

      case 'SAB_INCREMENT': {
        const { buffer, index, count } = payload as SabIncrementPayload;
        const view = new Uint32Array(buffer);
        for (let i = 0; i < count; i++) {
          Atomics.add(view, index, 1);
        }
        respond({ type: 'SAB_INCREMENT_RESULT', id, payload: undefined });
        break;
      }

      default:
        respond({ type: 'ERROR', id, error: `Tipo desconocido: ${type}` });
    }
  } catch (err) {
    respond({
      type: 'ERROR',
      id,
      error: err instanceof Error ? err.message : String(err),
    });
  }
});

function respond<T>(msg: ResponseMessage<T>): void {
  ctx.postMessage(msg);
}

function sendProgress(
  id: string,
  percent: number,
  stage: string,
  totalRows: number,
  currentRow?: number
): void {
  const progress: ProgressMessage = {
    type: 'PROGRESS',
    id,
    payload: {
      percent: Math.min(100, Math.max(0, Math.round(percent))),
      stage,
      currentRow: currentRow ?? Math.round((percent / 100) * totalRows),
      totalRows,
    },
  };
  ctx.postMessage(progress);
}

function heavyCalc(iterations: number, onProgress: (percent: number) => void): number {
  let sum = 0;
  const reportEvery = Math.max(1, Math.floor(iterations / 20));
  for (let i = 0; i < iterations; i++) {
    sum += Math.sqrt(i) * Math.sin(i);
    if (i % reportEvery === 0) onProgress((i / iterations) * 100);
  }
  onProgress(100);
  return sum;
}

function parseCsv(
  text: string,
  delimiter: string,
  onProgress: (percent: number, stage: string, current: number, total: number) => void
): { columns: string[]; numericColumns: string[]; rows: CsvRow[] } {
  const lines = text.split(/\r?\n/).filter((l) => l.trim().length > 0);
  if (lines.length === 0) return { columns: [], numericColumns: [], rows: [] };

  const header = splitLine(lines[0], delimiter);
  const total = lines.length - 1;
  onProgress(5, 'Leyendo encabezado', 0, total);

  const rows: CsvRow[] = [];
  const numericFlags = header.map(() => true);

  const reportEvery = Math.max(1, Math.floor(total / 20));
  for (let i = 1; i < lines.length; i++) {
    const cells = splitLine(lines[i], delimiter);
    const row: CsvRow = {};
    for (let j = 0; j < header.length; j++) {
      const value = cells[j] ?? '';
      row[header[j]] = value;
      if (numericFlags[j] && value !== '' && !isNumeric(value)) numericFlags[j] = false;
    }
    rows.push(row);
    if (i % reportEvery === 0) onProgress(5 + ((i - 1) / total) * 90, 'Parseando filas', i - 1, total);
  }

  const numericColumns = header.filter((_, idx) => numericFlags[idx]);
  onProgress(100, 'Parseo completado', total, total);
  return { columns: header, numericColumns, rows };
}

function splitLine(line: string, delimiter: string): string[] {
  const result: string[] = [];
  let current = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQuotes) {
      if (ch === '"') {
        if (line[i + 1] === '"') { current += '"'; i++; }
        else inQuotes = false;
      } else {
        current += ch;
      }
    } else {
      if (ch === '"') inQuotes = true;
      else if (ch === delimiter) { result.push(current); current = ''; }
      else current += ch;
    }
  }
  result.push(current);
  return result;
}

function isNumeric(value: string): boolean {
  return value !== '' && !Number.isNaN(Number(value.replace(',', '.')));
}

function toNumber(value: string): number {
  return Number(value.replace(',', '.'));
}

function computeStats(
  rows: CsvRow[],
  column: string,
  onProgress: (percent: number) => void
): {
  totalRows: number;
  numericColumn: string;
  average: number | null;
  minimum: number | null;
  maximum: number | null;
  sum: number | null;
} {
  const values: number[] = [];
  const reportEvery = Math.max(1, Math.floor(rows.length / 20));
  for (let i = 0; i < rows.length; i++) {
    const raw = rows[i][column];
    if (raw !== undefined && raw !== '' && isNumeric(raw)) values.push(toNumber(raw));
    if (i % reportEvery === 0) onProgress((i / Math.max(1, rows.length)) * 100);
  }
  onProgress(100);
  if (values.length === 0) {
    return { totalRows: rows.length, numericColumn: column, average: null, minimum: null, maximum: null, sum: null };
  }
  let min = values[0];
  let max = values[0];
  let sum = 0;
  for (const v of values) {
    if (v < min) min = v;
    if (v > max) max = v;
    sum += v;
  }
  return {
    totalRows: rows.length,
    numericColumn: column,
    average: sum / values.length,
    minimum: min,
    maximum: max,
    sum,
  };
}

function searchRows(rows: CsvRow[], query: string, column?: string): CsvRow[] {
  const q = query.toLowerCase();
  const matches: CsvRow[] = [];
  const cols = column ? [column] : Object.keys(rows[0] ?? {});
  for (const row of rows) {
    for (const c of cols) {
      if (String(row[c] ?? '').toLowerCase().includes(q)) {
        matches.push(row);
        break;
      }
    }
  }
  return matches;
}

function sortRows(rows: CsvRow[], column: string, direction: 'asc' | 'desc'): CsvRow[] {
  const sorted = [...rows].sort((a, b) => {
    const av = a[column] ?? '';
    const bv = b[column] ?? '';
    const an = isNumeric(av) ? toNumber(av) : NaN;
    const bn = isNumeric(bv) ? toNumber(bv) : NaN;
    let cmp: number;
    if (!Number.isNaN(an) && !Number.isNaN(bn)) cmp = an - bn;
    else cmp = String(av).localeCompare(String(bv));
    return direction === 'asc' ? cmp : -cmp;
  });
  return sorted;
}
