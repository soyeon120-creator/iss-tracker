import { useEffect, useMemo, useState, useSyncExternalStore } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import IssMap from './components/IssMap.jsx';
import { fetchIssPosition, loadStoredTrack } from './lib/api.js';
import { MAX_INTERVAL_MS, MIN_INTERVAL_MS, RT_FACTOR, pollingStore } from './lib/polling.js';
import { buildTrack, computeSpeedKmh } from './lib/track.js';

const nf = new Intl.NumberFormat('ko-KR', { maximumFractionDigits: 0 });
const timeFmt = new Intl.DateTimeFormat('ko-KR', { hour: '2-digit', minute: '2-digit', second: '2-digit' });

function useNow(intervalMs) {
  const [now, setNow] = useState(Date.now);
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(id);
  }, [intervalMs]);
  return now;
}

function latencyClass(ms, failed) {
  if (failed || ms == null) return 's5';
  if (ms < 300) return 's2';
  if (ms < 1000) return 's4';
  return 's5';
}

export default function App() {
  const queryClient = useQueryClient();
  const polling = useSyncExternalStore(pollingStore.subscribe, pollingStore.getSnapshot);
  const [follow, setFollow] = useState(false);
  const now = useNow(1000);

  const issQuery = useQuery({
    queryKey: ['iss-now'],
    queryFn: fetchIssPosition,
    refetchInterval: () => pollingStore.getSnapshot().intervalMs,
    refetchIntervalInBackground: true,
    retry: false,
  });

  const trackQuery = useQuery({
    queryKey: ['track'],
    queryFn: loadStoredTrack,
    refetchInterval: 60_000, // 수신이 끊겨도 4시간 지난 좌표는 주기적으로 삭제
  });

  useEffect(() => {
    if (issQuery.dataUpdatedAt) queryClient.invalidateQueries({ queryKey: ['track'] });
  }, [issQuery.dataUpdatedAt, queryClient]);

  const points = trackQuery.data ?? [];
  const track = useMemo(() => buildTrack(points, Date.now()), [trackQuery.dataUpdatedAt]); // eslint-disable-line react-hooks/exhaustive-deps
  const speedKmh = useMemo(() => computeSpeedKmh(points), [trackQuery.dataUpdatedAt]); // eslint-disable-line react-hooks/exhaustive-deps
  const position = issQuery.data ?? points.at(-1) ?? null;

  const lastFetchAt = Math.max(issQuery.dataUpdatedAt, issQuery.errorUpdatedAt);
  const nextInSec = lastFetchAt ? Math.max(0, Math.ceil((lastFetchAt + polling.intervalMs - now) / 1000)) : null;
  const failed = issQuery.isError;

  return (
    <>
      <div className="topbar">
        <a className="brand" href="#">🛰️ ISS 실시간 추적</a>
        <nav>
          <a href="#map">궤적 지도</a>
          <a href="#log">요청 기록</a>
          <a href="#how">동작 원리</a>
        </nav>
      </div>

      <header className="hero">
        <span className="badge">Open Notify API · React 19 · TanStack Query</span>
        <h1>국제 우주 정거장은 지금 어디에?</h1>
        <p>
          ISS의 현재 위치를 실시간으로 받아 최근 4시간의 궤적을 지도 위에 그립니다.
          수집하지 못한 구간은 궤도 모델로 계산해 점선으로 표시합니다.
        </p>
      </header>

      <main>
        <section id="map">
          <div className="section-head">
            <span className="chip">실시간</span>
            <h2>우주 정거장 궤적</h2>
          </div>

          <div className="card">
            <div className="map-toolbar">
              <div className="legend">
                <span><i className="line solid" /> 실측 궤적</span>
                <span><i className="line dashed" /> 계산/유추 궤적</span>
              </div>
              <label className="follow">
                <input type="checkbox" checked={follow} onChange={(e) => setFollow(e.target.checked)} />
                ISS 따라가기
              </label>
            </div>
            <IssMap track={track} position={position} follow={follow} />
            {failed && (
              <p className="error">⚠️ API 요청 실패: {polling.lastError} — 간격을 늘려 다시 시도합니다.</p>
            )}
          </div>

          <div className="card">
            <h3>📡 이동 속도 · API 상태</h3>
            <div className="status-grid">
              <div className="status s3">
                <b>{speedKmh ? `${nf.format(speedKmh)} km/h` : '계산 중…'}</b>
                이동 속도{speedKmh ? ` (${(speedKmh / 3600).toFixed(2)} km/s)` : ''}
              </div>
              <div className={`status ${latencyClass(polling.lastMs, failed)}`}>
                <b>{polling.lastMs != null ? `${nf.format(polling.lastMs)} ms` : '측정 중…'}</b>
                API 응답 속도{polling.avgMs != null ? ` · 평균 ${nf.format(polling.avgMs)} ms` : ''}
              </div>
              <div className="status s4">
                <b>{(polling.intervalMs / 1000).toFixed(1)} s</b>
                Polling 간격{nextInSec != null ? ` · ${nextInSec}초 후 요청` : ''}
              </div>
              <div className="status s2">
                <b>{position ? `${position.lat.toFixed(2)}°, ${position.lon.toFixed(2)}°` : '—'}</b>
                현재 위치 (위도, 경도)
              </div>
              <div className="status s3">
                <b>{nf.format(points.length)}개</b>
                IndexedDB 저장 좌표 (최근 4시간)
              </div>
            </div>
          </div>
        </section>

        <section id="log">
          <div className="section-head">
            <span className="chip">측정</span>
            <h2>최근 API 요청 기록</h2>
          </div>
          <div className="card">
            <table>
              <thead>
                <tr><th>요청 시각</th><th>응답 속도</th><th>결과</th><th>다음 간격</th></tr>
              </thead>
              <tbody>
                {polling.history.length === 0 && (
                  <tr><td colSpan={4}>첫 응답을 기다리는 중…</td></tr>
                )}
                {polling.history.map((h) => (
                  <tr key={h.at}>
                    <td>{timeFmt.format(h.at)}</td>
                    <td><code>{nf.format(h.ms)} ms</code></td>
                    <td>{h.ok ? '✅ 성공' : `❌ ${h.error}`}</td>
                    <td>{(h.intervalMs / 1000).toFixed(1)} s</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <section id="how">
          <div className="section-head">
            <span className="chip">원리</span>
            <h2>궤적 저장과 추정 방식</h2>
          </div>

          <div className="card">
            <h3>🗄️ IndexedDB 궤적 저장</h3>
            <ol className="steps">
              <li>응답을 받을 때마다 좌표를 타임스탬프 키로 IndexedDB에 저장합니다.</li>
              <li>궤적을 읽을 때와 1분마다 4시간이 지난 좌표를 자동으로 삭제합니다.</li>
              <li>앱을 다시 열어도 4시간 이내 저장 좌표로 궤적을 이어서 그립니다.</li>
            </ol>
          </div>

          <div className="card">
            <h3>🧮 계산/유추 궤적 (점선)</h3>
            <ul>
              <li>경사각 51.64°, 주기 92.68분의 원궤도와 지구 자전을 반영한 모델로 위치를 계산합니다.</li>
              <li>좌표 간격이 3분을 넘는 <b>단절 구간</b>은 양 끝 실측점에서 각각 전파한 궤적을 시간 가중 평균해 잇습니다.</li>
              <li>4시간 분량의 데이터가 없으면 <b>가장 오래된 실측점에서 4시간 전까지</b> 거꾸로 유추합니다.</li>
              <li>수신이 끊긴 경우 마지막 실측점에서 현재 시각까지 예측 궤적을 그립니다.</li>
            </ul>
          </div>

          <div className="card">
            <h3>⏱️ 능동적 Polling 간격</h3>
            <p>
              매 요청의 응답 시간을 측정해 지수 이동 평균을 구하고, 간격을
              <code>평균 응답시간 × {RT_FACTOR}</code>로 정합니다(최소 {MIN_INTERVAL_MS / 1000}초, 최대 {MAX_INTERVAL_MS / 1000}초).
              요청이 실패하면 간격을 두 배로 늘리고, 성공하면 다시 응답 속도 기준으로 돌아옵니다.
            </p>
          </div>
        </section>
      </main>

      <footer>
        데이터: <a href="http://open-notify.org/" target="_blank" rel="noreferrer">Open Notify</a> · 지도: OpenStreetMap / CARTO
      </footer>
    </>
  );
}
