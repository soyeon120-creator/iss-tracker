import { ALTITUDE_KM, EARTH_RADIUS_KM, centralAngle, chooseDirection, normalizeLon, propagate } from './orbit.js';

export const WINDOW_MS = 4 * 60 * 60 * 1000; // 궤적 유지 구간: 최근 4시간
export const GAP_MS = 3 * 60 * 1000; // 이보다 벌어지면 단절 구간으로 본다
const STEP_MS = 30 * 1000; // 추정 궤적 샘플 간격

function sampleRange(t0, t1, fn) {
  const out = [];
  for (let t = t0; t < t1; t += STEP_MS) out.push(fn(t));
  out.push(fn(t1));
  return out;
}

const wrap180 = (d) => normalizeLon(d);

// 단절 구간: 앞 지점에서 순방향, 뒤 지점에서 역방향으로 전파한 뒤 시간 가중으로 섞는다.
// 양 끝이 실측 좌표와 정확히 일치하므로 궤적이 끊기지 않는다.
function fillGap(a, dirA, b, dirB) {
  return sampleRange(a.ts, b.ts, (t) => {
    const w = (t - a.ts) / (b.ts - a.ts);
    const f = propagate(a, dirA, t);
    const g = propagate(b, dirB, t);
    return {
      ts: t,
      lat: f.lat + (g.lat - f.lat) * w,
      lon: normalizeLon(f.lon + wrap180(g.lon - f.lon) * w),
    };
  });
}

// 날짜변경선(±180°)을 넘는 선을 잘라 지도 위에서 가로지르는 직선이 생기지 않게 한다.
function splitAntimeridian(points) {
  const lines = [];
  let cur = [];
  points.forEach((p, i) => {
    if (i > 0) {
      const q = points[i - 1];
      if (Math.abs(p.lon - q.lon) > 180) {
        const edge = q.lon > 0 ? 180 : -180;
        const lon2 = p.lon + (q.lon > 0 ? 360 : -360);
        const f = (edge - q.lon) / (lon2 - q.lon);
        const lat = q.lat + (p.lat - q.lat) * f;
        cur.push([lat, edge]);
        lines.push(cur);
        cur = [[lat, -edge]];
      }
    }
    cur.push([p.lat, p.lon]);
  });
  lines.push(cur);
  return lines.filter((l) => l.length > 1);
}

function nearestNeighbor(pts, i) {
  const prev = pts[i - 1];
  const next = pts[i + 1];
  if (!prev) return next;
  if (!next) return prev;
  return pts[i].ts - prev.ts <= next.ts - pts[i].ts ? prev : next;
}

/**
 * 저장된 실측 좌표로 최근 4시간 궤적을 만든다.
 * solid: 실측 구간, dashed: 계산/유추 구간 (각각 [lat, lon][] 의 배열)
 */
export function buildTrack(points, now) {
  const start = now - WINDOW_MS;
  const pts = points.filter((p) => p.ts >= start).sort((a, b) => a.ts - b.ts);
  const solid = [];
  const dashed = [];
  if (pts.length === 0) return { solid, dashed, inferred: false };

  const dirs = pts.map((p, i) => chooseDirection(p, nearestNeighbor(pts, i)));

  let segment = [pts[0]];
  for (let i = 1; i < pts.length; i++) {
    if (pts[i].ts - pts[i - 1].ts > GAP_MS) {
      solid.push(segment);
      dashed.push(fillGap(pts[i - 1], dirs[i - 1], pts[i], dirs[i]));
      segment = [pts[i]];
    } else {
      segment.push(pts[i]);
    }
  }
  solid.push(segment);

  // 4시간 이내 수집 정보가 부족하면 가장 오래된 실측 지점에서 4시간 전까지 거꾸로 유추
  const first = pts[0];
  if (first.ts - start > STEP_MS) {
    dashed.push(sampleRange(start, first.ts, (t) => propagate(first, dirs[0], t)));
  }

  // 수신이 끊긴 상태라면 마지막 실측 지점에서 현재 시각까지 예측
  const last = pts[pts.length - 1];
  if (now - last.ts > GAP_MS) {
    dashed.push(sampleRange(last.ts, now, (t) => propagate(last, dirs[dirs.length - 1], t)));
  }

  return {
    solid: solid.flatMap(splitAntimeridian),
    dashed: dashed.flatMap(splitAntimeridian),
    inferred: dashed.length > 0,
  };
}

/** 최근 연속 실측 구간(최대 약 1분)으로 이동 속도(km/h)를 계산한다. */
export function computeSpeedKmh(points) {
  const pts = [...points].sort((a, b) => a.ts - b.ts);
  if (pts.length < 2) return null;
  const last = pts[pts.length - 1];
  let distKm = 0;
  let i = pts.length - 1;
  while (i > 0 && pts[i].ts - pts[i - 1].ts <= GAP_MS && last.ts - pts[i].ts < 60_000) {
    distKm += centralAngle(pts[i - 1], pts[i]) * (EARTH_RADIUS_KM + ALTITUDE_KM);
    i--;
  }
  const hours = (last.ts - pts[i].ts) / 3_600_000;
  if (hours * 3600 < 4) return null;
  return distKm / hours;
}
