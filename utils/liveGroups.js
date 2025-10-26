// utils/liveGroups.js

// simple haversine in meters
export function distanceMeters(aLat, aLng, bLat, bLng) {
  const toRad = (d) => (d * Math.PI) / 180;
  const R = 6371000;
  const dLat = toRad(bLat - aLat);
  const dLng = toRad(bLng - aLng);
  const s1 = Math.sin(dLat / 2);
  const s2 = Math.sin(dLng / 2);
  const c =
    s1 * s1 +
    Math.cos(toRad(aLat)) * Math.cos(toRad(bLat)) * s2 * s2;
  const d = 2 * Math.atan2(Math.sqrt(c), Math.sqrt(1 - c));
  return R * d;
}

/**
 * Groups live users that are within 'radius' meters of each other.
 * Each item in 'liveUsers' is { user_id, lat, lng, last_seen, username, avatar_url }
 * Returns: [{ lat, lng, members: [...], count }]
 */
export function groupLiveUsers(liveUsers = [], radiusM = 25) {
  const src = (liveUsers || []).filter(
    (u) =>
      Number.isFinite(u?.lat) &&
      Number.isFinite(u?.lng) &&
      !!u?.user_id
  );

  const groups = [];
  const used = new Set();

  for (let i = 0; i < src.length; i++) {
    if (used.has(i)) continue;
    const a = src[i];
    const bucket = [a];
    used.add(i);

    for (let j = i + 1; j < src.length; j++) {
      if (used.has(j)) continue;
      const b = src[j];
      const d = distanceMeters(a.lat, a.lng, b.lat, b.lng);
      if (d <= radiusM) {
        bucket.push(b);
        used.add(j);
      }
    }

    // centroid
    const lat =
      bucket.reduce((s, u) => s + u.lat, 0) / bucket.length;
    const lng =
      bucket.reduce((s, u) => s + u.lng, 0) / bucket.length;

    groups.push({ lat, lng, members: bucket, count: bucket.length });
  }

  return groups;
}