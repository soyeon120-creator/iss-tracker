import { deleteOlderThan, getPositionsSince, savePosition } from './db.js';
import { recordFailure, recordSuccess } from './polling.js';
import { WINDOW_MS } from './track.js';

const API_URL = 'http://api.open-notify.org/iss-now.json';
const TIMEOUT_MS = 10000;

/** ISS 현재 위치를 받아 응답 속도를 기록하고 IndexedDB에 저장한다. */
export async function fetchIssPosition({ signal }) {
  const t0 = performance.now();
  try {
    const res = await fetch(API_URL, {
      cache: 'no-store',
      signal: AbortSignal.any([signal, AbortSignal.timeout(TIMEOUT_MS)]),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const json = await res.json();
    if (json.message !== 'success') throw new Error('API 응답 오류');
    recordSuccess(performance.now() - t0);

    const position = {
      ts: json.timestamp * 1000,
      lat: parseFloat(json.iss_position.latitude),
      lon: parseFloat(json.iss_position.longitude),
    };
    await savePosition(position);
    return position;
  } catch (error) {
    if (!signal.aborted) recordFailure(performance.now() - t0, error);
    throw error;
  }
}

/** 4시간이 지난 좌표를 삭제한 뒤 남은 궤적 좌표를 읽는다. */
export async function loadStoredTrack() {
  const cutoff = Date.now() - WINDOW_MS;
  await deleteOlderThan(cutoff);
  return getPositionsSince(cutoff);
}
