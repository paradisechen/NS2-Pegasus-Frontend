import type { LaMovieMediaItem } from '../types/skyline';
import type { RawLaMoviePost } from './lamovieParser';

export const FANPELIS_ORIGIN = 'https://fanpelis.to';
export const FANPELIS_API_BASE = 'https://fanpelis.to/api/rest';
export const FANPELIS_IMAGE_BASE = 'https://fanpelis.to/wp-content/uploads';

export const FANPELIS_GENRE_MAP: Record<number, string> = {
  52: 'Acción',
  49: 'Action & Adventure',
  47: 'Animación',
  51: 'Aventura',
  224: 'Bélica',
  53: 'Ciencia Ficción',
  104: 'Comedia',
  607: 'Crimen',
  4899: 'Documental',
  50: 'Drama',
  80: 'Familia',
  203: 'Fantasía',
  489: 'Historia',
  46: 'Kids',
  127: 'Misterio',
  365: 'Música',
  6496: 'Película de TV',
  12229: 'Reality',
  105: 'Romance',
  48: 'Sci-Fi & Fantasy',
  18957: 'Soap',
  318: 'Suspense',
  9485: 'Talk',
  1263: 'Terror',
  376: 'War & Politics',
  249: 'Western',
};

export const GENRE_QUERY_TO_API_IDS: Record<string, { lamovieId?: number; fanpelisId?: number }> = {
  'acción': { lamovieId: 32, fanpelisId: 52 },
  action: { lamovieId: 32, fanpelisId: 52 },
  'animación': { lamovieId: 520, fanpelisId: 47 },
  anime: { lamovieId: 520, fanpelisId: 47 },
  aventura: { lamovieId: 130, fanpelisId: 51 },
  adventure: { lamovieId: 130, fanpelisId: 51 },
  'bélica': { lamovieId: 3056, fanpelisId: 224 },
  'ciencia ficción': { lamovieId: 131, fanpelisId: 53 },
  'sci-fi': { lamovieId: 131, fanpelisId: 53 },
  comedia: { lamovieId: 18, fanpelisId: 104 },
  comedy: { lamovieId: 18, fanpelisId: 104 },
  crimen: { lamovieId: 180, fanpelisId: 607 },
  documental: { lamovieId: 164, fanpelisId: 4899 },
  drama: { lamovieId: 17, fanpelisId: 50 },
  familia: { lamovieId: 398, fanpelisId: 80 },
  'fantasía': { lamovieId: 229, fanpelisId: 203 },
  historia: { lamovieId: 165, fanpelisId: 489 },
  kids: { lamovieId: 703, fanpelisId: 46 },
  misterio: { lamovieId: 97, fanpelisId: 127 },
  'música': { lamovieId: 8, fanpelisId: 365 },
  romance: { lamovieId: 115, fanpelisId: 105 },
  suspenso: { lamovieId: 33, fanpelisId: 318 },
  suspense: { lamovieId: 33, fanpelisId: 318 },
  terror: { lamovieId: 96, fanpelisId: 1263 },
  horror: { lamovieId: 96, fanpelisId: 1263 },
  western: { lamovieId: 674, fanpelisId: 249 },
};

export function resolveSourceGenreIds(genreStr?: string): { lamovieId?: number; fanpelisId?: number } {
  const clean = String(genreStr || '').trim().toLowerCase();
  if (!clean || clean === 'all' || clean === 'todo') return {};
  if (GENRE_QUERY_TO_API_IDS[clean]) return GENRE_QUERY_TO_API_IDS[clean];
  for (const [k, v] of Object.entries(GENRE_QUERY_TO_API_IDS)) {
    if (clean.includes(k) || k.includes(clean)) return v;
  }
  return {};
}

function buildFanpelisImgUrl(rel?: string): { raw: string; proxied: string } {
  const clean = String(rel || '').trim();
  if (!clean) return { raw: '', proxied: '' };
  const raw = clean.startsWith('http')
    ? clean
    : `${FANPELIS_IMAGE_BASE}${clean.startsWith('/') ? '' : '/'}${clean}`;
  return {
    raw,
    proxied: `/api/feeds/image?url=${encodeURIComponent(raw)}`,
  };
}

