// API 응답 속도를 측정하고 그에 맞춰 Polling 간격을 조절하는 작은 외부 스토어.
export const MIN_INTERVAL_MS = 5000;
export const MAX_INTERVAL_MS = 60000;
export const RT_FACTOR = 20; // 간격 = 평균 응답시간 × 20 (API 점유율 5% 이하)
const EWMA_ALPHA = 0.3;

const clamp = (v) => Math.min(MAX_INTERVAL_MS, Math.max(MIN_INTERVAL_MS, Math.round(v / 100) * 100));

let state = {
  lastMs: null,
  avgMs: null,
  intervalMs: MIN_INTERVAL_MS,
  errors: 0,
  lastError: null,
  history: [],
};
const listeners = new Set();

function update(patch, entry) {
  state = { ...state, ...patch, history: [entry, ...state.history].slice(0, 8) };
  listeners.forEach((l) => l());
}

export const pollingStore = {
  subscribe(listener) {
    listeners.add(listener);
    return () => listeners.delete(listener);
  },
  getSnapshot: () => state,
};

export function recordSuccess(ms) {
  const avgMs = state.avgMs == null ? ms : EWMA_ALPHA * ms + (1 - EWMA_ALPHA) * state.avgMs;
  const intervalMs = clamp(avgMs * RT_FACTOR);
  update({ lastMs: ms, avgMs, intervalMs, errors: 0, lastError: null }, { at: Date.now(), ms, intervalMs, ok: true });
}

// 실패 시에는 간격을 두 배로 늘려(지수 백오프) API 부하를 줄인다.
export function recordFailure(ms, error) {
  const intervalMs = clamp(state.intervalMs * 2);
  update(
    { lastMs: ms, intervalMs, errors: state.errors + 1, lastError: error.message },
    { at: Date.now(), ms, intervalMs, ok: false, error: error.message },
  );
}
