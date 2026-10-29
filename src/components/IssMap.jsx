import { useEffect } from 'react';
import { MapContainer, Marker, Polyline, TileLayer, Tooltip, useMap } from 'react-leaflet';
import L from 'leaflet';

const ISS_SVG = `
<svg viewBox="0 0 64 64" width="48" height="48" xmlns="http://www.w3.org/2000/svg">
  <g stroke="#a5b4fc" stroke-width="0.6">
    <rect x="3" y="10" width="9" height="19" rx="1" fill="#4f46e5"/>
    <rect x="13" y="10" width="9" height="19" rx="1" fill="#4f46e5"/>
    <rect x="3" y="35" width="9" height="19" rx="1" fill="#4f46e5"/>
    <rect x="13" y="35" width="9" height="19" rx="1" fill="#4f46e5"/>
    <rect x="42" y="10" width="9" height="19" rx="1" fill="#4f46e5"/>
    <rect x="52" y="10" width="9" height="19" rx="1" fill="#4f46e5"/>
    <rect x="42" y="35" width="9" height="19" rx="1" fill="#4f46e5"/>
    <rect x="52" y="35" width="9" height="19" rx="1" fill="#4f46e5"/>
    <path d="M3 16h19M3 22h19M3 41h19M3 47h19M42 16h19M42 22h19M42 41h19M42 47h19" />
  </g>
  <rect x="2" y="30" width="60" height="4" rx="1" fill="#64748b"/>
  <rect x="26" y="14" width="4" height="7" fill="#f1f5f9" stroke="#94a3b8" stroke-width="0.6"/>
  <rect x="34" y="43" width="4" height="7" fill="#f1f5f9" stroke="#94a3b8" stroke-width="0.6"/>
  <rect x="28" y="19" width="8" height="26" rx="2.5" fill="#e2e8f0" stroke="#475569" stroke-width="1"/>
  <rect x="23" y="28" width="18" height="8" rx="2.5" fill="#f8fafc" stroke="#475569" stroke-width="1"/>
  <circle cx="32" cy="32" r="2" fill="#06b6d4"/>
</svg>`;

const issIcon = L.divIcon({
  html: ISS_SVG,
  className: 'iss-icon',
  iconSize: [48, 48],
  iconAnchor: [24, 24],
});

const SOLID_STYLE = { color: '#4f46e5', weight: 3, opacity: 0.9 };
const DASHED_STYLE = { color: '#06b6d4', weight: 2.5, opacity: 0.95, dashArray: '6 8' };

function FollowIss({ position, follow }) {
  const map = useMap();
  useEffect(() => {
    if (follow && position) map.panTo([position.lat, position.lon], { animate: true });
  }, [map, position, follow]);
  return null;
}

export default function IssMap({ track, position, follow }) {
  return (
    <MapContainer
      className="iss-map"
      center={[20, 0]}
      zoom={2}
      minZoom={2}
      maxBounds={[[-90, -240], [90, 240]]}
      worldCopyJump={false}
    >
      <TileLayer
        url="https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png"
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://carto.com/">CARTO</a>'
        subdomains="abcd"
        noWrap
      />
      {track.dashed.map((line, i) => (
        <Polyline key={`d${i}`} positions={line} pathOptions={DASHED_STYLE} />
      ))}
      {track.solid.map((line, i) => (
        <Polyline key={`s${i}`} positions={line} pathOptions={SOLID_STYLE} />
      ))}
      {position && (
        <Marker position={[position.lat, position.lon]} icon={issIcon}>
          <Tooltip direction="top" offset={[0, -22]}>
            ISS · {position.lat.toFixed(2)}°, {position.lon.toFixed(2)}°
          </Tooltip>
        </Marker>
      )}
      <FollowIss position={position} follow={follow} />
    </MapContainer>
  );
}
