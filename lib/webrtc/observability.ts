export type TransferMetricName =
  | 'create_request'
  | 'create_success'
  | 'create_failure'
  | 'join_request'
  | 'join_success'
  | 'join_failure'
  | 'signaling_delivery_success'
  | 'signaling_delivery_failure';

export type TransferMetricSnapshot = {
  createRequestCount: number;
  createSuccessCount: number;
  createFailureCount: number;
  joinRequestCount: number;
  joinSuccessCount: number;
  joinFailureCount: number;
  signalingDeliverySuccessCount: number;
  signalingDeliveryFailureCount: number;
  generatedAt: string;
};

type InternalStore = Omit<TransferMetricSnapshot, 'generatedAt'>;

const globalState = globalThis as typeof globalThis & {
  __webrtcMetricsStore?: InternalStore;
};

const metricsStore: InternalStore =
  globalState.__webrtcMetricsStore ??
  (() => {
    const initial: InternalStore = {
      createRequestCount: 0,
      createSuccessCount: 0,
      createFailureCount: 0,
      joinRequestCount: 0,
      joinSuccessCount: 0,
      joinFailureCount: 0,
      signalingDeliverySuccessCount: 0,
      signalingDeliveryFailureCount: 0,
    };
    globalState.__webrtcMetricsStore = initial;
    return initial;
  })();

function shouldLogEvents() {
  return process.env.WEBRTC_LOG_EVENTS === '1';
}

function mapMetricName(metric: TransferMetricName): keyof InternalStore {
  if (metric === 'create_request') return 'createRequestCount';
  if (metric === 'create_success') return 'createSuccessCount';
  if (metric === 'create_failure') return 'createFailureCount';
  if (metric === 'join_request') return 'joinRequestCount';
  if (metric === 'join_success') return 'joinSuccessCount';
  if (metric === 'join_failure') return 'joinFailureCount';
  if (metric === 'signaling_delivery_success') return 'signalingDeliverySuccessCount';
  return 'signalingDeliveryFailureCount';
}

export function recordTransferMetric(metric: TransferMetricName, details?: Record<string, unknown>) {
  const key = mapMetricName(metric);
  metricsStore[key] += 1;

  if (shouldLogEvents()) {
    const suffix = details ? ` ${JSON.stringify(details)}` : '';
    console.log(`[webrtc-metrics] ${metric}${suffix}`);
  }
}

export function getTransferMetricSnapshot(): TransferMetricSnapshot {
  return {
    ...metricsStore,
    generatedAt: new Date().toISOString(),
  };
}
