// 원궤도 근사 모델로 ISS 지상 궤적을 계산한다.
// 한 지점(위도·경도·시각)과 진행 방향(북상/남하)을 알면 임의 시각의 위치를 추정할 수 있다.
const DEG = Math.PI / 180;

export const INCLINATION_DEG = 51.64; // 궤도 경사각
export const PERIOD_S = 92.68 * 60; // 궤도 주기
export const ALTITUDE_KM = 420;
export const EARTH_RADIUS_KM = 6371;

const I = INCLINATION_DEG * DEG;
const MEAN_MOTION = (2 * Math.PI) / PERIOD_S; // rad/s
const EARTH_ROTATION = (2 * Math.PI) / 86164.0905; // 항성일 기준 rad/s
const NODAL_PRECESSION = (-5.0 * DEG) / 86400; // 승교점 세차 (약 -5°/일)

const clamp = (v, min, max) => Math.min(max, Math.max(min, v));

export function normalizeLon(lon) {
  return ((((lon + 180) % 360) + 360) % 360) - 180;
}

// 위도로부터 승교점 기준 위도 인수(argument of latitude)를 구한다.
function argumentOfLatitude(latDeg, ascending) {
  const u = Math.asin(clamp(Math.sin(latDeg * DEG) / Math.sin(I), -1, 1));
  return ascending ? u : Math.PI - u;
}

export function propagate(anchor, ascending, ts) {
  const u0 = argumentOfLatitude(anchor.lat, ascending);
  const node0 = anchor.lon * DEG - Math.atan2(Math.cos(I) * Math.sin(u0), Math.cos(u0));
  const dt = (ts - anchor.ts) / 1000;
  const u = u0 + MEAN_MOTION * dt;
  const lat = Math.asin(Math.sin(I) * Math.sin(u));
  const lon = node0 + Math.atan2(Math.cos(I) * Math.sin(u), Math.cos(u)) + (NODAL_PRECESSION - EARTH_ROTATION) * dt;
  return { ts, lat: lat / DEG, lon: normalizeLon(lon / DEG) };
}

// 두 지점 사이의 중심각(rad)
export function centralAngle(a, b) {
  const dLat = (b.lat - a.lat) * DEG;
  const dLon = (b.lon - a.lon) * DEG;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * DEG) * Math.cos(b.lat * DEG) * Math.sin(dLon / 2) ** 2;
  return 2 * Math.asin(Math.min(1, Math.sqrt(h)));
}

// 기준점(ref)을 더 잘 설명하는 진행 방향을 고른다. 기준점이 없으면 북상으로 가정.
export function chooseDirection(point, ref) {
  if (!ref) return true;
  const errAsc = centralAngle(propagate(point, true, ref.ts), ref);
  const errDesc = centralAngle(propagate(point, false, ref.ts), ref);
  return errAsc <= errDesc;
}
