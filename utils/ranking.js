// utils/ranking.js
// Simple and fast ranking
export const minutesLeftFor = (p, fallbackTotal = 240) => {
  const start = new Date(p.created_at || Date.now()).getTime();
  const end = p.expires_at ? new Date(p.expires_at).getTime() : start + fallbackTotal * 60_000;
  return Math.max(0, Math.round((end - Date.now()) / 60_000));
};

export const scorePost = (p) => {
  const minsLeft = minutesLeftFor(p);
  const engagement = (p.reactions || 0) + 2 * (p.comments || 0);
  const photoBonus = p.photo_url ? 150 : 0;
  const recency = new Date(p.created_at || 0).getTime() / 1_000_000; // tiny weight
  return minsLeft * 4 + engagement * 30 + photoBonus + recency;
};

export const rankTop = (arr = []) =>
  arr.slice().sort((a, b) => scorePost(b) - scorePost(a));

export const rankNew = (arr = []) =>
  arr.slice().sort((a, b) => new Date(b.created_at) - new Date(a.created_at));

/**
 * Collapse near-duplicates:
 * same category + very similar text (prefix match) within 60 min window.
 */
export const deDupeSimilar = (arr = []) => {
  const out = [];
  const seen = new Map(); // key -> {post, count}
  arr.forEach((p) => {
    const t = (p.text || '').trim().toLowerCase();
    const key = `${p.category || 'misc'}|${t.slice(0, 24)}`;
    const mins = minutesLeftFor(p);
    if (seen.has(key)) {
      const s = seen.get(key);
      s.count += 1;
    } else if (mins > 0) {
      seen.set(key, { post: p, count: 1 });
    }
  });
  seen.forEach(({ post, count }) => {
    out.push(count > 1 ? { ...post, _dupeCount: count } : post);
  });
  return out;
};