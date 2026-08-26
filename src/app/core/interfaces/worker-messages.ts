export interface WorkerRequest<T = unknown> {
  type: string;
  id: string;
  payload: T;
}

export interface WorkerResponse<T = unknown> {
  type: string;
  id: string;
  payload: T;
  error?: string;
}

export type WorkerStatus = 'idle' | 'connecting' | 'active' | 'error' | 'terminated';

export interface WorkerState {
  webWorker: WorkerStatus;
  sharedWorker: WorkerStatus;
  serviceWorker: 'unregistered' | 'registering' | 'registered' | 'redundant' | 'error';
  online: boolean;
  tabsConnected: number;
}