export function parseFanpelisPosts(
  posts: RawLaMoviePost[],
  fallbackType: 'movies' | 'tvshows' = 'movies'
): LaMovieMediaItem[] {
  if (!Array.isArray(posts)) return [];
  const items: LaMovieMediaItem[] = [];
  for (const post of posts) {
    if (!post?._id || !post?.title || !post?.slug) continue;
    const mediaType: 'movies' | 'tvshows' =
      post.type === 'tvshows' || fallbackType === 'tvshows' ? 'tvshows' : 'movies';
    const poster = buildFanpelisImgUrl(post.images?.poster);
    const backdrop = buildFanpelisImgUrl(post.images?.backdrop || post.images?.poster);
    const yearMatch = post.release_date?.match(/\b(19|20)\d{2}\b/) || post.title.match(/\b(19|20)\d{2}\b/);
    const genreLabels = Array.isArray(post.genres)
      ? post.genres.map((id) => FANPELIS_GENRE_MAP[id]).filter((x): x is string => Boolean(x))
      : [];
    const permalinkPath = mediaType === 'tvshows' ? 'series' : 'peliculas';
    items.push({
      id: `fanpelis-${mediaType}-${post._id}`,
      postId: Number(post._id),
      slug: post.slug,
      title: String(post.title).trim(),
      mediaType,
      sourceProvider: 'fanpelis',
      overview: String(post.overview || '').trim() || `${post.title} disponible en streaming HD vía Fanpelis.`,
      posterUrl: poster.proxied || '/src/assets/images/cover_crimson_odyssey_1795374633248.jpg',
      backdropUrl: backdrop.proxied || poster.proxied || '/src/assets/images/cover_azure_horizon_1795374632225.jpg',
      rawPosterUrl: poster.raw,
      rawBackdropUrl: backdrop.raw,
      rating: post.rating ? String(post.rating) : undefined,
      runtime: post.runtime ? `${Math.round(Number(post.runtime))} min` : undefined,
      genres: genreLabels.length > 0 ? genreLabels : [mediaType === 'tvshows' ? 'Series' : 'Películas'],
      year: yearMatch?.[0],
      pageUrl: `${FANPELIS_ORIGIN}/${permalinkPath}/${post.slug}/`,
    });
  }
  return items;
}

export function normalizeMediaTitleKey(title: string, year?: string): { base: string; strict: string } {
  const normalized = String(title || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/\(\s*(?:19|20)\d{2}\s*\)/g, ' ')
    .replace(/\[[^\]]*\]/g, ' ')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  const yr = String(year || '').match(/\b(19|20)\d{2}\b/)?.[0] || '';
  return {
    base: normalized,
    strict: yr ? `${normalized}|${yr}` : normalized,
  };
}

export function mergeAndDedupeMediaCatalog(
  primaryList: LaMovieMediaItem[],
  secondaryList: LaMovieMediaItem[]
): LaMovieMediaItem[] {
  const interleaved: LaMovieMediaItem[] = [];
  const maxLen = Math.max(primaryList.length, secondaryList.length);
  for (let i = 0; i < maxLen; i++) {
    if (i < primaryList.length) interleaved.push(primaryList[i]);
    if (i < secondaryList.length) interleaved.push(secondaryList[i]);
  }

  const out: LaMovieMediaItem[] = [];
  const keyToIndex = new Map<string, number>();

  for (const item of interleaved) {
    const keys = normalizeMediaTitleKey(item.title, item.year);
    const strictKey = `${item.mediaType}:${keys.strict}`;
    const looseKey = `${item.mediaType}:${keys.base}`;
    const existingIdx = keyToIndex.get(strictKey) ?? (keys.base.length >= 4 ? keyToIndex.get(looseKey) : undefined);

    if (existingIdx === undefined) {
      const idx = out.length;
      out.push({ ...item });
      keyToIndex.set(strictKey, idx);
      if (keys.base.length >= 4 && !keyToIndex.has(looseKey)) {
        keyToIndex.set(looseKey, idx);
      }
    } else {
      const existing = out[existingIdx];
      if (existing.id === item.id) continue;

      const sameProvider = existing.sourceProvider === item.sourceProvider;
      if (!sameProvider && !existing.altSource && (item.sourceProvider === 'lamovie' || item.sourceProvider === 'fanpelis')) {
        existing.altSource = {
          provider: item.sourceProvider,
          postId: item.postId,
          slug: item.slug,
        };
        existing.sourceProvider = 'combined';
      }
      if ((!existing.overview || existing.overview.includes('disponible en streaming')) && item.overview) {
        existing.overview = item.overview;
      }
      if ((!existing.rawBackdropUrl || existing.backdropUrl.startsWith('/src/assets/')) && item.rawBackdropUrl) {
        existing.backdropUrl = item.backdropUrl;
        existing.rawBackdropUrl = item.rawBackdropUrl;
      }
      if ((!existing.rawPosterUrl || existing.posterUrl.startsWith('/src/assets/')) && item.rawPosterUrl) {
        existing.posterUrl = item.posterUrl;
        existing.rawPosterUrl = item.rawPosterUrl;
      }
      if (!existing.year && item.year) existing.year = item.year;
      if (!existing.rating && item.rating) existing.rating = item.rating;
      const gSet = new Set([...existing.genres, ...item.genres]);
      existing.genres = Array.from(gSet).slice(0, 4);
    }
  }

  return out;
}
