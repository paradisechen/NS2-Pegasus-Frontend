import express from 'express';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import {
  APKP_FALLBACK_CATALOG,
  parseApkPortsApiJson,
  parseApkPortsDetailHtml,
  parseApkPortsListHtml,
} from './src/utils/apkportsParser.ts';
import {
  NSWPEDIA_FALLBACK_CATALOG,
  parseNswpediaListHtml,
  parseNswpediaWpJson,
} from './src/utils/nswpediaParser.ts';
import {
  parseSwitchsromWpJson,
  SWITCHSROM_FALLBACK_CATALOG,
} from './src/utils/switchsromParser.ts';
import {
  getVimmSectionUrl,
  parseVimmSystemHtml,
  VIMM_ALL_SECTIONS,
  VIMM_FALLBACK_CATALOG,
  VIMM_SYSTEMS,
} from './src/utils/vimmParser.ts';
import {
  filterAndPaginateUnifiedCatalog,
  unifyEshopCatalog,
} from './src/utils/eshopHelpers.ts';
import {
  ARCHIVE_FALLBACK_CATALOG,
  ARCHIVE_GAMECUBE_URL,
  ARCHIVE_PSP_URL,
  parseArchiveOrgDirectoryHtml,
} from './src/utils/archiveOrgParser.ts';
import {
  extractDirectStreamFromVimeosHtml,
  extractUnwrappedLaMovieEmbedUrl,
  filterAndPaginateLaMovieCatalog,
  LAMOVIE_API_BASE,
  LAMOVIE_FALLBACK_ITEMS,
  parseLaMoviePosts,
  rewriteLaMovieEmbedHtml,
} from './src/utils/lamovieParser.ts';
import {
  FANPELIS_API_BASE,
  mergeAndDedupeMediaCatalog,
  parseFanpelisPosts,
  resolveSourceGenreIds,
} from './src/utils/fanpelisParser.ts';
import {
  extractArticleContentHtml,
  GENERAL_NEWS_FALLBACK_BY_CATEGORY,
  GENERAL_NEWS_FALLBACK_ITEMS,
  NEWS_FALLBACK_BY_CATEGORY,
  NSO_FALLBACK_ITEMS,
  parseRedditJsonPosts,
  parseRssOrAtomXml,
} from './src/utils/rssFeedParser.ts';
import type { ApkpGameSummary, GeneralNewsCategoryId, NewsFeedItem, NsoCategoryId } from './src/types/skyline.ts';
import {
  buildCalibratedPegasusThemeZip,
  parseSkylineConfigFromQuery,
} from './src/utils/pegasusThemeZip.ts';
import {
  buildInAppBridgeScript,
  escapeHtml,
  extractYouTubeVideoId,
  extractYouTubeVideosFromHtml,
  isSafeExternalHttpUrl,
  parseDuckDuckGoHtmlResults,
  rewriteCssForInAppProxy,
  rewriteHtmlForInAppFrame,
  type YouTubeVideoCard,
} from './src/utils/browserHelper.ts';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const APKP_ORIGIN = 'https://www.apkports.com';
const NSWPEDIA_ORIGIN = 'https://nswpedia.com';
const SWITCHSROM_ORIGIN = 'https://app.switchsrom.com';
const VIMM_ORIGIN = 'https://vimm.net';
const ALLOWED_IMAGE_HOSTS = new Set([
  'www.apkports.com',
  'apkports.com',
  'nswpedia.com',
  'www.nswpedia.com',
  'app.switchsrom.com',
  'switchsrom.com',
  'vimm.net',
  'www.vimm.net',
  'archive.org',
  'ia800100.us.archive.org',
  'ia902300.us.archive.org',
  'lamovie.org',
  'www.lamovie.org',
  'la.movie',
  'fanpelis.to',
  'www.fanpelis.to',
  'img-place.com',
  'upload.wikimedia.org',
  'i.ytimg.com',
  's1.dmcdn.net',
  's2.dmcdn.net',
  'www.dailymotion.com',
  'assets.nintendo.com',
  'cdn.cloudflare.steamstatic.com',
  'img3.pixhost.to',
  'img2.pixhost.to',
  'img1.pixhost.to',
  'sxcu.net',
  'iili.io',
  'i.imgur.com',
  'apkvision.org',
]);

const FALLBACK_COVER_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 360"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0%" stop-color="#1E2430"/><stop offset="100%" stop-color="#2B3242"/></linearGradient></defs><rect width="640" height="360" fill="url(#g)"/><rect x="260" y="130" width="120" height="100" rx="16" fill="none" stroke="#4FD1FF" stroke-width="6" opacity="0.65"/><circle cx="320" cy="180" r="14" fill="#4FD1FF" opacity="0.65"/></svg>`;

interface CacheEntry<T> {
  expiresAt: number;
  data: T;
}

const listCache = new Map<string, CacheEntry<unknown>>();
const detailCache = new Map<string, CacheEntry<unknown>>();
const feedCache = new Map<string, CacheEntry<NewsFeedItem[]>>();
const articleCache = new Map<string, CacheEntry<unknown>>();

const NSO_RSS_SOURCES: { name: string; url: string; colors: [string, string] }[] = [
  { name: 'Nintendo Life', url: 'https://www.nintendolife.com/feeds/latest', colors: ['#E60012', '#991B1B'] },
  { name: 'Nintendo YouTube', url: 'https://www.youtube.com/feeds/videos.xml?channel_id=UCGIY_O-8vW4rfX98KlMkvRg', colors: ['#B91C1C', '#111827'] },
  { name: 'Nintendo Everything', url: 'https://nintendoeverything.com/feed/', colors: ['#E60012', '#1E293B'] },
  { name: 'IGN Games', url: 'https://www.youtube.com/feeds/videos.xml?channel_id=UCKy1dAqELo0zrOtPkf0eTMw', colors: ['#DC2626', '#111827'] },
  { name: 'Eurogamer', url: 'https://www.eurogamer.net/feed', colors: ['#0284C7', '#1E3A8A'] },
];

const NSO_RSS_BY_CATEGORY: Record<NsoCategoryId, { name: string; url: string; colors: [string, string] }[]> = {
  nintendo: NSO_RSS_SOURCES,
  action: [
    { name: 'IGN YouTube', url: 'https://www.youtube.com/feeds/videos.xml?channel_id=UCKy1dAqELo0zrOtPkf0eTMw', colors: ['#DC2626', '#111827'] },
    { name: 'Eurogamer', url: 'https://www.eurogamer.net/feed', colors: ['#DC2626', '#7C3AED'] },
    { name: 'Gematsu', url: 'https://www.gematsu.com/feed', colors: ['#0284C7', '#1E3A8A'] },
    { name: 'Nintendo Life', url: 'https://www.nintendolife.com/feeds/news', colors: ['#E60012', '#991B1B'] },
  ],
  rpg: [
    { name: 'Gematsu', url: 'https://www.gematsu.com/feed', colors: ['#4338CA', '#7C3AED'] },
    { name: 'Nintendo YouTube', url: 'https://www.youtube.com/feeds/videos.xml?channel_id=UCGIY_O-8vW4rfX98KlMkvRg', colors: ['#B91C1C', '#111827'] },
    { name: 'Eurogamer', url: 'https://www.eurogamer.net/feed', colors: ['#047857', '#0284C7'] },
    { name: 'Nintendo Life', url: 'https://www.nintendolife.com/feeds/latest', colors: ['#7C3AED', '#2563EB'] },
  ],
  adventure: [
    { name: 'Nintendo Life', url: 'https://www.nintendolife.com/feeds/reviews', colors: ['#0284C7', '#0F766E'] },
    { name: 'Eurogamer', url: 'https://www.eurogamer.net/feed', colors: ['#7C3AED', '#0EA5E9'] },
    { name: 'Gematsu', url: 'https://www.gematsu.com/feed', colors: ['#0D9488', '#1E3A8A'] },
  ],
  indie: [
    { name: 'Nintendo YouTube', url: 'https://www.youtube.com/feeds/videos.xml?channel_id=UCGIY_O-8vW4rfX98KlMkvRg', colors: ['#2563EB', '#0EA5E9'] },
    { name: 'Rock Paper Shotgun', url: 'https://www.rockpapershotgun.com/feed', colors: ['#7C3AED', '#2563EB'] },
    { name: 'Nintendo Life', url: 'https://www.nintendolife.com/feeds/news', colors: ['#059669', '#0EA5E9'] },
  ],
  multiplayer: [
    { name: 'GameSpot', url: 'https://www.gamespot.com/feeds/news/', colors: ['#DC2626', '#1E293B'] },
    { name: 'IGN YouTube', url: 'https://www.youtube.com/feeds/videos.xml?channel_id=UCKy1dAqELo0zrOtPkf0eTMw', colors: ['#DB2777', '#7C3AED'] },
    { name: 'Nintendo Life', url: 'https://www.nintendolife.com/feeds/latest', colors: ['#E60012', '#0EA5E9'] },
  ],
};

const GENERAL_NEWS_RSS_BY_CATEGORY: Record<
  GeneralNewsCategoryId,
  { name: string; url: string; kind?: 'rss' | 'reddit'; colors: [string, string] }[]
> = {
  latest: [
    { name: 'BBC World', url: 'https://feeds.bbci.co.uk/news/world/rss.xml', colors: ['#E60012', '#1E293B'] },
    { name: 'CNBC World', url: 'https://search.cnbc.com/rs/search/combinedcms/view.xml?partnerId=wrss01&id=100727362', colors: ['#0F172A', '#2563EB'] },
  ],
  location: [
    { name: 'Metro PR', url: 'https://www.metro.pr/arc/outboundfeeds/rss/?outputType=xml', colors: ['#7C3AED', '#1E293B'] },
    { name: 'Primera Hora PR', url: 'https://www.primerahora.com/arc/outboundfeeds/rss/?outputType=xml', colors: ['#DC2626', '#0284C7'] },
    { name: 'NotiCel PR', url: 'https://www.noticel.com/feed/', colors: ['#059669', '#0F766E'] },
    { name: 'El Nuevo Día PR', url: 'https://www.elnuevodia.com/arc/outboundfeeds/rss/category/noticias/locales/?outputType=xml', colors: ['#0284C7', '#1E3A8A'] },
  ],
  politics: [
    { name: 'BBC Politics', url: 'https://feeds.bbci.co.uk/news/politics/rss.xml', colors: ['#991B1B', '#0F172A'] },
    { name: 'US & World Politics', url: 'https://news.google.com/rss/headlines/section/topic/POLITICS?hl=en-US&gl=US&ceid=US:en', colors: ['#B91C1C', '#1E3A8A'] },
  ],
  economy: [
    { name: 'BBC Business', url: 'https://feeds.bbci.co.uk/news/business/rss.xml', colors: ['#047857', '#0F172A'] },
    { name: 'CNBC Economy', url: 'https://search.cnbc.com/rs/search/combinedcms/view.xml?partnerId=wrss01&id=20910258', colors: ['#0F766E', '#1E293B'] },
  ],
  tech: [
    { name: 'The Verge', url: 'https://www.theverge.com/rss/index.xml', colors: ['#7C3AED', '#2563EB'] },
    { name: 'Ars Technica', url: 'https://feeds.arstechnica.com/arstechnica/index', colors: ['#EA580C', '#1E293B'] },
  ],
  entertainment: [
    { name: 'Variety', url: 'https://variety.com/feed/', colors: ['#DB2777', '#1E293B'] },
    { name: 'Entertainment Weekly', url: 'https://ew.com/feed/', colors: ['#7C3AED', '#991B1B'] },
    { name: 'BBC Entertainment', url: 'https://feeds.bbci.co.uk/news/entertainment_and_arts/rss.xml', colors: ['#BE185D', '#111827'] },
  ],
  sports: [
    { name: 'BBC Sport', url: 'https://feeds.bbci.co.uk/sport/rss.xml', colors: ['#CA8A04', '#1E293B'] },
    { name: 'Sky Sports', url: 'https://www.skysports.com/rss/12040', colors: ['#0284C7', '#991B1B'] },
    { name: 'CBS Sports', url: 'https://www.cbssports.com/rss/headlines/', colors: ['#1D4ED8', '#111827'] },
    { name: 'Yahoo Sports', url: 'https://sports.yahoo.com/rss/', colors: ['#7C3AED', '#1E293B'] },
  ],
  xcom: [
    { name: 'X.com News Headlines', url: 'https://news.google.com/rss/search?q=site:x.com+breaking+news&hl=en-US&gl=US&ceid=US:en', colors: ['#111827', '#3B82F6'] },
    { name: 'X.com Tech & Trends', url: 'https://news.google.com/rss/search?q=site:x.com+trending+tech&hl=en-US&gl=US&ceid=US:en', colors: ['#1F2937', '#0EA5E9'] },
  ],
};

async function startServer() {
  const app = express();
  const PORT = 3000;
  app.use(express.json({ limit: '2mb' }));

  // Live Full Store Catalog API (APKPorts + NSWPedia + SwitchsROM + Vimm's Vault Retro ROMs)
  const STORE_DEFAULT_CATEGORIES = [
    { name: 'Action', slug: 'action' },
    { name: 'RPG', slug: 'rpg' },
    { name: 'Adventure', slug: 'adventure' },
    { name: 'Shooter', slug: 'shooter' },
    { name: 'Platformer', slug: 'platformer' },
    { name: 'Racing', slug: 'racing' },
    { name: 'Simulation', slug: 'simulation' },
    { name: 'Sports', slug: 'sports' },
    ...VIMM_SYSTEMS.map((s) => ({ name: s.label, slug: s.slug })),
  ];

  interface PagedSourceState {
    items: ApkpGameSummary[];
    nextPage: number;
    exhausted: boolean;
    catMap: Record<number, string>;
    expiresAt: number;
  }

  const SOURCE_CACHE_TTL_MS = 10 * 60 * 1000;
  const incrementalSources: {
    apkports: PagedSourceState;
    nswpedia: PagedSourceState;
    switchsrom: PagedSourceState;
    archive: { items: ApkpGameSummary[]; loaded: boolean; expiresAt: number };
    vimmQueueCursor: number;
  } = {
    apkports: { items: [], nextPage: 1, exhausted: false, catMap: {}, expiresAt: 0 },
    nswpedia: { items: [], nextPage: 1, exhausted: false, catMap: {}, expiresAt: 0 },
    switchsrom: { items: [], nextPage: 1, exhausted: false, catMap: {}, expiresAt: 0 },
    archive: { items: [], loaded: false, expiresAt: 0 },
    vimmQueueCursor: 0,
  };

  const resetIfExpired = (st: PagedSourceState) => {
    if (st.expiresAt > 0 && st.expiresAt <= Date.now()) {
      st.items = [];
      st.nextPage = 1;
      st.exhausted = false;
      st.catMap = {};
      st.expiresAt = 0;
    }
  };

  const appendUniqueGames = (target: ApkpGameSummary[], incoming: ApkpGameSummary[]): number => {
    let added = 0;
    const seen = new Set(target.map((g) => g.slug));
    for (const item of incoming) {
      if (!seen.has(item.slug)) {
        seen.add(item.slug);
        target.push(item);
        added++;
      }
    }
    return added;
  };

  const loadNextApkPortsBatch = async (): Promise<ApkpGameSummary[]> => {
    const st = incrementalSources.apkports;
    resetIfExpired(st);
    if (!st.exhausted) {
      const targetPage = st.nextPage;
      let batchItems: ApkpGameSummary[] = [];
      try {
        const r = await fetch(`${APKP_ORIGIN}/api/games?limit=25&page=${targetPage}`, {
          signal: AbortSignal.timeout(4500),
          headers: {
            'User-Agent': 'Mozilla/5.0 (Linux; Android 13; Retroid Pocket 5) AppleWebKit/537.36',
            Accept: 'application/json',
          },
        });
        if (r.ok) {
          batchItems = parseApkPortsApiJson(await r.json(), 'games');
        }
      } catch {
        // SSR fallback below
      }
      if (batchItems.length === 0 && targetPage === 1) {
        try {
          const htmlRes = await fetch(`${APKP_ORIGIN}/games?page=1&sort=popular`, {
            signal: AbortSignal.timeout(3000),
            headers: { 'User-Agent': 'Mozilla/5.0' },
          });
          if (htmlRes.ok) {
            batchItems = parseApkPortsListHtml(await htmlRes.text(), 'games').games;
          }
        } catch {
          // fallback below
        }
      }
      if (batchItems.length > 0) {
        const added = appendUniqueGames(st.items, batchItems);
        st.nextPage = targetPage + 1;
        st.expiresAt = Date.now() + SOURCE_CACHE_TTL_MS;
        if (batchItems.length < 15 || added === 0 || st.nextPage > 15) st.exhausted = true;
      } else {
        st.exhausted = true;
      }
    }
    if (st.items.length === 0) {
      appendUniqueGames(st.items, APKP_FALLBACK_CATALOG);
      st.expiresAt = Date.now() + SOURCE_CACHE_TTL_MS;
    }
    return st.items;
  };

  const loadNextNswpediaBatch = async (): Promise<ApkpGameSummary[]> => {
    const st = incrementalSources.nswpedia;
    resetIfExpired(st);
    if (!st.exhausted) {
      const targetPage = st.nextPage;
      let batchItems: ApkpGameSummary[] = [];
      try {
        if (Object.keys(st.catMap).length === 0) {
          const catsRes = await fetch(`${NSWPEDIA_ORIGIN}/wp-json/wp/v2/categories?per_page=100`, {
            signal: AbortSignal.timeout(3000),
            headers: { Accept: 'application/json', 'User-Agent': 'Mozilla/5.0' },
          }).catch(() => null);
          if (catsRes && catsRes.ok) {
            const catsJson = (await catsRes.json()) as { id?: number; name?: string }[];
            if (Array.isArray(catsJson)) {
              for (const c of catsJson) {
                if (c?.id && c?.name) st.catMap[Number(c.id)] = String(c.name);
              }
            }
          }
        }
        const postsRes = await fetch(`${NSWPEDIA_ORIGIN}/wp-json/wp/v2/posts?per_page=20&page=${targetPage}`, {
          signal: AbortSignal.timeout(4500),
          headers: { Accept: 'application/json', 'User-Agent': 'Mozilla/5.0' },
        });
        if (postsRes.ok) {
          batchItems = parseNswpediaWpJson(await postsRes.json(), st.catMap);
        }
      } catch {
        // HTML fallback on page 1
      }
      if (batchItems.length === 0 && targetPage === 1) {
        try {
          const r = await fetch(`${NSWPEDIA_ORIGIN}/nintendo-switch-roms/`, {
            signal: AbortSignal.timeout(3000),
            headers: { 'User-Agent': 'Mozilla/5.0', Accept: 'text/html' },
          });
          if (r.ok) batchItems = parseNswpediaListHtml(await r.text());
        } catch {
          // fallback below
        }
      }
      if (batchItems.length > 0) {
        const added = appendUniqueGames(st.items, batchItems);
        st.nextPage = targetPage + 1;
        st.expiresAt = Date.now() + SOURCE_CACHE_TTL_MS;
        if (batchItems.length < 10 || added === 0 || st.nextPage > 12) st.exhausted = true;
      } else {
        st.exhausted = true;
      }
    }
    if (st.items.length === 0) {
      appendUniqueGames(st.items, NSWPEDIA_FALLBACK_CATALOG);
      st.expiresAt = Date.now() + SOURCE_CACHE_TTL_MS;
    }
    listCache.set('raw:nswpedia', { expiresAt: Date.now() + SOURCE_CACHE_TTL_MS, data: st.items });
    return st.items;
  };

  const loadNextSwitchsRomBatch = async (): Promise<ApkpGameSummary[]> => {
    const st = incrementalSources.switchsrom;
    resetIfExpired(st);
    if (!st.exhausted) {
      const targetPage = st.nextPage;
      let batchItems: ApkpGameSummary[] = [];
      try {
        if (Object.keys(st.catMap).length === 0) {
          const catsRes = await fetch(`${SWITCHSROM_ORIGIN}/wp-json/wp/v2/categories?per_page=100`, {
            signal: AbortSignal.timeout(3000),
            headers: { Accept: 'application/json', 'User-Agent': 'Mozilla/5.0' },
          }).catch(() => null);
          if (catsRes && catsRes.ok) {
            const catsJson = (await catsRes.json()) as { id?: number; name?: string }[];
            if (Array.isArray(catsJson)) {
              for (const c of catsJson) {
                if (c?.id && c?.name) st.catMap[Number(c.id)] = String(c.name);
              }
            }
          }
        }
        const postsRes = await fetch(`${SWITCHSROM_ORIGIN}/wp-json/wp/v2/posts?per_page=20&page=${targetPage}`, {
          signal: AbortSignal.timeout(4500),
          headers: { Accept: 'application/json', 'User-Agent': 'Mozilla/5.0' },
        });
        if (postsRes.ok) {
          batchItems = parseSwitchsromWpJson(await postsRes.json(), st.catMap);
        }
      } catch {
        // fallback below
      }
      if (batchItems.length > 0) {
        const added = appendUniqueGames(st.items, batchItems);
        st.nextPage = targetPage + 1;
        st.expiresAt = Date.now() + SOURCE_CACHE_TTL_MS;
        if (batchItems.length < 10 || added === 0 || st.nextPage > 12) st.exhausted = true;
      } else {
        st.exhausted = true;
      }
    }
    if (st.items.length === 0) {
      appendUniqueGames(st.items, SWITCHSROM_FALLBACK_CATALOG);
      st.expiresAt = Date.now() + SOURCE_CACHE_TTL_MS;
    }
    listCache.set('raw:switchsrom', { expiresAt: Date.now() + SOURCE_CACHE_TTL_MS, data: st.items });
    return st.items;
  };

  const loadArchiveOrgBatch = async (forceLoad: boolean): Promise<ApkpGameSummary[]> => {
    const st = incrementalSources.archive;
    if (st.expiresAt > 0 && st.expiresAt <= Date.now()) {
      st.items = [];
      st.loaded = false;
      st.expiresAt = 0;
    }
    if (!st.loaded && forceLoad) {
      st.loaded = true;
      const targets: Array<{ url: string; label: 'GameCube' | 'PSP' }> = [
        { url: ARCHIVE_GAMECUBE_URL, label: 'GameCube' },
        { url: ARCHIVE_PSP_URL, label: 'PSP' },
      ];
      const perTarget = await Promise.all(
        targets.map(async (t) => {
          try {
            const r = await fetch(t.url, {
              signal: AbortSignal.timeout(5000),
              headers: { 'User-Agent': 'Mozilla/5.0', Accept: 'text/html' },
            });
            if (r.ok) return parseArchiveOrgDirectoryHtml(await r.text(), t.url, t.label);
          } catch {
            // ignore
          }
          return [];
        })
      );
      appendUniqueGames(st.items, [...perTarget[0], ...perTarget[1]]);
      if (st.items.length === 0) appendUniqueGames(st.items, ARCHIVE_FALLBACK_CATALOG);
      st.expiresAt = Date.now() + 30 * 60 * 1000;
      listCache.set('raw:archive:gc_psp', { expiresAt: st.expiresAt, data: st.items });
    }
    return st.items.length > 0 ? st.items : ARCHIVE_FALLBACK_CATALOG;
  };

  const fetchSourceCatalog = async (
    key: string,
    ttlMs: number,
    loader: () => Promise<ApkpGameSummary[]>
  ): Promise<ApkpGameSummary[]> => {
    const cached = listCache.get(key) as CacheEntry<ApkpGameSummary[]> | undefined;
    if (cached && cached.expiresAt > Date.now()) return cached.data;
    const data = await loader();
    if (data.length > 0) {
      listCache.set(key, { expiresAt: Date.now() + ttlMs, data });
    }
    return data;
  };

  const VIMM_BATCH_SYSTEMS = ['GBA', 'DS', 'N64', 'SNES', 'GameCube', 'PS2', 'PSP', 'Wii'];

  const loadVimmBatch = async (
    category: string,
    letter: string,
    batchIdx: number
  ): Promise<{ items: ApkpGameSummary[]; hasMoreVimm: boolean }> => {
    const requestedSys = VIMM_SYSTEMS.find(
      (s) => s.slug.toLowerCase() === category.toLowerCase() || s.label.toLowerCase() === category.toLowerCase()
    );
    const targetSystems = requestedSys ? [requestedSys.slug] : VIMM_BATCH_SYSTEMS;

    let pairsToFetch: Array<{ sysSlug: string; sec: string }> = [];
    let hasMoreVimm = false;

    if (requestedSys) {
      if (letter !== 'All') {
        pairsToFetch = [{ sysSlug: requestedSys.slug, sec: letter }];
      } else {
        // Load 2 sections per batch instead of all 27 at once
        const sliceEnd = Math.min(VIMM_ALL_SECTIONS.length, (batchIdx + 1) * 2);
        pairsToFetch = VIMM_ALL_SECTIONS.slice(0, sliceEnd).map((sec) => ({
          sysSlug: requestedSys.slug,
          sec,
        }));
        hasMoreVimm = sliceEnd < VIMM_ALL_SECTIONS.length;
      }
    } else if (letter !== 'All') {
      const sysEnd = Math.min(targetSystems.length, (batchIdx + 1) * 2);
      pairsToFetch = targetSystems.slice(0, sysEnd).map((sysSlug) => ({ sysSlug, sec: letter }));
      hasMoreVimm = sysEnd < targetSystems.length;
    } else {
      // Lightweight startup: batch 0 loads just GBA + DS top lists (2 tiny requests); later batches add systems/sections
      const allPairs: Array<{ sysSlug: string; sec: string }> = [];
      for (const sec of ['', 'A', 'M', 'S', 'P']) {
        for (const sysSlug of targetSystems) {
          allPairs.push({ sysSlug, sec });
        }
      }
      const pairLimit = Math.min(allPairs.length, 2 + batchIdx * 2);
      pairsToFetch = allPairs.slice(0, pairLimit);
      hasMoreVimm = pairLimit < allPairs.length;
    }

    const fetched = await Promise.all(
      pairsToFetch.map(({ sysSlug, sec }) =>
        fetchSourceCatalog(`raw:vimm:${sysSlug}:${sec || 'top'}`, 15 * 60 * 1000, async () => {
          const targetUrl = sec
            ? getVimmSectionUrl(sysSlug, sec)
            : `${VIMM_ORIGIN}/vault/${encodeURIComponent(sysSlug)}`;
          try {
            const r = await fetch(targetUrl, {
              signal: AbortSignal.timeout(4000),
              headers: {
                'User-Agent': 'Mozilla/5.0 (Linux; Android 13; Retroid Pocket 5) AppleWebKit/537.36',
                Accept: 'text/html,application/xhtml+xml',
              },
            });
            if (r.ok) return parseVimmSystemHtml(await r.text(), sysSlug);
          } catch {
            // ignore
          }
          return [];
        })
      )
    );

    const combined: ApkpGameSummary[] = [];
    const seen = new Set<string>();
    for (const arr of fetched) {
      for (const item of arr) {
        if (!seen.has(item.id)) {
          seen.add(item.id);
          combined.push(item);
        }
      }
    }
    for (const fb of VIMM_FALLBACK_CATALOG) {
      if (!seen.has(fb.id)) {
        seen.add(fb.id);
        combined.push(fb);
      }
    }
    return { items: combined, hasMoreVimm };
  };

  app.get('/api/apkports/games', async (req, res) => {
    const page = Math.max(1, Number(req.query.page ?? 1) || 1);
    const pageSize = Math.min(400, Math.max(6, Number(req.query.limit ?? 60) || 60));
    const sort = String(req.query.sort ?? 'popular');
    const category = String(req.query.category ?? '').trim();
    const portType = String(req.query.portType ?? '');
    const q = String(req.query.q ?? '').trim();
    const section = String(req.query.section ?? 'games');
    const rawLetter = String(req.query.letter ?? 'All').trim();
    const letter = rawLetter === '#' ? '#' : /^[a-z]$/i.test(rawLetter) ? rawLetter.toUpperCase() : 'All';

    const cacheKey = `unified|${section}|${letter}|${page}|${pageSize}|${sort}|${category}|${portType}|${q}`;
    const cached = listCache.get(cacheKey);
    if (cached && cached.expiresAt > Date.now()) {
      res.json({ ...(cached.data as object), source: 'cache' });
      return;
    }

    try {
      const catLower = category.toLowerCase();
      const needsArchiveNow = catLower === 'gamecube' || catLower === 'psp' || page > 1;
      const neededCount = page * pageSize;

      // Batch 0: Lightweight initial load (~20-25 per source instead of 1000+ upfront)
      let batchStep = 0;
      let apkpRaw = incrementalSources.apkports.items.length > 0
        ? incrementalSources.apkports.items
        : await loadNextApkPortsBatch();
      let nswRaw = section !== 'fan-games'
        ? (incrementalSources.nswpedia.items.length > 0 ? incrementalSources.nswpedia.items : await loadNextNswpediaBatch())
        : [];
      let sromRaw = section !== 'fan-games'
        ? (incrementalSources.switchsrom.items.length > 0 ? incrementalSources.switchsrom.items : await loadNextSwitchsRomBatch())
        : [];
      let vimmState = section !== 'fan-games'
        ? await loadVimmBatch(category, letter, batchStep)
        : { items: [], hasMoreVimm: false };
      let archiveRaw = section !== 'fan-games' ? await loadArchiveOrgBatch(needsArchiveNow) : [];

      let mergedAll = unifyEshopCatalog([apkpRaw, sromRaw, archiveRaw, vimmState.items, nswRaw]);
      let paged = filterAndPaginateUnifiedCatalog(mergedAll, {
        letter,
        category,
        q,
        portType,
        section,
        sort,
        page,
        pageSize,
      });

      // Lazily pull next source batches ONLY when requested page/filter exceeds currently cached count
      let extraBatches = 0;
      while (
        extraBatches < 2 &&
        paged.totalCount < neededCount + pageSize &&
        (!incrementalSources.apkports.exhausted ||
          (section !== 'fan-games' &&
            (!incrementalSources.nswpedia.exhausted ||
              !incrementalSources.switchsrom.exhausted ||
              !incrementalSources.archive.loaded ||
              vimmState.hasMoreVimm)))
      ) {
        extraBatches++;
        batchStep++;
        const [nextApkp, nextNsw, nextSwr, nextVimm, nextArch] = await Promise.all([
          !incrementalSources.apkports.exhausted ? loadNextApkPortsBatch() : Promise.resolve(apkpRaw),
          section !== 'fan-games' && !incrementalSources.nswpedia.exhausted
            ? loadNextNswpediaBatch()
            : Promise.resolve(nswRaw),
          section !== 'fan-games' && !incrementalSources.switchsrom.exhausted
            ? loadNextSwitchsRomBatch()
            : Promise.resolve(sromRaw),
          section !== 'fan-games' && vimmState.hasMoreVimm
            ? loadVimmBatch(category, letter, batchStep)
            : Promise.resolve(vimmState),
          section !== 'fan-games' && !incrementalSources.archive.loaded
            ? loadArchiveOrgBatch(true)
            : Promise.resolve(archiveRaw),
        ]);
        apkpRaw = nextApkp;
        nswRaw = nextNsw;
        sromRaw = nextSwr;
        vimmState = nextVimm;
        archiveRaw = nextArch;

        mergedAll = unifyEshopCatalog([apkpRaw, sromRaw, archiveRaw, vimmState.items, nswRaw]);
        paged = filterAndPaginateUnifiedCatalog(mergedAll, {
          letter,
          category,
          q,
          portType,
          section,
          sort,
          page,
          pageSize,
        });
      }

      const hasMore =
        paged.page < paged.totalPages ||
        !incrementalSources.apkports.exhausted ||
        (section !== 'fan-games' &&
          (!incrementalSources.nswpedia.exhausted ||
            !incrementalSources.switchsrom.exhausted ||
            vimmState.hasMoreVimm ||
            !incrementalSources.archive.loaded));

      const payload = {
        games: paged.games,
        totalCount: paged.totalCount,
        totalPages: paged.totalPages,
        page: paged.page,
        hasMore,
        categories: STORE_DEFAULT_CATEGORIES,
      };

      listCache.set(cacheKey, {
        expiresAt: Date.now() + 3 * 60 * 1000,
        data: payload,
      });

      res.json({ ...payload, source: paged.games.length > 0 ? 'live' : 'fallback' });
    } catch {
      const fallbackMerged = unifyEshopCatalog([
        APKP_FALLBACK_CATALOG,
        SWITCHSROM_FALLBACK_CATALOG,
        ARCHIVE_FALLBACK_CATALOG,
        VIMM_FALLBACK_CATALOG,
        NSWPEDIA_FALLBACK_CATALOG,
      ]);
      const paged = filterAndPaginateUnifiedCatalog(fallbackMerged, {
        letter,
        category,
        q,
        portType,
        section,
        sort,
        page,
        pageSize,
      });
      res.json({
        games: paged.games,
        totalCount: paged.totalCount,
        totalPages: paged.totalPages,
        page: paged.page,
        hasMore: false,
        categories: STORE_DEFAULT_CATEGORIES,
        source: 'fallback',
      });
    }
  });

  // Wikipedia Game Description Resolver (for Full-Page eShop Detail)
  app.get('/api/wikipedia/summary', async (req, res) => {
    const rawTitle = String(req.query.title ?? '').trim();
    if (!rawTitle) {
      res.status(400).json({ error: 'Missing title' });
      return;
    }
    const cleanTitle = rawTitle
      .replace(/\s*\([^)]*\)/g, '')
      .replace(/\s*\[[^\]]*\]/g, '')
      .replace(/\b(?:NSP|XCI|ROM|ISO|RVZ|APK|Switch|Download|Free|USA|Europe|Japan|Disc\s*\d+)\b/gi, '')
      .replace(/\s*[-–:|]\s*$/g, '')
      .replace(/\s+/g, ' ')
      .trim();

    const cacheKey = `wiki:${cleanTitle.toLowerCase()}`;
    const cached = detailCache.get(cacheKey);
    if (cached && cached.expiresAt > Date.now()) {
      res.json(cached.data);
      return;
    }

    try {
      const fetchWikiSummary = async (titleSlug: string) => {
        const r = await fetch(
          `https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(titleSlug.replace(/\s+/g, '_'))}`,
          {
            signal: AbortSignal.timeout(3500),
            headers: { 'User-Agent': 'SkyLineOS2/1.0 (Handheld Pegasus Launcher)', Accept: 'application/json' },
          }
        );
        if (!r.ok) return null;
        return (await r.json()) as {
          type?: string;
          title?: string;
          extract?: string;
          description?: string;
          thumbnail?: { source?: string };
          content_urls?: { desktop?: { page?: string } };
        };
      };

      let wiki = await fetchWikiSummary(cleanTitle).catch(() => null);
      if (!wiki || !wiki.extract || wiki.type === 'disambiguation') {
        let resolvedTitle = cleanTitle;
        const searchUrl = `https://en.wikipedia.org/w/api.php?action=opensearch&search=${encodeURIComponent(
          cleanTitle
        )}&limit=5&namespace=0&format=json`;
        const srRes = await fetch(searchUrl, {
          signal: AbortSignal.timeout(3000),
          headers: { 'User-Agent': 'SkyLineOS2/1.0 (Handheld Pegasus Launcher)' },
        }).catch(() => null);
        if (srRes && srRes.ok) {
          const srJson = (await srRes.json()) as [string, string[]];
          const titles = Array.isArray(srJson?.[1]) ? srJson[1] : [];
          const exact = titles.find((t) => t.toLowerCase() === cleanTitle.toLowerCase());
          const videoGameMatch = titles.find((t) => /\(video game\)/i.test(t));
          if (exact || videoGameMatch || titles[0]) {
            resolvedTitle = exact || videoGameMatch || titles[0];
          }
        }
        wiki = await fetchWikiSummary(resolvedTitle);
      }
      if (!wiki) throw new Error('Wiki summary unavailable');
      const payload = {
        title: wiki.title || cleanTitle,
        extract: wiki.extract || '',
        description: wiki.description || '',
        thumbnail: wiki.thumbnail?.source || '',
        pageUrl: wiki.content_urls?.desktop?.page || '',
      };
      if (payload.extract) {
        detailCache.set(cacheKey, { expiresAt: Date.now() + 60 * 60 * 1000, data: payload });
      }
      res.json(payload);
    } catch {
      res.json({ title: cleanTitle, extract: '', description: '', thumbnail: '', pageUrl: '' });
    }
  });

  // Fast YouTube Trailer Resolver (Verifies playable oEmbed; strict=1 avoids mismatched fallbacks)
  app.get('/api/youtube/search', async (req, res) => {
    const q = String(req.query.q ?? '').trim();
    const strict = String(req.query.strict ?? '') === '1';
    if (!q) {
      res.status(400).json({ error: 'Missing query' });
      return;
    }
    const ytKey = `yt:${strict ? 'strict:' : ''}${q.toLowerCase()}`;
    const cached = detailCache.get(ytKey);
    if (cached && cached.expiresAt > Date.now()) {
      res.json(cached.data);
      return;
    }
    const verifyPlayableOembed = async (videoId: string): Promise<boolean> => {
      try {
        const oe = await fetch(
          `https://www.youtube.com/oembed?url=${encodeURIComponent(`https://www.youtube.com/watch?v=${videoId}`)}&format=json`,
          { signal: AbortSignal.timeout(2500) }
        );
        return oe.ok;
      } catch {
        return false;
      }
    };
    try {
      const searchUrl = `https://www.youtube.com/results?search_query=${encodeURIComponent(`${q} gameplay trailer`)}`;
      const ytRes = await fetch(searchUrl, {
        signal: AbortSignal.timeout(3500),
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/124.0 Safari/537.36',
          'Accept-Language': 'en-US,en;q=0.9',
        },
      });
      if (!ytRes.ok) throw new Error(`YT HTTP ${ytRes.status}`);
      const html = await ytRes.text();
      const videos = extractYouTubeVideosFromHtml(html);
      if (videos.length === 0) throw new Error('No YouTube videos found');

      let chosen: YouTubeVideoCard | undefined;
      if (strict) {
        const words = q
          .toLowerCase()
          .replace(/[^a-z0-9\s]/g, ' ')
          .split(/\s+/)
          .filter((w) => w.length >= 3);
        for (const v of videos.slice(0, 6)) {
          const tLower = v.title.toLowerCase();
          const overlap = words.filter((w) => tLower.includes(w)).length;
          const threshold = words.length <= 1 ? 1 : Math.max(1, Math.ceil(words.length * 0.5));
          if (overlap >= threshold && (await verifyPlayableOembed(v.videoId))) {
            chosen = v;
            break;
          }
        }
      } else {
        for (const v of videos.slice(0, 4)) {
          if (await verifyPlayableOembed(v.videoId)) {
            chosen = v;
            break;
          }
        }
      }

      if (!chosen) {
        const missPayload = { found: false, videoId: '', title: q, embedUrl: '' };
        detailCache.set(ytKey, { expiresAt: Date.now() + 10 * 60 * 1000, data: missPayload });
        res.json(missPayload);
        return;
      }

      const payload = {
        found: true,
        videoId: chosen.videoId,
        title: chosen.title,
        embedUrl: `https://www.youtube.com/embed/${chosen.videoId}?autoplay=1&mute=1&controls=0&modestbranding=1&iv_load_policy=3&playsinline=1&rel=0&vq=small&enablejsapi=1`,
        embedUrlUnmuted: `https://www.youtube.com/embed/${chosen.videoId}?autoplay=1&mute=0&controls=0&modestbranding=1&iv_load_policy=3&playsinline=1&rel=0&vq=small&enablejsapi=1`,
      };
      detailCache.set(ytKey, { expiresAt: Date.now() + 30 * 60 * 1000, data: payload });
      res.json(payload);
    } catch {
      res.json({
        found: false,
        videoId: '',
        title: q,
        embedUrl: '',
      });
    }
  });

  // Direct Playable Video Stream Resolver (Dailymotion HLS + Steam Store MP4/HLS — zero YouTube bot-gate)
  app.get('/api/video/resolve', async (req, res) => {
    const rawQ = String(req.query.q ?? '').trim();
    const rawDmId = String(req.query.dmId ?? '').trim().replace(/^dm:/i, '');
    const strict = String(req.query.strict ?? '') === '1';
    if (!rawQ && !rawDmId) {
      res.status(400).json({ ok: false, error: 'Missing query' });
      return;
    }

    const cleanQ = rawQ
      .replace(/\s*\([^)]*\)/g, '')
      .replace(/\s*\[[^\]]*\]/g, '')
      .replace(/\b(?:NSP|XCI|ROM|ISO|RVZ|APK|Switch|Download|Free|USA|Europe|Japan)\b/gi, '')
      .replace(/\s+/g, ' ')
      .trim();
    const cacheKey = rawDmId
      ? `vidres:dm:${rawDmId}`
      : `vidres:${strict ? 'strict:' : ''}${cleanQ.toLowerCase()}`;
    const cached = detailCache.get(cacheKey);
    if (cached && cached.expiresAt > Date.now()) {
      res.json(cached.data);
      return;
    }

    const words = cleanQ
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, ' ')
      .split(/\s+/)
      .filter((w) => w.length >= 3);

    const isRelevantTitle = (candidateTitle: string): boolean => {
      if (!strict || words.length === 0) return true;
      const lower = candidateTitle.toLowerCase();
      const overlap = words.filter((w) => lower.includes(w)).length;
      return overlap >= (words.length <= 1 ? 1 : Math.ceil(words.length * 0.5));
    };

    try {
      if (rawDmId) {
        const metaRes = await fetch(
          `https://www.dailymotion.com/player/metadata/video/${encodeURIComponent(rawDmId)}`,
          { signal: AbortSignal.timeout(3000) }
        ).catch(() => null);
        if (metaRes && metaRes.ok) {
          const metaJson = (await metaRes.json()) as {
            title?: string;
            posters?: Record<string, string>;
            qualities?: { auto?: Array<{ url?: string; type?: string }> };
          };
          const m3u8Url = metaJson?.qualities?.auto?.[0]?.url;
          if (m3u8Url && isSafeExternalHttpUrl(m3u8Url)) {
            const payload = {
              ok: true,
              kind: 'hls' as const,
              source: 'dailymotion' as const,
              videoId: rawDmId,
              title: metaJson?.title || cleanQ || rawDmId,
              thumbnail: metaJson?.posters?.['480'] || metaJson?.posters?.['720'] || '',
              streamUrl: m3u8Url,
              proxyUrl: `/api/video/hls?url=${encodeURIComponent(m3u8Url)}`,
            };
            detailCache.set(cacheKey, { expiresAt: Date.now() + 20 * 60 * 1000, data: payload });
            res.json(payload);
            return;
          }
        }
      }

      // 1. Dailymotion Search -> Player Metadata HLS (.m3u8 with lightweight 380p tier)
      const dmSearchUrl = `https://api.dailymotion.com/videos?search=${encodeURIComponent(
        cleanQ
      )}&fields=id,title,thumbnail_url,duration&limit=6&sort=relevance`;
      const dmRes = await fetch(dmSearchUrl, { signal: AbortSignal.timeout(3200) }).catch(() => null);
      if (dmRes && dmRes.ok) {
        const dmJson = (await dmRes.json()) as {
          list?: Array<{ id?: string; title?: string; thumbnail_url?: string; duration?: number }>;
        };
        const candidates = (dmJson.list || []).filter((v) => v?.id && v?.title && isRelevantTitle(v.title));
        for (const cand of candidates.slice(0, 3)) {
          const metaRes = await fetch(
            `https://www.dailymotion.com/player/metadata/video/${encodeURIComponent(cand.id!)}`,
            { signal: AbortSignal.timeout(2800) }
          ).catch(() => null);
          if (!metaRes || !metaRes.ok) continue;
          const metaJson = (await metaRes.json()) as {
            qualities?: { auto?: Array<{ url?: string; type?: string }> };
          };
          const m3u8Url = metaJson?.qualities?.auto?.[0]?.url;
          if (m3u8Url && isSafeExternalHttpUrl(m3u8Url)) {
            const payload = {
              ok: true,
              kind: 'hls' as const,
              source: 'dailymotion' as const,
              videoId: cand.id!,
              title: cand.title || cleanQ,
              thumbnail: cand.thumbnail_url || '',
              streamUrl: m3u8Url,
              proxyUrl: `/api/video/hls?url=${encodeURIComponent(m3u8Url)}`,
            };
            detailCache.set(cacheKey, { expiresAt: Date.now() + 20 * 60 * 1000, data: payload });
            res.json(payload);
            return;
          }
        }
      }

      // 2. Steam Store Official Game Trailer Fallback (direct 480p MP4 / HLS)
      const steamQuery = cleanQ.replace(/\btrailer\b/gi, '').trim() || cleanQ;
      const stSearch = await fetch(
        `https://store.steampowered.com/api/storesearch/?term=${encodeURIComponent(steamQuery)}&l=english&cc=US`,
        { signal: AbortSignal.timeout(2800) }
      ).catch(() => null);
      if (stSearch && stSearch.ok) {
        const stJson = (await stSearch.json()) as { items?: Array<{ id?: number; name?: string }> };
        const stItem = (stJson.items || []).find((it) => it?.id && it?.name && isRelevantTitle(it.name));
        if (stItem?.id) {
          const stDet = await fetch(
            `https://store.steampowered.com/api/appdetails?appids=${stItem.id}`,
            { signal: AbortSignal.timeout(2800) }
          ).catch(() => null);
          if (stDet && stDet.ok) {
            const stDetJson = (await stDet.json()) as Record<
              string,
              {
                data?: {
                  movies?: Array<{
                    name?: string;
                    thumbnail?: string;
                    mp4?: Record<string, string>;
                    hls_h264?: string;
                  }>;
                };
              }
            >;
            const movie = stDetJson?.[String(stItem.id)]?.data?.movies?.[0];
            const mp4Url = movie?.mp4?.['480'] || movie?.mp4?.max;
            const hlsUrl = movie?.hls_h264;
            if (mp4Url && isSafeExternalHttpUrl(mp4Url)) {
              const payload = {
                ok: true,
                kind: 'mp4' as const,
                source: 'steam' as const,
                videoId: String(stItem.id),
                title: movie?.name || stItem.name || cleanQ,
                thumbnail: movie?.thumbnail || '',
                streamUrl: mp4Url,
                proxyUrl: `/api/video/hls?url=${encodeURIComponent(mp4Url)}`,
              };
              detailCache.set(cacheKey, { expiresAt: Date.now() + 20 * 60 * 1000, data: payload });
              res.json(payload);
              return;
            }
            if (hlsUrl && isSafeExternalHttpUrl(hlsUrl)) {
              const payload = {
                ok: true,
                kind: 'hls' as const,
                source: 'steam' as const,
                videoId: String(stItem.id),
                title: movie?.name || stItem.name || cleanQ,
                thumbnail: movie?.thumbnail || '',
                streamUrl: hlsUrl,
                proxyUrl: `/api/video/hls?url=${encodeURIComponent(hlsUrl)}`,
              };
              detailCache.set(cacheKey, { expiresAt: Date.now() + 20 * 60 * 1000, data: payload });
              res.json(payload);
              return;
            }
          }
        }
      }

      const miss = { ok: false, kind: null, source: null, streamUrl: '', proxyUrl: '' };
      detailCache.set(cacheKey, { expiresAt: Date.now() + 10 * 60 * 1000, data: miss });
      res.json(miss);
    } catch {
      res.json({ ok: false, kind: null, source: null, streamUrl: '', proxyUrl: '' });
    }
  });

  // Bulk System Artwork & Trailer Scraper (Settings -> Scrape Artwork by System)
  app.post('/api/artwork/scrape-batch', async (req, res) => {
    const rawGames = Array.isArray(req.body?.games) ? req.body.games : [];
    const games = rawGames
      .slice(0, 35)
      .map((g: { id?: unknown; title?: unknown; platform?: unknown }) => ({
        id: String(g?.id ?? '').trim(),
        title: String(g?.title ?? '').trim(),
        platform: String(g?.platform ?? '').trim(),
      }))
      .filter((g: { id: string; title: string }) => g.id && g.title);

    if (games.length === 0) {
      res.json({ results: [] });
      return;
    }

    const cleanGameQuery = (title: string) =>
      title
        .replace(/\s*\([^)]*\)/g, '')
        .replace(/\s*\[[^\]]*\]/g, '')
        .replace(/\b(?:NSP|XCI|ROM|ISO|RVZ|APK|Switch|Download|Free|USA|Europe|Japan|Disc\s*\d+)\b/gi, '')
        .replace(/\s*[-–:|]\s*$/g, '')
        .replace(/\s+/g, ' ')
        .trim();

    const scrapeSingleGame = async (g: { id: string; title: string; platform: string }) => {
      const cleaned = cleanGameQuery(g.title);
      let coverUrl = '';
      let backgroundUrl = '';
      let summary = '';
      let youtubeVideoId = '';

      try {
        const searchUrl = `https://en.wikipedia.org/w/api.php?action=opensearch&search=${encodeURIComponent(
          `${cleaned} video game`
        )}&limit=1&namespace=0&format=json`;
        const srRes = await fetch(searchUrl, {
          signal: AbortSignal.timeout(3000),
          headers: { 'User-Agent': 'SkyLineOS3/1.0 (Handheld Pegasus Launcher)' },
        }).catch(() => null);
        let wikiTitle = cleaned;
        if (srRes && srRes.ok) {
          const srJson = (await srRes.json()) as [string, string[]];
          if (Array.isArray(srJson?.[1]) && srJson[1][0]) wikiTitle = srJson[1][0];
        }
        const sumRes = await fetch(
          `https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(wikiTitle.replace(/\s+/g, '_'))}`,
          {
            signal: AbortSignal.timeout(3500),
            headers: { 'User-Agent': 'SkyLineOS3/1.0', Accept: 'application/json' },
          }
        ).catch(() => null);
        if (sumRes && sumRes.ok) {
          const wiki = (await sumRes.json()) as {
            extract?: string;
            originalimage?: { source?: string };
            thumbnail?: { source?: string };
          };
          summary = wiki.extract || '';
          const rawThumb = wiki.thumbnail?.source || '';
          const hiRes =
            wiki.originalimage?.source ||
            (rawThumb ? rawThumb.replace(/\/\d+px-/, '/800px-') : '');
          if (hiRes) {
            coverUrl = `/api/feeds/image?url=${encodeURIComponent(hiRes)}`;
            backgroundUrl = coverUrl;
          }
        }
      } catch {
        // ignore wiki error
      }

      try {
        const ytRes = await fetch(
          `https://www.youtube.com/results?search_query=${encodeURIComponent(`${cleaned} gameplay trailer`)}`,
          {
            signal: AbortSignal.timeout(3000),
            headers: {
              'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/124.0 Safari/537.36',
              'Accept-Language': 'en-US,en;q=0.9',
            },
          }
        ).catch(() => null);
        if (ytRes && ytRes.ok) {
          const videos = extractYouTubeVideosFromHtml(await ytRes.text());
          const words = cleaned
            .toLowerCase()
            .replace(/[^a-z0-9\s]/g, ' ')
            .split(/\s+/)
            .filter((w) => w.length >= 3);
          const match = videos.slice(0, 5).find((v) => {
            const tl = v.title.toLowerCase();
            const overlap = words.filter((w) => tl.includes(w)).length;
            return overlap >= (words.length <= 1 ? 1 : Math.ceil(words.length * 0.5));
          });
          if (match?.videoId) {
            youtubeVideoId = match.videoId;
          }
        }
      } catch {
        // ignore yt error
      }

      return { id: g.id, coverUrl, backgroundUrl, youtubeVideoId, summary };
    };

    const results: Array<{
      id: string;
      coverUrl: string;
      backgroundUrl: string;
      youtubeVideoId: string;
      summary: string;
    }> = [];
    for (let i = 0; i < games.length; i += 4) {
      const chunk = games.slice(i, i + 4);
      const settled = await Promise.all(chunk.map(scrapeSingleGame));
      results.push(...settled);
    }

    res.json({ results });
  });

  // Dedicated Videos / YouTube Feed & Search API (Dailymotion playable HLS + YouTube fallback, strictly separate from Movies/Series)
  app.get('/api/youtube/feed', async (req, res) => {
    const q = String(req.query.q ?? '').trim() || 'Nintendo Switch 2 gameplay trailers';
    const key = `ytfeed:v2:${q.toLowerCase()}`;
    const cached = listCache.get(key);
    if (cached && cached.expiresAt > Date.now()) {
      res.json(cached.data);
      return;
    }
    try {
      const dmUrl = `https://api.dailymotion.com/videos?search=${encodeURIComponent(
        q
      )}&fields=id,title,thumbnail_720_url,thumbnail_url,duration,owner.screenname&limit=24&sort=relevance`;
      const [dmRes, ytRes] = await Promise.all([
        fetch(dmUrl, { signal: AbortSignal.timeout(4000) }).catch(() => null),
        fetch(`https://www.youtube.com/results?search_query=${encodeURIComponent(q)}`, {
          signal: AbortSignal.timeout(3500),
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/124.0 Safari/537.36',
            'Accept-Language': 'en-US,en;q=0.9',
          },
        }).catch(() => null),
      ]);

      const dmItems: Array<{
        id: string;
        postId: number;
        slug: string;
        title: string;
        mediaType: 'youtube';
        sourceProvider: 'youtube';
        overview: string;
        posterUrl: string;
        backdropUrl: string;
        rawPosterUrl: string;
        rawBackdropUrl: string;
        genres: string[];
        runtime?: string;
        embedUrl: string;
        previewEmbedUrl: string;
        pageUrl: string;
        channel: string;
      }> = [];

      if (dmRes && dmRes.ok) {
        const dmJson = (await dmRes.json()) as {
          list?: Array<{
            id?: string;
            title?: string;
            thumbnail_720_url?: string;
            thumbnail_url?: string;
            duration?: number;
            'owner.screenname'?: string;
          }>;
        };
        const dmList = Array.isArray(dmJson.list) ? dmJson.list : [];
        dmList.forEach((v, idx) => {
          if (!v?.id || !v?.title) return;
          const thumb = v.thumbnail_720_url || v.thumbnail_url || '';
          const mins = v.duration ? `${Math.max(1, Math.round(v.duration / 60))} min` : undefined;
          const ch = v['owner.screenname'] || 'Dailymotion';
          dmItems.push({
            id: `dm-${v.id}-${idx}`,
            postId: idx + 1,
            slug: `dm:${v.id}`,
            title: v.title,
            mediaType: 'youtube',
            sourceProvider: 'youtube',
            overview: `${ch} · Playable HD Video Stream`,
            posterUrl: thumb ? `/api/feeds/image?url=${encodeURIComponent(thumb)}` : '',
            backdropUrl: thumb ? `/api/feeds/image?url=${encodeURIComponent(thumb)}` : '',
            rawPosterUrl: thumb,
            rawBackdropUrl: thumb,
            genres: ['Videos', ch],
            runtime: mins,
            embedUrl: `/api/video/resolve?dmId=${encodeURIComponent(v.id)}&q=${encodeURIComponent(v.title)}`,
            previewEmbedUrl: `/api/video/resolve?dmId=${encodeURIComponent(v.id)}&q=${encodeURIComponent(v.title)}`,
            pageUrl: `https://www.dailymotion.com/video/${v.id}`,
            channel: ch,
          });
        });
      }

      if (dmItems.length > 0) {
        const payload = { items: dmItems, source: 'live' as const };
        listCache.set(key, { expiresAt: Date.now() + 10 * 60 * 1000, data: payload });
        res.json(payload);
        return;
      }

      if (ytRes && ytRes.ok) {
        const cards = extractYouTubeVideosFromHtml(await ytRes.text());
        if (cards.length > 0) {
          const items = cards.map((v, idx) => ({
            id: `yt-${v.videoId}-${idx}`,
            postId: idx + 1,
            slug: v.videoId,
            title: v.title,
            mediaType: 'youtube' as const,
            sourceProvider: 'youtube' as const,
            overview: `${v.channel} · Video Stream`,
            posterUrl: v.thumbnail,
            backdropUrl: v.thumbnail,
            rawPosterUrl: v.thumbnail,
            rawBackdropUrl: v.thumbnail,
            genres: ['Videos', v.channel],
            embedUrl: `/api/video/resolve?q=${encodeURIComponent(v.title)}`,
            previewEmbedUrl: `/api/video/resolve?q=${encodeURIComponent(v.title)}`,
            pageUrl: v.url,
            channel: v.channel,
          }));
          const payload = { items, source: 'live' as const };
          listCache.set(key, { expiresAt: Date.now() + 10 * 60 * 1000, data: payload });
          res.json(payload);
          return;
        }
      }
      throw new Error('No video results');
    } catch {
      const fallback = [
        {
          id: 'yt-fb-1',
          postId: 1,
          slug: '3pE23YTYEZM',
          title: 'Nintendo Switch 2 — Official Reveal Trailer',
          mediaType: 'youtube' as const,
          sourceProvider: 'youtube' as const,
          overview: 'Nintendo Official Channel · Hardware & First-Party Lineup',
          posterUrl: 'https://i.ytimg.com/vi/3pE23YTYEZM/hqdefault.jpg',
          backdropUrl: 'https://i.ytimg.com/vi/3pE23YTYEZM/hqdefault.jpg',
          rawPosterUrl: 'https://i.ytimg.com/vi/3pE23YTYEZM/hqdefault.jpg',
          rawBackdropUrl: 'https://i.ytimg.com/vi/3pE23YTYEZM/hqdefault.jpg',
          genres: ['Videos', 'Nintendo'],
          embedUrl: '/api/video/resolve?q=Nintendo%20Switch%202%20Reveal%20Trailer',
          previewEmbedUrl: '/api/video/resolve?q=Nintendo%20Switch%202%20Reveal%20Trailer',
          pageUrl: 'https://www.youtube.com/watch?v=3pE23YTYEZM',
          channel: 'Nintendo',
        },
        {
          id: 'yt-fb-2',
          postId: 2,
          slug: 'uHGShqcAHlQ',
          title: 'The Legend of Zelda: Tears of the Kingdom — Official Trailer',
          mediaType: 'youtube' as const,
          sourceProvider: 'youtube' as const,
          overview: 'Nintendo · Adventure Gameplay Showcase',
          posterUrl: 'https://i.ytimg.com/vi/uHGShqcAHlQ/hqdefault.jpg',
          backdropUrl: 'https://i.ytimg.com/vi/uHGShqcAHlQ/hqdefault.jpg',
          rawPosterUrl: 'https://i.ytimg.com/vi/uHGShqcAHlQ/hqdefault.jpg',
          rawBackdropUrl: 'https://i.ytimg.com/vi/uHGShqcAHlQ/hqdefault.jpg',
          genres: ['Videos', 'Nintendo'],
          embedUrl: '/api/video/resolve?q=Zelda%20Tears%20of%20the%20Kingdom%20Trailer',
          previewEmbedUrl: '/api/video/resolve?q=Zelda%20Tears%20of%20the%20Kingdom%20Trailer',
          pageUrl: 'https://www.youtube.com/watch?v=uHGShqcAHlQ',
          channel: 'Nintendo',
        },
      ];
      res.json({ items: fallback, source: 'fallback' });
    }
  });

  // Unified LaMovie (all 630+ pages) + Fanpelis.to Catalog API with Cross-Source Deduplication
  app.get('/api/lamovie/catalog', async (req, res) => {
    const rawSection = String(req.query.section ?? 'forMe'); // forMe | movies | series | categories | search
    const section =
      rawSection === 'movies' || rawSection === 'series' || rawSection === 'search' ? rawSection : 'forMe';
    const q = String(req.query.q ?? '').trim();
    const genreFilter = String(req.query.genre ?? '').trim().toLowerCase();
    const rawLetter = String(req.query.letter ?? 'All').trim();
    const letter = rawLetter === '#' ? '#' : /^[a-z]$/i.test(rawLetter) ? rawLetter.toUpperCase() : 'All';
    const page = Math.max(1, Number(req.query.page ?? 1) || 1);
    const pageSize = Math.max(1, Math.min(48, Number(req.query.limit ?? req.query.pageSize ?? 20) || 20));

    const key = `catalog:v2:${section}:${letter}:${page}:${pageSize}:${genreFilter}:${q.toLowerCase()}`;
    const cached = listCache.get(key);
    if (cached && cached.expiresAt > Date.now()) {
      res.json(cached.data);
      return;
    }

    const lmHeaders = {
      'User-Agent': 'Mozilla/5.0 (Linux; Android 13; Retroid Pocket 5) AppleWebKit/537.36',
      Referer: 'https://lamovie.org/',
      Accept: 'application/json',
    };
    const fpHeaders = {
      'User-Agent': 'Mozilla/5.0 (Linux; Android 13; Retroid Pocket 5) AppleWebKit/537.36',
      Referer: 'https://fanpelis.to/',
      Accept: 'application/json',
    };

    const fetchLaMovieJson = async (endpoint: string) => {
      const r = await fetch(`${LAMOVIE_API_BASE}${endpoint}`, {
        signal: AbortSignal.timeout(5500),
        headers: lmHeaders,
      });
      if (!r.ok) throw new Error(`LaMovie HTTP ${r.status}`);
      return r.json() as Promise<{
        data?: { posts?: unknown[]; pagination?: { last_page?: number; total?: number } };
      }>;
    };

    const fetchFanpelisJson = async (endpoint: string) => {
      const r = await fetch(`${FANPELIS_API_BASE}${endpoint}`, {
        signal: AbortSignal.timeout(5500),
        headers: fpHeaders,
      });
      if (!r.ok) throw new Error(`Fanpelis HTTP ${r.status}`);
      return r.json() as Promise<{
        data?: { posts?: unknown[]; pagination?: { last_page?: number; total?: number } };
      }>;
    };

    try {
      if (section === 'search' && q) {
        const [lmSearch, fpSearch] = await Promise.all([
          fetchLaMovieJson(`/search?q=${encodeURIComponent(q)}&postType=any&postsPerPage=30`).catch(() => null),
          fetchFanpelisJson(`/search?q=${encodeURIComponent(q)}&post_type=any&posts_per_page=30`).catch(() => null),
        ]);
        const lmItems = parseLaMoviePosts((lmSearch?.data?.posts || []) as never[], 'movies');
        const fpItems = parseFanpelisPosts((fpSearch?.data?.posts || []) as never[], 'movies');
        const merged = mergeAndDedupeMediaCatalog(lmItems, fpItems);
        const paged = filterAndPaginateLaMovieCatalog(merged, {
          letter,
          genre: genreFilter,
          q,
          page,
          pageSize,
        });
        const payload = {
          items: paged.items,
          totalCount: paged.totalCount,
          totalPages: paged.totalPages,
          page: paged.page,
          hasMore: paged.page < paged.totalPages,
          source: 'live' as const,
        };
        listCache.set(key, { expiresAt: Date.now() + 8 * 60 * 1000, data: payload });
        res.json(payload);
        return;
      }

      const genreIds = resolveSourceGenreIds(genreFilter);
      const lmGenreQ = genreIds.lamovieId ? `&genres=${genreIds.lamovieId}` : '';
      const fpGenreQ = genreIds.fanpelisId ? `&genres=${genreIds.fanpelisId}` : '';

      const fetchCombinedPage = async (targetPg: number) => {
        const perSource = section === 'forMe' ? 8 : Math.min(20, Math.max(12, Math.ceil(pageSize * 0.75)));
        if (section === 'movies') {
          const [lmRes, fpRes] = await Promise.all([
            fetchLaMovieJson(
              `/listing/movies?page=${targetPg}&postsPerPage=${perSource}&postType=movies&orderBy=latest&order=desc${lmGenreQ}`
            ).catch(() => null),
            fetchFanpelisJson(
              `/listing?page=${targetPg}&posts_per_page=${perSource}&post_type=movies&orderBy=latest&order=desc${fpGenreQ}`
            ).catch(() => null),
          ]);
          const lmPosts = parseLaMoviePosts((lmRes?.data?.posts || []) as never[], 'movies');
          const fpPosts = parseFanpelisPosts((fpRes?.data?.posts || []) as never[], 'movies');
          const lmLast = Number(lmRes?.data?.pagination?.last_page || 0);
          const fpLast = Number(fpRes?.data?.pagination?.last_page || 0);
          const lmTotal = Number(lmRes?.data?.pagination?.total || lmPosts.length);
          const fpTotal = Number(fpRes?.data?.pagination?.total || fpPosts.length);
          return {
            items: mergeAndDedupeMediaCatalog(lmPosts, fpPosts),
            lastPage: Math.max(1, lmLast, fpLast),
            total: lmTotal + fpTotal,
          };
        }

        if (section === 'series') {
          const [lmRes, fpRes] = await Promise.all([
            fetchLaMovieJson(
              `/listing/tvshows?page=${targetPg}&postsPerPage=${perSource}&postType=tvshows&orderBy=latest&order=desc${lmGenreQ}`
            ).catch(() => null),
            fetchFanpelisJson(
              `/listing?page=${targetPg}&posts_per_page=${perSource}&post_type=tvshows&orderBy=latest&order=desc${fpGenreQ}`
            ).catch(() => null),
          ]);
          const lmPosts = parseLaMoviePosts((lmRes?.data?.posts || []) as never[], 'tvshows');
          const fpPosts = parseFanpelisPosts((fpRes?.data?.posts || []) as never[], 'tvshows');
          const lmLast = Number(lmRes?.data?.pagination?.last_page || 0);
          const fpLast = Number(fpRes?.data?.pagination?.last_page || 0);
          const lmTotal = Number(lmRes?.data?.pagination?.total || lmPosts.length);
          const fpTotal = Number(fpRes?.data?.pagination?.total || fpPosts.length);
          return {
            items: mergeAndDedupeMediaCatalog(lmPosts, fpPosts),
            lastPage: Math.max(1, lmLast, fpLast),
            total: lmTotal + fpTotal,
          };
        }

        // 'forMe' mixes Movies + Series from BOTH LaMovie and Fanpelis seamlessly
        const [lmMov, lmSer, fpMov, fpSer] = await Promise.all([
          fetchLaMovieJson(
            `/listing/movies?page=${targetPg}&postsPerPage=${perSource}&postType=movies&orderBy=latest&order=desc${lmGenreQ}`
          ).catch(() => null),
          fetchLaMovieJson(
            `/listing/tvshows?page=${targetPg}&postsPerPage=${perSource}&postType=tvshows&orderBy=latest&order=desc${lmGenreQ}`
          ).catch(() => null),
          fetchFanpelisJson(
            `/listing?page=${targetPg}&posts_per_page=${perSource}&post_type=movies&orderBy=latest&order=desc${fpGenreQ}`
          ).catch(() => null),
          fetchFanpelisJson(
            `/listing?page=${targetPg}&posts_per_page=${perSource}&post_type=tvshows&orderBy=latest&order=desc${fpGenreQ}`
          ).catch(() => null),
        ]);
        const lmCombined = [
          ...parseLaMoviePosts((lmMov?.data?.posts || []) as never[], 'movies'),
          ...parseLaMoviePosts((lmSer?.data?.posts || []) as never[], 'tvshows'),
        ];
        const fpCombined = [
          ...parseFanpelisPosts((fpMov?.data?.posts || []) as never[], 'movies'),
          ...parseFanpelisPosts((fpSer?.data?.posts || []) as never[], 'tvshows'),
        ];
        const lmLast = Math.max(
          Number(lmMov?.data?.pagination?.last_page || 0),
          Number(lmSer?.data?.pagination?.last_page || 0)
        );
        const fpLast = Math.max(
          Number(fpMov?.data?.pagination?.last_page || 0),
          Number(fpSer?.data?.pagination?.last_page || 0)
        );
        const total =
          Number(lmMov?.data?.pagination?.total || 0) +
          Number(lmSer?.data?.pagination?.total || 0) +
          Number(fpMov?.data?.pagination?.total || 0) +
          Number(fpSer?.data?.pagination?.total || 0);
        return {
          items: mergeAndDedupeMediaCatalog(lmCombined, fpCombined),
          lastPage: Math.max(1, lmLast, fpLast),
          total: total || lmCombined.length + fpCombined.length,
        };
      };

      if (letter === 'All') {
        const batch = await fetchCombinedPage(page);
        const itemsOut = batch.items.slice(0, pageSize);
        const payload = {
          items: itemsOut.length > 0 ? itemsOut : LAMOVIE_FALLBACK_ITEMS,
          totalCount: batch.total || itemsOut.length,
          totalPages: batch.lastPage,
          page,
          hasMore: page < batch.lastPage,
          source: itemsOut.length > 0 ? ('live' as const) : ('fallback' as const),
        };
        listCache.set(key, { expiresAt: Date.now() + 8 * 60 * 1000, data: payload });
        res.json(payload);
        return;
      }

      // A-Z Letter filter: scan a rolling batch of live pages across both sources
      const scanPages = [1, 2, 3, 4, 5, 6, 7, 8];
      const batches = await Promise.all(scanPages.map((pg) => fetchCombinedPage(pg).catch(() => null)));
      const rawAll = batches.flatMap((b) => (b ? b.items : []));
      const dedupedPool = mergeAndDedupeMediaCatalog(
        rawAll.filter((x) => x.sourceProvider !== 'fanpelis'),
        rawAll.filter((x) => x.sourceProvider === 'fanpelis')
      );
      const paged = filterAndPaginateLaMovieCatalog(dedupedPool, {
        letter,
        page,
        pageSize,
      });
      const payload = {
        items: paged.items,
        totalCount: paged.totalCount,
        totalPages: paged.totalPages,
        page: paged.page,
        hasMore: paged.page < paged.totalPages,
        source: 'live' as const,
      };
      listCache.set(key, { expiresAt: Date.now() + 8 * 60 * 1000, data: payload });
      res.json(payload);
    } catch {
      const fb = LAMOVIE_FALLBACK_ITEMS.filter((item) => {
        if (section === 'movies') return item.mediaType === 'movies';
        if (section === 'series') return item.mediaType === 'tvshows';
        if (q) return item.title.toLowerCase().includes(q.toLowerCase());
        return true;
      });
      const paged = filterAndPaginateLaMovieCatalog(fb.length > 0 ? fb : LAMOVIE_FALLBACK_ITEMS, {
        letter,
        genre: genreFilter,
        q,
        page,
        pageSize,
      });
      res.json({
        items: paged.items,
        totalCount: paged.totalCount,
        totalPages: paged.totalPages,
        page: paged.page,
        hasMore: false,
        source: 'fallback',
      });
    }
  });

  app.get('/api/lamovie/detail', async (req, res) => {
    const postId = Number(req.query.id ?? 0);
    const slug = String(req.query.slug ?? '').trim();
    const provider = String(req.query.provider ?? 'lamovie').trim().toLowerCase();
    const altProvider = String(req.query.altProvider ?? '').trim().toLowerCase();
    const altId = Number(req.query.altId ?? 0) || 0;
    const altSlug = String(req.query.altSlug ?? '').trim();
    const mediaType = String(req.query.type ?? 'movies') === 'tvshows' ? 'tvshows' : 'movies';
    const season = Math.max(1, Number(req.query.season ?? 1) || 1);
    const requestedEpisodeId = Number(req.query.episodeId ?? 0) || 0;
    if (!postId && !slug) {
      res.status(400).json({ error: 'Missing id or slug' });
      return;
    }

    const lmHeaders = {
      'User-Agent': 'Mozilla/5.0 (Linux; Android 13; Retroid Pocket 5) AppleWebKit/537.36',
      Referer: 'https://lamovie.org/',
      Accept: 'application/json',
    };
    const fpHeaders = {
      'User-Agent': 'Mozilla/5.0 (Linux; Android 13; Retroid Pocket 5) AppleWebKit/537.36',
      Referer: 'https://fanpelis.to/',
      Accept: 'application/json',
    };

    interface DetailBundle {
      id: number;
      overview: string;
      trailer: string;
      seasons: number[];
      episodes: Array<{ _id: number; title: string; overview?: string }>;
      embeds: Array<{ url: string; server?: string; quality?: string; language?: string }>;
    }

    const fetchLaMovieBundle = async (
      targetId: number,
      targetSlug: string,
      fetchEpisodes: boolean
    ): Promise<DetailBundle> => {
      let resolvedId = targetId;
      let singleData: Record<string, unknown> = {};
      if (targetSlug) {
        const sRes = await fetch(
          `${LAMOVIE_API_BASE}/single/${mediaType}?slug=${encodeURIComponent(targetSlug)}&postType=${mediaType}`,
          { signal: AbortSignal.timeout(4500), headers: lmHeaders }
        ).catch(() => null);
        if (sRes && sRes.ok) {
          const sJson = (await sRes.json()) as { data?: Record<string, unknown> };
          if (sJson?.data) {
            singleData = sJson.data;
            if (!resolvedId && typeof sJson.data._id === 'number') resolvedId = sJson.data._id;
          }
        }
      }

      let episodes: Array<{ _id: number; title: string; overview?: string }> = [];
      let seasons: number[] = [];
      let playerTargetId = requestedEpisodeId || resolvedId;

      if (fetchEpisodes && mediaType === 'tvshows' && resolvedId) {
        const epRes = await fetch(
          `${LAMOVIE_API_BASE}/single/episodes/list?_id=${resolvedId}&season=${season}&page=1&postsPerPage=60`,
          { signal: AbortSignal.timeout(4500), headers: lmHeaders }
        ).catch(() => null);
        if (epRes && epRes.ok) {
          const epJson = (await epRes.json()) as {
            data?: {
              posts?: Array<{ _id: number; title: string; overview?: string }>;
              seasons?: Array<number | string>;
            };
          };
          episodes = epJson?.data?.posts || [];
          const rawSeasons = Array.isArray(epJson?.data?.seasons)
            ? epJson.data.seasons
            : Array.isArray(singleData?.seasons)
              ? (singleData.seasons as Array<number | string>)
              : typeof singleData?.number_of_seasons === 'number'
                ? Array.from({ length: Number(singleData.number_of_seasons) }, (_, i) => i + 1)
                : [];
          seasons = Array.from(
            new Set(rawSeasons.map((s) => Number(s)).filter((n) => Number.isFinite(n) && n >= 1))
          ).sort((a, b) => a - b);
          if (seasons.length === 0 && (episodes.length > 0 || season > 1)) seasons = [season];
          if (!requestedEpisodeId && episodes[0]?._id) playerTargetId = episodes[0]._id;
        }
      }

      let embeds: Array<{ url: string; server?: string; quality?: string; language?: string }> = [];
      if (playerTargetId) {
        const pRes = await fetch(`${LAMOVIE_API_BASE}/player?postId=${playerTargetId}&demo=0`, {
          signal: AbortSignal.timeout(4500),
          headers: lmHeaders,
        }).catch(() => null);
        if (pRes && pRes.ok) {
          const pJson = (await pRes.json()) as {
            data?: { embeds?: Array<{ url: string; server?: string; quality?: string; language?: string }> };
          };
          embeds = (pJson?.data?.embeds || [])
            .filter((e) => Boolean(e?.url))
            .map((e) => ({ ...e, server: e.server || 'LaMovie' }));
        }
      }

      return {
        id: resolvedId,
        overview: String(singleData.overview || ''),
        trailer: String(singleData.trailer || ''),
        seasons,
        episodes,
        embeds,
      };
    };

    const fetchFanpelisBundle = async (
      targetId: number,
      targetSlug: string,
      fetchEpisodes: boolean
    ): Promise<DetailBundle> => {
      let resolvedId = targetId;
      let singleData: Record<string, unknown> = {};
      if (resolvedId) {
        const sRes = await fetch(`${FANPELIS_API_BASE}/single?post_id=${resolvedId}`, {
          signal: AbortSignal.timeout(4500),
          headers: fpHeaders,
        }).catch(() => null);
        if (sRes && sRes.ok) {
          const sJson = (await sRes.json()) as { data?: Record<string, unknown> };
          if (sJson?.data) singleData = sJson.data;
        }
      } else if (targetSlug) {
        const sr = await fetch(
          `${FANPELIS_API_BASE}/search?q=${encodeURIComponent(targetSlug.replace(/-/g, ' '))}&post_type=any&posts_per_page=10`,
          { signal: AbortSignal.timeout(4500), headers: fpHeaders }
        ).catch(() => null);
        if (sr && sr.ok) {
          const srJson = (await sr.json()) as { data?: { posts?: Array<{ _id?: number; slug?: string; overview?: string }> } };
          const hit = (srJson?.data?.posts || []).find((p) => p.slug === targetSlug) || srJson?.data?.posts?.[0];
          if (hit?._id) {
            resolvedId = Number(hit._id);
            singleData = hit as Record<string, unknown>;
          }
        }
      }

      let episodes: Array<{ _id: number; title: string; overview?: string }> = [];
      let seasons: number[] = [];
      let playerTargetId = requestedEpisodeId || resolvedId;

      if (fetchEpisodes && mediaType === 'tvshows' && resolvedId) {
        const epRes = await fetch(`${FANPELIS_API_BASE}/episodes?post_id=${resolvedId}`, {
          signal: AbortSignal.timeout(4500),
          headers: fpHeaders,
        }).catch(() => null);
        if (epRes && epRes.ok) {
          const epJson = (await epRes.json()) as {
            data?: Array<{
              _id?: number;
              title?: string;
              season_number?: string | number;
              episode_number?: string | number;
              overview?: string;
            }>;
          };
          const allEps = Array.isArray(epJson?.data) ? epJson.data : [];
          seasons = Array.from(
            new Set(allEps.map((e) => Number(e.season_number)).filter((n) => Number.isFinite(n) && n >= 1))
          ).sort((a, b) => a - b);
          const targetSeason = seasons.includes(season) ? season : seasons[0] || season;
          episodes = allEps
            .filter((e) => Number(e.season_number || 1) === targetSeason)
            .sort((a, b) => Number(a.episode_number || 0) - Number(b.episode_number || 0))
            .map((e) => ({
              _id: Number(e._id),
              title: String(e.title || `Episodio ${e.episode_number || ''}`),
              overview: e.overview ? String(e.overview) : undefined,
            }));
          if (!requestedEpisodeId && episodes[0]?._id) {
            playerTargetId = episodes[0]._id;
          }
        }
      }

      let embeds: Array<{ url: string; server?: string; quality?: string; language?: string }> = [];
      if (playerTargetId) {
        const pRes = await fetch(`${FANPELIS_API_BASE}/player?post_id=${playerTargetId}&_any=1`, {
          signal: AbortSignal.timeout(4500),
          headers: fpHeaders,
        }).catch(() => null);
        if (pRes && pRes.ok) {
          const pJson = (await pRes.json()) as {
            data?: {
              embeds?: Array<{ url?: string; server?: string; quality?: string; lang?: string; language?: string }>;
            };
          };
          embeds = (pJson?.data?.embeds || [])
            .filter((e) => Boolean(e?.url))
            .map((e) => ({
              url: String(e.url),
              server: e.server || 'Fanpelis',
              quality: e.quality,
              language: e.language || e.lang,
            }));
        }
      }

      return {
        id: resolvedId,
        overview: String(singleData.overview || ''),
        trailer: String(singleData.trailer || ''),
        seasons,
        episodes,
        embeds,
      };
    };

    try {
      const primaryIsFanpelis = provider === 'fanpelis';
      const primaryPromise = primaryIsFanpelis
        ? fetchFanpelisBundle(postId, slug, true)
        : fetchLaMovieBundle(postId, slug, true);

      const altPromise =
        altId && (altProvider === 'fanpelis' || altProvider === 'lamovie')
          ? altProvider === 'fanpelis'
            ? fetchFanpelisBundle(altId, altSlug, false)
            : fetchLaMovieBundle(altId, altSlug, false)
          : Promise.resolve(null);

      const [primary, alt] = await Promise.all([primaryPromise, altPromise]);

      // Fallback if primary episodes empty & alt has seasons/episodes
      let seasonsOut = primary.seasons;
      let episodesOut = primary.episodes;
      if (mediaType === 'tvshows' && episodesOut.length === 0 && altId && (altProvider === 'fanpelis' || altProvider === 'lamovie')) {
        const altWithEps =
          altProvider === 'fanpelis'
            ? await fetchFanpelisBundle(altId, altSlug, true)
            : await fetchLaMovieBundle(altId, altSlug, true);
        if (altWithEps.episodes.length > 0) {
          episodesOut = altWithEps.episodes;
          seasonsOut = altWithEps.seasons;
        }
      }

      const seenUrls = new Set<string>();
      const combinedEmbeds = [...primary.embeds, ...(alt?.embeds || [])].filter((e) => {
        const clean = e.url.split('?')[0];
        if (seenUrls.has(clean)) return false;
        seenUrls.add(clean);
        return true;
      });
      combinedEmbeds.sort((a, b) => {
        const aDirect = /vimeos\.net/i.test(a.url) ? 0 : 1;
        const bDirect = /vimeos\.net/i.test(b.url) ? 0 : 1;
        return aDirect - bDirect;
      });

      res.json({
        id: primary.id || postId,
        slug,
        mediaType,
        overview: primary.overview || alt?.overview || '',
        trailer: primary.trailer || alt?.trailer || '',
        embeds: combinedEmbeds,
        seasons: seasonsOut.length > 0 ? seasonsOut : [1],
        currentSeason: season,
        episodes: episodesOut,
        embedUrl: combinedEmbeds[0]?.url || '',
      });
    } catch {
      res.json({ id: postId, slug, mediaType, embeds: [], seasons: [1], currentSeason: season, episodes: [], embedUrl: '' });
    }
  });

  // Fast direct HLS (.m3u8) / MP4 stream extractor for LaMovie & Fanpelis / vimeos.net
  app.get('/api/lamovie/stream', async (req, res) => {
    const rawUrl = String(req.query.url ?? '').trim();
    if (!isSafeExternalHttpUrl(rawUrl)) {
      res.status(400).json({ ok: false, error: 'Invalid URL' });
      return;
    }

    const fetchPage = async (targetUrl: string, referer: string) => {
      const r = await fetch(targetUrl, {
        signal: AbortSignal.timeout(6500),
        redirect: 'follow',
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/124.0 Safari/537.36',
          Referer: referer,
          Accept: 'text/html,application/xhtml+xml,*/*;q=0.8',
        },
      });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      return { finalUrl: r.url || targetUrl, html: await r.text() };
    };

    try {
      let target = rawUrl;
      if (/vimeos\.net\/embed-.*\.html\?/i.test(target)) {
        target = target.split('?')[0];
      }
      const isDirectEmbedHost = /(bysedikamoum\.com|mega\.nz\/embed|youtube\.com\/embed|voe\.sx|doodstream\.com)/i.test(target);
      const initialReferer = /fanpelis/i.test(String(req.query.provider ?? ''))
        ? 'https://fanpelis.to/'
        : 'https://lamovie.org/';
      let { finalUrl, html } = await fetchPage(target, initialReferer);
      const unwrapped = extractUnwrappedLaMovieEmbedUrl(html);
      if (unwrapped && isSafeExternalHttpUrl(unwrapped)) {
        const inner = await fetchPage(unwrapped, finalUrl);
        finalUrl = inner.finalUrl;
        html = inner.html;
      }
      const extracted = extractDirectStreamFromVimeosHtml(html);
      if (extracted && isSafeExternalHttpUrl(extracted.streamUrl)) {
        res.json({
          ok: true,
          kind: extracted.kind,
          streamUrl: extracted.streamUrl,
          proxyHlsUrl: `/api/lamovie/hls?url=${encodeURIComponent(extracted.streamUrl)}`,
          embedProxyUrl: isDirectEmbedHost ? rawUrl : `/api/lamovie/embed?url=${encodeURIComponent(rawUrl)}`,
        });
        return;
      }
      res.json({
        ok: false,
        embedProxyUrl: isDirectEmbedHost ? rawUrl : `/api/lamovie/embed?url=${encodeURIComponent(rawUrl)}`,
      });
    } catch {
      const isDirectEmbedHost = /(bysedikamoum\.com|mega\.nz\/embed|youtube\.com\/embed|voe\.sx|doodstream\.com)/i.test(rawUrl);
      res.json({
        ok: false,
        embedProxyUrl: isDirectEmbedHost ? rawUrl : `/api/lamovie/embed?url=${encodeURIComponent(rawUrl)}`,
      });
    }
  });

  // Unified Reverse Proxy for .m3u8 playlists, TS/fMP4 video chunks & MP4 streams (Dailymotion, vimeos.net, Steam)
  const handleHlsOrVideoProxy = async (req: express.Request, res: express.Response, routePath: '/api/lamovie/hls' | '/api/video/hls') => {
    const rawUrl = String(req.query.url ?? '').trim();
    if (!isSafeExternalHttpUrl(rawUrl)) {
      res.status(400).end();
      return;
    }
    try {
      const parsed = new URL(rawUrl);
      const host = parsed.hostname.toLowerCase();
      const headers: Record<string, string> = {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/124.0 Safari/537.36',
      };
      if (host.includes('vimeos')) {
        headers.Referer = 'https://vimeos.net/';
        headers.Origin = 'https://vimeos.net';
      } else if (host.includes('dailymotion') || host.includes('dmcdn')) {
        headers.Referer = 'https://www.dailymotion.com/';
        headers.Origin = 'https://www.dailymotion.com';
      } else if (host.includes('steamstatic')) {
        headers.Referer = 'https://store.steampowered.com/';
      }
      const upstream = await fetch(parsed.toString(), {
        signal: AbortSignal.timeout(10000),
        redirect: 'follow',
        headers,
      });
      if (!upstream.ok) {
        res.status(upstream.status).end();
        return;
      }
      const finalUrl = upstream.url || parsed.toString();
      const ct = (upstream.headers.get('content-type') || '').toLowerCase();
      res.setHeader('Access-Control-Allow-Origin', '*');
      if (
        ct.includes('mpegurl') ||
        ct.includes('m3u8') ||
        /\.m3u8(\?|$)/i.test(finalUrl)
      ) {
        const playlist = await upstream.text();
        const rewritten = playlist
          .split(/\r?\n/)
          .map((line) => {
            const trimmed = line.trim();
            if (!trimmed) return line;
            if (trimmed.startsWith('#')) {
              return line.replace(/URI="([^"]+)"/gi, (_m, uri) => {
                try {
                  const abs = new URL(uri, finalUrl).toString();
                  return `URI="${routePath}?url=${encodeURIComponent(abs)}"`;
                } catch {
                  return _m;
                }
              });
            }
            try {
              const abs = new URL(trimmed, finalUrl).toString();
              return `${routePath}?url=${encodeURIComponent(abs)}`;
            } catch {
              return line;
            }
          })
          .join('\n');
        res.setHeader('Content-Type', 'application/vnd.apple.mpegurl; charset=utf-8');
        res.setHeader('Cache-Control', 'no-store');
        res.send(rewritten);
        return;
      }
      res.setHeader('Content-Type', ct || 'video/mp2t');
      const buf = Buffer.from(await upstream.arrayBuffer());
      res.send(buf);
    } catch {
      res.status(502).end();
    }
  };

  app.get('/api/lamovie/hls', (req, res) => {
    void handleHlsOrVideoProxy(req, res, '/api/lamovie/hls');
  });

  app.get('/api/video/hls', (req, res) => {
    void handleHlsOrVideoProxy(req, res, '/api/video/hls');
  });

  // Clean in-app player endpoint for LaMovie embeds (unwraps videoapp.zip & removes SANDBOX DETECTADO blockers)
  app.get('/api/lamovie/embed', async (req, res) => {
    const rawUrl = String(req.query.url ?? '').trim();
    if (!isSafeExternalHttpUrl(rawUrl)) {
      res.status(400).send('Invalid embed URL');
      return;
    }

    const fetchEmbedHtml = async (targetUrl: string, referer: string) => {
      const upstream = await fetch(targetUrl, {
        signal: AbortSignal.timeout(8000),
        redirect: 'follow',
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/124.0 Safari/537.36',
          Referer: referer,
          Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
          'Accept-Language': 'es-MX,es;q=0.9,en;q=0.8',
        },
      });
      if (!upstream.ok) {
        throw new Error(`HTTP ${upstream.status}`);
      }
      return {
        finalUrl: upstream.url || targetUrl,
        html: await upstream.text(),
      };
    };

    try {
      let target = rawUrl;
      if (/vimeos\.net\/embed-.*\.html\?/i.test(target)) {
        target = target.split('?')[0];
      }
      let { finalUrl, html } = await fetchEmbedHtml(target, 'https://lamovie.org/');
      const unwrapped = extractUnwrappedLaMovieEmbedUrl(html);
      if (unwrapped && isSafeExternalHttpUrl(unwrapped)) {
        const inner = await fetchEmbedHtml(unwrapped, finalUrl);
        finalUrl = inner.finalUrl;
        html = inner.html;
      }

      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      res.setHeader('Cache-Control', 'no-store');
      res.send(rewriteLaMovieEmbedHtml(html, finalUrl));
    } catch {
      res.status(502).send(
        `<!doctype html><html><body style="margin:0;height:100vh;display:flex;flex-direction:column;align-items:center;justify-content:center;background:#0b0b0f;color:#fff;font-family:sans-serif;text-align:center;padding:24px;"><p style="margin:0 0 14px;font-size:16px;">Stream embed unavailable in preview.</p><a href="${rawUrl.replace(/"/g, '&quot;')}" target="_blank" rel="noopener noreferrer" style="padding:10px 18px;border-radius:8px;background:#E50914;color:#fff;text-decoration:none;font-weight:700;">Open External Player</a></body></html>`
      );
    }
  });

  // Live APKPorts.com / NSWPedia / SwitchsROM / Archive.org / Vimm's Vault Game Detail endpoint
  app.get('/api/apkports/game/:slug', async (req, res) => {
    const slug = String(req.params.slug || '').trim();
    if (!slug) {
      res.status(400).json({ error: 'Missing slug' });
      return;
    }

    if (slug.startsWith('archive-')) {
      const archCached = (listCache.get('raw:archive:gc_psp') as CacheEntry<ApkpGameSummary[]> | undefined)?.data ?? [];
      const archMatch = [...archCached, ...ARCHIVE_FALLBACK_CATALOG].find((g) => g.slug === slug);
      if (archMatch) {
        res.json({
          ...archMatch,
          requirements: `${archMatch.system || 'Retro'} Verified Dump · Internet Archive`,
          developer: 'Internet Archive Collection',
          releaseDate: 'Classic Archive',
          screenshots: [archMatch.coverUrl],
          sourceUrl: archMatch.pageUrl || ARCHIVE_GAMECUBE_URL,
          pageUrl: archMatch.pageUrl || ARCHIVE_GAMECUBE_URL,
          downloadUrl: archMatch.downloadUrl || archMatch.pageUrl || ARCHIVE_GAMECUBE_URL,
        });
        return;
      }
    }

    const nswCached = (listCache.get('raw:nswpedia') as CacheEntry<ApkpGameSummary[]> | undefined)?.data ?? [];
    const nswMatch = [...nswCached, ...NSWPEDIA_FALLBACK_CATALOG].find((g) => g.slug === slug);
    if (nswMatch) {
      const targetPage = nswMatch.pageUrl || nswMatch.downloadUrl || `${NSWPEDIA_ORIGIN}/`;
      res.json({
        ...nswMatch,
        requirements: 'Nintendo Switch (NSP/XCI) · Eden Emulator Direct Boot Supported',
        developer: 'Nintendo Switch Library',
        releaseDate: '2026',
        screenshots: [nswMatch.coverUrl],
        sourceUrl: targetPage,
        pageUrl: targetPage,
        downloadUrl: targetPage,
      });
      return;
    }

    const sromCached = (listCache.get('raw:switchsrom') as CacheEntry<ApkpGameSummary[]> | undefined)?.data ?? [];
    const sromMatch = [...sromCached, ...SWITCHSROM_FALLBACK_CATALOG].find((g) => g.slug === slug);
    if (sromMatch || slug.startsWith('srom-') || slug.startsWith('swr-')) {
      const m = sromMatch ?? SWITCHSROM_FALLBACK_CATALOG[0];
      const targetPage = m.pageUrl || m.downloadUrl || `${SWITCHSROM_ORIGIN}/roms/`;
      res.json({
        ...m,
        requirements: 'Nintendo Switch (NSP/XCI) · SwitchsROM Library',
        developer: 'SwitchsROM Release',
        releaseDate: '2026',
        screenshots: [m.coverUrl],
        sourceUrl: targetPage,
        pageUrl: targetPage,
        downloadUrl: targetPage,
      });
      return;
    }

    if (slug.startsWith('vimm-')) {
      let vimmMatch: ApkpGameSummary | undefined;
      for (const [k, v] of listCache.entries()) {
        if (k.startsWith('raw:vimm:') && Array.isArray(v.data)) {
          const hit = (v.data as ApkpGameSummary[]).find((g) => g.slug === slug);
          if (hit) { vimmMatch = hit; break; }
        }
      }
      if (!vimmMatch) vimmMatch = VIMM_FALLBACK_CATALOG.find((g) => g.slug === slug);
      const idMatch = slug.match(/(\d+)$/);
      const vPage = vimmMatch?.pageUrl || (idMatch ? `${VIMM_ORIGIN}/vault/${idMatch[1]}` : `${VIMM_ORIGIN}/vault`);
      const vImg = idMatch
        ? `/api/apkports/image?url=${encodeURIComponent(`${VIMM_ORIGIN}/image.php?type=box&id=${idMatch[1]}`)}`
        : vimmMatch?.coverUrl || '';
      res.json({
        ...(vimmMatch ?? {
          id: slug,
          slug,
          title: slug.replace(/^vimm-[^-]+-/, 'Vault #'),
          coverUrl: vImg,
          rawImageUrl: vImg,
          version: 'Emulator ROM',
          portType: 'official' as const,
          categories: ['Retro ROM'],
          franchises: ["Vimm's Vault"],
          sourceSite: 'vimm' as const,
        }),
        requirements: 'RetroArch / Standalone Emulator · Vimm’s Lair Verified Dump',
        developer: "Vimm's Lair Vault",
        releaseDate: 'Classic Vault',
        screenshots: vImg ? [vImg] : [],
        sourceUrl: vPage,
        pageUrl: vPage,
        downloadUrl: vPage,
      });
      return;
    }

    const cached = detailCache.get(slug);
    if (cached && cached.expiresAt > Date.now()) {
      res.json(cached.data);
      return;
    }

    try {
      const upstream = await fetch(`${APKP_ORIGIN}/game/${encodeURIComponent(slug)}`, {
        signal: AbortSignal.timeout(2500),
        headers: {
          'User-Agent': 'Mozilla/5.0 (Linux; Android 13; Retroid Pocket 5) AppleWebKit/537.36',
          Accept: 'text/html,application/xhtml+xml',
        },
      });
      if (!upstream.ok) {
        throw new Error(`Status ${upstream.status}`);
      }
      const html = await upstream.text();
      const detail = parseApkPortsDetailHtml(html, slug);
      if (!detail) {
        throw new Error('Could not parse detail');
      }
      detailCache.set(slug, {
        expiresAt: Date.now() + 10 * 60 * 1000,
        data: detail,
      });
      res.json(detail);
    } catch {
      const apkpCached = (listCache.get('raw:apkports') as CacheEntry<ApkpGameSummary[]> | undefined)?.data ?? [];
      const fb = [...apkpCached, ...APKP_FALLBACK_CATALOG].find((g) => g.slug === slug) ?? APKP_FALLBACK_CATALOG[0];
      const pageUrl = `${APKP_ORIGIN}/game/${encodeURIComponent(slug)}`;
      res.json({
        ...fb,
        description:
          fb.description ||
          `${fb.title} — Complete Android handheld release available via APKPorts.com with full controller support.`,
        requirements: 'Android 10+ · Gamepad / RP5 Controls Supported',
        developer: fb.franchises[0] || 'APKPorts Community',
        releaseDate: '2026',
        screenshots: [fb.coverUrl],
        sourceUrl: pageUrl,
        pageUrl,
        downloadUrl: pageUrl,
        videoUrl: fb.videoUrl,
      });
    }
  });

  // Allowlisted Image Proxy for APKPorts, NSWPedia, SwitchsROM & Vimm's Vault thumbnails
  app.get('/api/apkports/image', async (req, res) => {
    const rawUrl = String(req.query.url ?? '');
    let parsedUrl: URL;
    try {
      parsedUrl = new URL(rawUrl);
    } catch {
      res.setHeader('Content-Type', 'image/svg+xml');
      res.send(FALLBACK_COVER_SVG);
      return;
    }

    if (!['https:', 'http:'].includes(parsedUrl.protocol) || !ALLOWED_IMAGE_HOSTS.has(parsedUrl.hostname)) {
      res.setHeader('Content-Type', 'image/svg+xml');
      res.send(FALLBACK_COVER_SVG);
      return;
    }

    try {
      const upstream = await fetch(parsedUrl.toString(), {
        signal: AbortSignal.timeout(4000),
        headers: {
          'User-Agent': 'Mozilla/5.0 (Linux; Android 13; Retroid Pocket 5) AppleWebKit/537.36',
          Referer: `${parsedUrl.origin}/`,
        },
      });
      if (!upstream.ok) {
        res.setHeader('Content-Type', 'image/svg+xml');
        res.send(FALLBACK_COVER_SVG);
        return;
      }
      const contentType = upstream.headers.get('content-type') || 'image/webp';
      const arrayBuf = await upstream.arrayBuffer();
      res.setHeader('Content-Type', contentType);
      res.setHeader('Cache-Control', 'public, max-age=86400');
      res.send(Buffer.from(arrayBuf));
    } catch {
      res.setHeader('Content-Type', 'image/svg+xml');
      res.send(FALLBACK_COVER_SVG);
    }
  });

  // Live RSS Feed Endpoints for Nintendo Online & General News Sections
  app.get('/api/feeds/nso', async (req, res) => {
    const rawCat = String(req.query.category || 'nintendo') as NsoCategoryId;
    const category: NsoCategoryId = rawCat in NEWS_FALLBACK_BY_CATEGORY ? rawCat : 'nintendo';
    const refresh = req.query.refresh === '1';
    const page = Math.max(1, Number(req.query.page ?? 1) || 1);
    const chunkSize = 12;

    const cacheKey = `nso:${category}`;
    const cached = !refresh ? feedCache.get(cacheKey) : undefined;
    if (cached && cached.expiresAt > Date.now()) {
      const start = (page - 1) * chunkSize;
      const slice = cached.data.slice(start, start + chunkSize);
      res.json({
        items: slice.length > 0 ? slice : cached.data.slice(0, chunkSize),
        source: 'cache',
        page,
        hasMore: cached.data.length > start + chunkSize,
      });
      return;
    }
    try {
      const sources =
        category === 'nintendo'
          ? NSO_RSS_SOURCES
          : NSO_RSS_BY_CATEGORY[category] || NSO_RSS_SOURCES;
      const results = await Promise.allSettled(
        sources.map(async (src) => {
          const r = await fetch(src.url, {
            signal: AbortSignal.timeout(2600),
            headers: {
              'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/124.0 Safari/537.36',
              Accept: 'application/rss+xml, application/xml, text/xml',
            },
          });
          if (!r.ok) throw new Error(`HTTP ${r.status}`);
          const xml = await r.text();
          return parseRssOrAtomXml(xml, src.name, category, src.colors).slice(0, 14);
        })
      );
      const merged: NewsFeedItem[] = [];
      for (const r of results) {
        if (r.status === 'fulfilled') merged.push(...r.value);
      }
      if (merged.length === 0) throw new Error('No live NSO items');
      // Interleave sources so Nintendo Life / YouTube / Nintendo Everything appear evenly,
      // and enrich any items missing an authentic photo with og:image / YouTube video lookup.
      const enrichAndFilterNewsItems = async (rawItems: NewsFeedItem[]) => {
        const candidates = rawItems.slice(0, 36);
        await Promise.allSettled(
          candidates.slice(0, 18).map(async (item) => {
            const needsMedia = !item.imageUrl && !item.videoUrl;
            const needsFullText = (item.content || '').length < 150;
            if ((needsMedia || needsFullText) && item.url.startsWith('http')) {
              try {
                const pageRes = await fetch(item.url, {
                  signal: AbortSignal.timeout(2200),
                  headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/124.0',
                    Accept: 'text/html,application/xhtml+xml',
                  },
                });
                if (pageRes.ok) {
                  const html = await pageRes.text();
                  const ext = extractArticleContentHtml(html, item.url);
                  if (!item.imageUrl && ext.heroImageUrl) item.imageUrl = ext.heroImageUrl;
                  if (!item.videoUrl && ext.videoUrl) item.videoUrl = ext.videoUrl;
                  if (ext.paragraphs.length > 0) {
                    const joined = ext.paragraphs.join('\n\n');
                    if (joined.length > (item.content || '').length) {
                      item.content = joined;
                      item.summary =
                        ext.paragraphs[0].length > 180
                          ? `${ext.paragraphs[0].slice(0, 177).trim()}...`
                          : ext.paragraphs[0];
                    }
                  }
                }
              } catch {
                // ignore timeout
              }
            }
          })
        );
        return candidates.filter((item) => {
          const hasMedia = Boolean((item.imageUrl && item.imageUrl.trim()) || (item.videoUrl && item.videoUrl.trim()));
          const body = (item.content || item.summary || '').trim();
          const hasCompleteText = body.length >= 24 && !/full coverage available at/i.test(body);
          return hasMedia && hasCompleteText;
        });
      };

      const fullList = await enrichAndFilterNewsItems(merged);
      if (fullList.length === 0) throw new Error('No complete media news items');
      feedCache.set(cacheKey, { expiresAt: Date.now() + 10 * 60 * 1000, data: fullList });
      const start = (page - 1) * chunkSize;
      const items = fullList.slice(start, start + chunkSize);
      res.json({
        items,
        source: 'live',
        page,
        hasMore: fullList.length > start + chunkSize,
      });
    } catch {
      const catBase = NEWS_FALLBACK_BY_CATEGORY[category];
      const allFallback = [...catBase, ...NSO_FALLBACK_ITEMS.filter((x) => x.category !== category)];
      const start = (page - 1) * chunkSize;
      const items = allFallback.slice(start, start + chunkSize);
      res.json({
        items: items.length > 0 ? items : catBase,
        source: 'fallback',
        page,
        hasMore: allFallback.length > start + chunkSize,
      });
    }
  });

  app.get('/api/feeds/news', async (req, res) => {
    const rawCat = String(req.query.category || 'latest') as GeneralNewsCategoryId;
    const category: GeneralNewsCategoryId =
      rawCat in GENERAL_NEWS_FALLBACK_BY_CATEGORY ? rawCat : 'latest';
    const country = String(req.query.country ?? 'Puerto Rico').trim() || 'Puerto Rico';
    const refresh = req.query.refresh === '1';
    const page = Math.max(1, Number(req.query.page ?? 1) || 1);
    const chunkSize = 12;

    const cacheKey = `news:${category}:${category === 'location' ? country.toLowerCase() : 'global'}`;
    const cached = !refresh ? feedCache.get(cacheKey) : undefined;
    if (cached && cached.expiresAt > Date.now()) {
      const start = (page - 1) * chunkSize;
      const slice = cached.data.slice(start, start + chunkSize);
      res.json({
        items: slice.length > 0 ? slice : cached.data.slice(0, chunkSize),
        source: 'cache',
        page,
        hasMore: cached.data.length > start + chunkSize,
      });
      return;
    }

    try {
      const merged: NewsFeedItem[] = [];
      let sources = GENERAL_NEWS_RSS_BY_CATEGORY[category] || [];
      if (category === 'location' && country.toLowerCase() !== 'puerto rico') {
        const countryLower = country.toLowerCase();
        const lang = /(spain|espana|españa|mexico|méxico|colombia|argentina|chile|peru|perú|dominican|dominicana|cuba)/i.test(countryLower)
          ? 'es-419&gl=US&ceid=US:es-419'
          : 'en-US&gl=US&ceid=US:en';
        sources = [
          {
            name: `${country} News`,
            url: `https://www.bing.com/news/search?q=${encodeURIComponent(`${country} news`)}&format=rss`,
            colors: ['#0284C7', '#1E3A8A'],
          },
          {
            name: `${country} Headlines`,
            url: `https://news.google.com/rss/search?q=${encodeURIComponent(country)}&hl=${lang}`,
            colors: ['#059669', '#0F766E'],
          },
        ];
      }
      const results = await Promise.allSettled(
        sources.map(async (src) => {
          const r = await fetch(src.url, {
            signal: AbortSignal.timeout(3000),
            headers: {
              'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/124.0 Safari/537.36',
              Accept:
                src.kind === 'reddit'
                  ? 'application/json'
                  : 'application/rss+xml, application/xml, text/xml',
            },
          });
          if (!r.ok) throw new Error(`HTTP ${r.status}`);
          if (src.kind === 'reddit') {
            const json = await r.json();
            return parseRedditJsonPosts(json, src.name, category).slice(0, 14);
          }
          const xml = await r.text();
          return parseRssOrAtomXml(xml, src.name, category, src.colors).slice(0, 14);
        })
      );
      for (const r of results) {
        if (r.status === 'fulfilled') merged.push(...r.value);
      }

      if (merged.length === 0) throw new Error('Empty news feed');
      const candidates = merged.slice(0, 36);
      await Promise.allSettled(
        candidates.slice(0, 16).map(async (item) => {
          const needsMedia = !item.imageUrl && !item.videoUrl;
          const needsFullText = (item.content || '').length < 150;
          if ((needsMedia || needsFullText) && item.url.startsWith('http')) {
            try {
              const pageRes = await fetch(item.url, {
                signal: AbortSignal.timeout(2200),
                headers: {
                  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/124.0',
                  Accept: 'text/html,application/xhtml+xml',
                },
              });
              if (pageRes.ok) {
                const html = await pageRes.text();
                const ext = extractArticleContentHtml(html, item.url);
                if (!item.imageUrl && ext.heroImageUrl) item.imageUrl = ext.heroImageUrl;
                if (!item.videoUrl && ext.videoUrl) item.videoUrl = ext.videoUrl;
                if (ext.paragraphs.length > 0) {
                  const joined = ext.paragraphs.join('\n\n');
                  if (joined.length > (item.content || '').length) {
                    item.content = joined;
                    item.summary =
                      ext.paragraphs[0].length > 180
                        ? `${ext.paragraphs[0].slice(0, 177).trim()}...`
                        : ext.paragraphs[0];
                  }
                }
              }
            } catch {
              // ignore timeout
            }
          }
        })
      );

      const fullList = candidates.filter((item) => {
        const hasMedia = Boolean((item.imageUrl && item.imageUrl.trim()) || (item.videoUrl && item.videoUrl.trim()));
        const body = (item.content || item.summary || '').trim();
        const hasCompleteText = body.length >= 24 && !/full coverage available at/i.test(body);
        return hasMedia && hasCompleteText;
      });
      if (fullList.length === 0) throw new Error('No complete media news items');
      feedCache.set(cacheKey, { expiresAt: Date.now() + 10 * 60 * 1000, data: fullList });
      const start = (page - 1) * chunkSize;
      res.json({
        items: fullList.slice(start, start + chunkSize),
        source: 'live',
        page,
        hasMore: fullList.length > start + chunkSize,
      });
    } catch {
      const catBase = GENERAL_NEWS_FALLBACK_BY_CATEGORY[category];
      const allFallback = [
        ...catBase,
        ...GENERAL_NEWS_FALLBACK_ITEMS.filter((x) => x.category !== category),
      ];
      const start = (page - 1) * chunkSize;
      const items = allFallback.slice(start, start + chunkSize);
      res.json({
        items: items.length > 0 ? items : catBase,
        source: 'fallback',
        page,
        hasMore: allFallback.length > start + chunkSize,
      });
    }
  });

  // Full Article + Inline Images + Authentic Embedded Video Extractor for NSO / News Reader
  app.get('/api/feeds/article', async (req, res) => {
    const rawUrl = String(req.query.url ?? '');
    let parsedUrl: URL;
    try {
      parsedUrl = new URL(rawUrl);
    } catch {
      res.status(400).json({ error: 'Invalid URL' });
      return;
    }
    if (!['https:', 'http:'].includes(parsedUrl.protocol)) {
      res.status(400).json({ error: 'Unsupported protocol' });
      return;
    }

    const cacheKey = `article:${parsedUrl.toString()}`;
    const cached = articleCache.get(cacheKey);
    if (cached && cached.expiresAt > Date.now()) {
      res.json(cached.data);
      return;
    }

    try {
      const upstream = await fetch(parsedUrl.toString(), {
        signal: AbortSignal.timeout(3500),
        headers: {
          'User-Agent': 'Mozilla/5.0 (Linux; Android 13; Retroid Pocket 5) AppleWebKit/537.36',
          Accept: 'text/html,application/xhtml+xml',
        },
      });
      if (!upstream.ok) {
        throw new Error(`HTTP ${upstream.status}`);
      }
      const html = await upstream.text();
      const extracted = extractArticleContentHtml(html, parsedUrl.toString());
      const payload = {
        url: parsedUrl.toString(),
        paragraphs: extracted.paragraphs,
        blocks: extracted.blocks,
        heroImageUrl: extracted.heroImageUrl,
        videoUrl: extracted.videoUrl, // Only genuine video embedded in the source article
      };
      articleCache.set(cacheKey, { expiresAt: Date.now() + 10 * 60 * 1000, data: payload });
      res.json(payload);
    } catch {
      res.json({
        url: parsedUrl.toString(),
        paragraphs: [],
        blocks: [],
      });
    }
  });

  app.get('/api/feeds/image', async (req, res) => {
    const rawUrl = String(req.query.url ?? '');
    let parsedUrl: URL;
    try {
      parsedUrl = new URL(rawUrl);
    } catch {
      res.setHeader('Content-Type', 'image/svg+xml');
      res.send(FALLBACK_COVER_SVG);
      return;
    }
    if (!['https:', 'http:'].includes(parsedUrl.protocol)) {
      res.setHeader('Content-Type', 'image/svg+xml');
      res.send(FALLBACK_COVER_SVG);
      return;
    }
    try {
      const upstream = await fetch(parsedUrl.toString(), {
        signal: AbortSignal.timeout(4500),
        redirect: 'follow',
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/124.0 Safari/537.36',
          Accept: 'image/avif,image/webp,image/apng,image/*,*/*;q=0.8',
          Referer: `${parsedUrl.origin}/`,
        },
      });
      if (!upstream.ok) {
        res.setHeader('Content-Type', 'image/svg+xml');
        res.send(FALLBACK_COVER_SVG);
        return;
      }
      const ct = (upstream.headers.get('content-type') || '').toLowerCase();
      const looksLikeImgExt = /\.(jpe?g|png|webp|gif|avif|svg)(\?|$)/i.test(parsedUrl.pathname);
      if (!ct.startsWith('image/') && !looksLikeImgExt) {
        res.setHeader('Content-Type', 'image/svg+xml');
        res.send(FALLBACK_COVER_SVG);
        return;
      }
      const buf = Buffer.from(await upstream.arrayBuffer());
      res.setHeader('Content-Type', ct.startsWith('image/') ? ct : 'image/jpeg');
      res.setHeader('Cache-Control', 'public, max-age=3600');
      res.send(buf);
    } catch {
      res.setHeader('Content-Type', 'image/svg+xml');
      res.send(FALLBACK_COVER_SVG);
    }
  });

  // Proxy stylesheets, fonts, and images for sites with Cross-Origin-Resource-Policy: same-site/same-origin
  app.get('/api/browser/asset', async (req, res) => {
    const rawUrl = String(req.query.url ?? '').trim();
    if (!isSafeExternalHttpUrl(rawUrl)) {
      res.status(400).send('Invalid asset URL');
      return;
    }
    try {
      const parsed = new URL(rawUrl);
      const upstream = await fetch(parsed.toString(), {
        signal: AbortSignal.timeout(6000),
        redirect: 'follow',
        headers: {
          'User-Agent': 'Mozilla/5.0 (Linux; Android 13; Retroid Pocket 5) AppleWebKit/537.36 Chrome/124.0 Mobile Safari/537.36',
          Referer: `${parsed.origin}/`,
        },
      });
      if (!upstream.ok) {
        res.status(upstream.status).end();
        return;
      }
      const finalAssetUrl = upstream.url || parsed.toString();
      const ct = upstream.headers.get('content-type') || 'application/octet-stream';
      res.setHeader('Content-Type', ct);
      res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
      res.setHeader('Cache-Control', 'public, max-age=1800');
      if (ct.toLowerCase().includes('text/css')) {
        const cssText = await upstream.text();
        res.send(rewriteCssForInAppProxy(cssText, finalAssetUrl));
        return;
      }
      const buf = Buffer.from(await upstream.arrayBuffer());
      res.send(buf);
    } catch {
      res.status(502).end();
    }
  });

  // In-App Switch 2 Browser Proxy & Portal Handler (bypasses X-Frame-Options / CSP frame-ancestors)
  app.get('/api/browser/view', async (req, res) => {
    const rawUrl = String(req.query.url ?? '').trim() || 'https://www.nintendo.com';
    if (!isSafeExternalHttpUrl(rawUrl)) {
      res.status(400).send('Invalid or unsupported URL');
      return;
    }

    let parsed: URL;
    try {
      parsed = new URL(rawUrl);
    } catch {
      res.status(400).send('Malformed URL');
      return;
    }

    const host = parsed.hostname.toLowerCase().replace(/^www\./, '').replace(/^m\./, '');
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.setHeader('Cache-Control', 'no-store');

    const renderPortalShell = (title: string, currentUrl: string, bodyHtml: string, dark = false) => `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(title)}</title>
${buildInAppBridgeScript(currentUrl)}
<style>
  * { box-sizing: border-box; }
  body { margin: 0; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; background: ${dark ? '#0f1014' : '#ffffff'}; color: ${dark ? '#f3f4f6' : '#1f2329'}; }
  a { color: inherit; text-decoration: none; }
</style>
</head>
<body>${bodyHtml}</body>
</html>`;

    // 1. Google Search & Homepage
    if (host === 'google.com' || host.startsWith('google.')) {
      const query = parsed.searchParams.get('q')?.trim() || '';
      if (!query) {
        res.send(
          renderPortalShell(
            'Google',
            rawUrl,
            `<div style="min-height:100vh;display:flex;flex-direction:column;align-items:center;justify-content:center;padding:32px;background:#fff;">
              <div style="font-size:52px;font-weight:700;letter-spacing:-2px;margin-bottom:24px;">
                <span style="color:#4285F4">G</span><span style="color:#EA4335">o</span><span style="color:#FBBC05">o</span><span style="color:#4285F4">g</span><span style="color:#34A853">l</span><span style="color:#EA4335">e</span>
              </div>
              <form action="https://www.google.com/search" method="get" style="width:100%;max-width:560px;display:flex;gap:10px;">
                <input name="q" type="text" placeholder="Search Google or enter keywords..." style="flex:1;padding:12px 18px;border-radius:999px;border:1px solid #dfe1e5;font-size:15px;outline:none;box-shadow:0 1px 6px rgba(32,33,36,.12);" />
                <button type="submit" style="padding:12px 22px;border-radius:999px;border:0;background:#4285F4;color:#fff;font-weight:600;cursor:pointer;">Search</button>
              </form>
              <div style="margin-top:24px;display:flex;flex-wrap:wrap;gap:10px;justify-content:center;">
                <a href="https://www.google.com/search?q=Retroid+Pocket+5+Pegasus" style="padding:8px 14px;border-radius:999px;background:#f8f9fa;border:1px solid #dadce0;font-size:13px;">Retroid Pocket 5</a>
                <a href="https://www.google.com/search?q=Nintendo+Switch+2+games" style="padding:8px 14px;border-radius:999px;background:#f8f9fa;border:1px solid #dadce0;font-size:13px;">Switch 2 Games</a>
                <a href="https://www.google.com/search?q=APKPorts+Android" style="padding:8px 14px;border-radius:999px;background:#f8f9fa;border:1px solid #dadce0;font-size:13px;">APKPorts Android</a>
                <a href="https://www.nintendo.com" style="padding:8px 14px;border-radius:999px;background:#f8f9fa;border:1px solid #dadce0;font-size:13px;">Nintendo.com</a>
              </div>
            </div>`
          )
        );
        return;
      }

      let results = [] as { title: string; url: string; snippet: string }[];
      try {
        const ddg = await fetch(`https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`, {
          signal: AbortSignal.timeout(4000),
          headers: {
            'User-Agent': 'Mozilla/5.0 (Linux; Android 13; Retroid Pocket 5) AppleWebKit/537.36 Chrome/124.0 Mobile Safari/537.36',
          },
        });
        if (ddg.ok) {
          results = parseDuckDuckGoHtmlResults(await ddg.text());
        }
      } catch {
        /* fallback below */
      }
      if (results.length === 0) {
        results = [
          { title: `${query} — Nintendo Official Site`, url: 'https://www.nintendo.com', snippet: 'Explore official console, games, and news.' },
          { title: `${query} — APKPorts Android Ports`, url: `https://www.apkports.com/games?q=${encodeURIComponent(query)}`, snippet: 'Search Android game ports and fan games for handheld devices.' },
          { title: `${query} — YouTube Video Search`, url: `https://www.youtube.com/results?search_query=${encodeURIComponent(query)}`, snippet: 'Watch gameplay videos, trailers, and handheld setup guides.' },
        ];
      }

      const cardsHtml = results
        .map(
          (r) => `<div style="padding:14px 0;border-bottom:1px solid #eceff1;">
            <div style="font-size:12px;color:#5f6368;margin-bottom:4px;word-break:break-all;">${escapeHtml(r.url)}</div>
            <a href="${escapeHtml(r.url)}" style="font-size:17px;font-weight:600;color:#1a0dab;display:block;margin-bottom:4px;">${escapeHtml(r.title)}</a>
            <div style="font-size:13px;color:#4d5156;line-height:1.45;">${escapeHtml(r.snippet)}</div>
          </div>`
        )
        .join('');

      res.send(
        renderPortalShell(
          `${query} - Google Search`,
          rawUrl,
          `<div style="max-width:780px;margin:0 auto;padding:20px 24px;">
            <form action="https://www.google.com/search" method="get" style="display:flex;gap:10px;align-items:center;margin-bottom:16px;padding-bottom:14px;border-bottom:1px solid #e5e7eb;">
              <span style="font-size:22px;font-weight:700;letter-spacing:-1px;"><span style="color:#4285F4">G</span><span style="color:#EA4335">o</span><span style="color:#FBBC05">o</span><span style="color:#4285F4">g</span><span style="color:#34A853">l</span><span style="color:#EA4335">e</span></span>
              <input name="q" value="${escapeHtml(query)}" style="flex:1;padding:9px 14px;border-radius:999px;border:1px solid #dfe1e5;font-size:14px;" />
              <button type="submit" style="padding:9px 18px;border-radius:999px;border:0;background:#4285F4;color:#fff;font-weight:600;cursor:pointer;">Search</button>
            </form>
            ${cardsHtml}
          </div>`
        )
      );
      return;
    }

    // 2. YouTube (Watch Embed + Home/Search Feed)
    if (host === 'youtube.com' || host === 'youtu.be' || host === 'youtube-nocookie.com') {
      const videoId = extractYouTubeVideoId(rawUrl);
      if (videoId) {
        res.send(
          renderPortalShell(
            'YouTube Video Player',
            rawUrl,
            `<div style="display:flex;flex-direction:column;height:100vh;background:#0f1014;">
              <div style="padding:10px 16px;display:flex;align-items:center;justify-content:space-between;background:#18191f;border-bottom:1px solid #2b2d36;">
                <a href="https://www.youtube.com" style="color:#ff0033;font-weight:700;font-size:16px;">▶ YouTube</a>
                <a href="https://www.youtube.com" style="padding:6px 12px;border-radius:999px;background:#272932;color:#f3f4f6;font-size:12px;">Back to Videos</a>
              </div>
              <iframe src="https://www.youtube.com/embed/${escapeHtml(videoId)}?autoplay=1&rel=0&enablejsapi=1" style="flex:1;width:100%;border:0;" allow="autoplay; encrypted-media; picture-in-picture" allowfullscreen></iframe>
            </div>`,
            true
          )
        );
        return;
      }

      const ytQuery = parsed.searchParams.get('search_query')?.trim() || '';
      let videos: YouTubeVideoCard[] = [];
      try {
        const target = ytQuery
          ? `https://www.youtube.com/results?search_query=${encodeURIComponent(ytQuery)}`
          : 'https://www.youtube.com/results?search_query=nintendo+switch+2+gameplay';
        const ytRes = await fetch(target, {
          signal: AbortSignal.timeout(4000),
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/124.0 Safari/537.36',
            'Accept-Language': 'en-US,en;q=0.9',
          },
        });
        if (ytRes.ok) {
          videos = extractYouTubeVideosFromHtml(await ytRes.text());
        }
      } catch {
        /* fallback below */
      }
      if (videos.length === 0) {
        videos = [
          { videoId: '3pE23YTYEZM', title: 'Nintendo Switch 2 — First-Look Reveal Trailer', channel: 'Nintendo', thumbnail: 'https://i.ytimg.com/vi/3pE23YTYEZM/hqdefault.jpg', url: 'https://www.youtube.com/watch?v=3pE23YTYEZM' },
          { videoId: 'uHGShqcAHlQ', title: 'The Legend of Zelda: Tears of the Kingdom — Official Trailer', channel: 'Nintendo', thumbnail: 'https://i.ytimg.com/vi/uHGShqcAHlQ/hqdefault.jpg', url: 'https://www.youtube.com/watch?v=uHGShqcAHlQ' },
        ];
      }

      const gridHtml = videos
        .map(
          (v) => `<a href="${escapeHtml(v.url)}" style="display:block;background:#1b1d24;border:1px solid #2b2e38;border-radius:12px;overflow:hidden;">
            <img src="${escapeHtml(v.thumbnail)}" alt="${escapeHtml(v.title)}" style="width:100%;aspect-ratio:16/9;object-fit:cover;display:block;background:#111;" />
            <div style="padding:10px 12px;">
              <div style="font-size:13px;font-weight:600;color:#f3f4f6;line-height:1.35;margin-bottom:4px;">${escapeHtml(v.title)}</div>
              <div style="font-size:11px;color:#9ca3af;">${escapeHtml(v.channel)}</div>
            </div>
          </a>`
        )
        .join('');

      res.send(
        renderPortalShell(
          ytQuery ? `${ytQuery} - YouTube` : 'YouTube',
          rawUrl,
          `<div style="padding:18px 22px;max-width:1100px;margin:0 auto;">
            <form action="https://www.youtube.com/results" method="get" style="display:flex;gap:10px;align-items:center;margin-bottom:18px;">
              <span style="color:#ff0033;font-weight:800;font-size:20px;white-space:nowrap;">▶ YouTube</span>
              <input name="search_query" value="${escapeHtml(ytQuery)}" placeholder="Search YouTube videos..." style="flex:1;padding:10px 14px;border-radius:999px;border:1px solid #353844;background:#181920;color:#fff;font-size:14px;" />
              <button type="submit" style="padding:10px 18px;border-radius:999px;border:0;background:#ff0033;color:#fff;font-weight:600;cursor:pointer;">Search</button>
            </form>
            <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(220px,1fr));gap:14px;">
              ${gridHtml}
            </div>
          </div>`,
          true
        )
      );
      return;
    }

    // 3. Live Reverse Proxy for Nintendo.com, APKPorts.com, News Articles & General Web Pages
    try {
      const upstream = await fetch(parsed.toString(), {
        signal: AbortSignal.timeout(6000),
        redirect: 'follow',
        headers: {
          'User-Agent': 'Mozilla/5.0 (Linux; Android 13; Retroid Pocket 5) AppleWebKit/537.36 Chrome/124.0 Mobile Safari/537.36',
          Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
          'Accept-Language': 'en-US,en;q=0.9',
        },
      });

      const finalUrl = upstream.url || parsed.toString();
      const ct = (upstream.headers.get('content-type') || '').toLowerCase();
      if (!upstream.ok && upstream.status >= 400) {
        throw new Error(`HTTP ${upstream.status}`);
      }
      if (ct.includes('text/html') || ct.includes('application/xhtml+xml') || ct === '') {
        const html = await upstream.text();
        if (!html || html.trim().length < 60) {
          throw new Error('Empty HTML');
        }
        const { rewrittenHtml } = rewriteHtmlForInAppFrame(html, finalUrl, {
          proxyAssets: true,
        });
        res.send(rewrittenHtml);
      } else {
        const textBody = await upstream.text();
        res.send(
          renderPortalShell(
            finalUrl,
            finalUrl,
            `<pre style="padding:20px;white-space:pre-wrap;font-size:13px;">${escapeHtml(textBody.slice(0, 50000))}</pre>`
          )
        );
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Unable to reach site';
      res.send(
        renderPortalShell(
          parsed.hostname,
          rawUrl,
          `<div style="max-width:640px;margin:48px auto;padding:28px;border:1px solid #e5e7eb;border-radius:16px;text-align:center;">
            <h2 style="margin:0 0 8px;">${escapeHtml(parsed.hostname)}</h2>
            <p style="color:#6b7280;margin:0 0 18px;">Live embed blocked or timed out (${escapeHtml(msg)}).</p>
            <a href="${escapeHtml(rawUrl)}" style="display:inline-block;padding:10px 18px;border-radius:999px;background:#0ea5e9;color:#fff;font-weight:600;">Retry Load</a>
          </div>`
        )
      );
    }
  });

  // Direct download for calibrated Pegasus Theme ZIP (Switch 2 layout + Eden direct boot fix)
  const sendThemeZip = async (req: express.Request, res: express.Response) => {
    const zipPath = path.resolve(__dirname, 'public', 'skylineos2-pegasus-theme.zip');
    if (!fs.existsSync(zipPath)) {
      res.status(404).send('Theme ZIP not found on server');
      return;
    }
    try {
      const configParams = { ...(req.query ?? {}) };
      delete configParams._t;
      const hasCustomQuery = Object.keys(configParams).length > 0;
      res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, private');
      res.setHeader('Pragma', 'no-cache');
      res.setHeader('Expires', '0');
      if (hasCustomQuery) {
        const config = parseSkylineConfigFromQuery(configParams as Record<string, unknown>);
        const buffer = await buildCalibratedPegasusThemeZip(zipPath, config);
        res.setHeader('Content-Type', 'application/zip');
        res.setHeader('Content-Disposition', 'attachment; filename="skylineos2-pegasus-theme.zip"');
        res.setHeader('Content-Length', String(buffer.length));
        res.send(buffer);
        return;
      }
      const stat = fs.statSync(zipPath);
      res.setHeader('Content-Type', 'application/zip');
      res.setHeader('Content-Disposition', 'attachment; filename="skylineos2-pegasus-theme.zip"');
      res.setHeader('Content-Length', String(stat.size));
      fs.createReadStream(zipPath).pipe(res);
    } catch {
      res.download(zipPath, 'skylineos2-pegasus-theme.zip');
    }
  };

  // Direct download for legacy TAR.GZ
  const sendThemeTar = (_req: express.Request, res: express.Response) => {
    const tarPath = path.resolve(__dirname, 'public', 'skylineos2-project.tar.gz');
    if (fs.existsSync(tarPath)) {
      res.setHeader('Content-Type', 'application/gzip');
      res.setHeader('Content-Disposition', 'attachment; filename="skylineos2-project.tar.gz"');
      res.setHeader('Cache-Control', 'public, max-age=300');
      fs.createReadStream(tarPath).pipe(res);
    } else {
      res.status(404).send('Theme TAR.GZ not found on server');
    }
  };

  const IMAGE_EXT_RE = /\.(png|jpe?g|webp|gif|bmp)$/i;

  // Read photos directly from a user-configured Photos Directory when accessible on local filesystem
  app.get('/api/album/photos', async (req, res) => {
    const rawDir = String(req.query.dir ?? '').trim();
    if (!rawDir || !path.isAbsolute(rawDir) || rawDir.includes('\0')) {
      res.json({ exists: false, dir: rawDir, photos: [] });
      return;
    }
    try {
      const resolvedDir = path.resolve(rawDir);
      const stat = await fs.promises.stat(resolvedDir);
      if (!stat.isDirectory()) {
        res.json({ exists: false, dir: resolvedDir, photos: [] });
        return;
      }
      const entries = await fs.promises.readdir(resolvedDir, { withFileTypes: true });
      const photos = entries
        .filter((e) => e.isFile() && IMAGE_EXT_RE.test(e.name))
        .slice(0, 60)
        .map((e, idx) => ({
          id: `dir-photo-${idx}-${e.name}`,
          name: e.name,
          url: `/api/album/file?dir=${encodeURIComponent(resolvedDir)}&name=${encodeURIComponent(e.name)}`,
          addedAt: resolvedDir,
        }));
      res.json({ exists: true, dir: resolvedDir, photos });
    } catch {
      res.json({ exists: false, dir: rawDir, photos: [] });
    }
  });

  app.get('/api/album/file', async (req, res) => {
    const rawDir = String(req.query.dir ?? '').trim();
    const rawName = path.basename(String(req.query.name ?? '').trim());
    if (!rawDir || !path.isAbsolute(rawDir) || !rawName || !IMAGE_EXT_RE.test(rawName)) {
      res.status(400).end();
      return;
    }
    try {
      const resolvedDir = path.resolve(rawDir);
      const fullPath = path.resolve(resolvedDir, rawName);
      if (path.dirname(fullPath) !== resolvedDir) {
        res.status(403).end();
        return;
      }
      const stat = await fs.promises.stat(fullPath);
      if (!stat.isFile()) {
        res.status(404).end();
        return;
      }
      res.sendFile(fullPath);
    } catch {
      res.status(404).end();
    }
  });

  app.get('/api/download/pegasus-theme.zip', sendThemeZip);
  app.get('/skylineos2-pegasus-theme.zip', sendThemeZip);
  app.get('/api/download/skylineos2-project.tar.gz', sendThemeTar);
  app.get('/skylineos2-project.tar.gz', sendThemeTar);

  if (process.env.NODE_ENV !== 'production') {
    if (process.env.DISABLE_HMR === 'true') {
      app.get('/@vite/client', (_req, res) => {
        res.setHeader('Content-Type', 'application/javascript; charset=utf-8');
        res.send(`
const sheetsMap = new Map();
const linkSheetsMap = new Map();
if (typeof document !== 'undefined') {
  document.querySelectorAll('style[data-vite-dev-id]').forEach((el) => {
    sheetsMap.set(el.getAttribute('data-vite-dev-id'), el);
  });
  document.querySelectorAll('link[rel="stylesheet"][data-vite-dev-id]').forEach((el) => {
    linkSheetsMap.set(el.getAttribute('data-vite-dev-id'), el);
  });
}
let lastInsertedStyle;
export function updateStyle(id, content) {
  if (linkSheetsMap.has(id)) return;
  let style = sheetsMap.get(id);
  if (!style) {
    style = document.createElement('style');
    style.setAttribute('type', 'text/css');
    style.setAttribute('data-vite-dev-id', id);
    style.textContent = content;
    if (!lastInsertedStyle) {
      document.head.appendChild(style);
      setTimeout(() => { lastInsertedStyle = undefined; }, 0);
    } else {
      lastInsertedStyle.insertAdjacentElement('afterend', style);
    }
    lastInsertedStyle = style;
  } else if (style.textContent !== content) {
    style.textContent = content;
  }
  sheetsMap.set(id, style);
}
export function removeStyle(id) {
  if (linkSheetsMap.has(id)) {
    document.querySelectorAll('link[rel="stylesheet"][data-vite-dev-id="' + CSS.escape(id) + '"]').forEach((el) => el.remove());
    linkSheetsMap.delete(id);
  }
  const style = sheetsMap.get(id);
  if (style && style.parentNode) {
    style.parentNode.removeChild(style);
    sheetsMap.delete(id);
  }
}
export function createHotContext() {
  return {
    data: {},
    accept() {},
    acceptExports() {},
    dispose() {},
    prune() {},
    decline() {},
    invalidate() {},
    on() {},
    off() {},
    send() {},
  };
}
export function injectQuery(url, queryToInject) {
  if (!url || (url[0] !== '.' && url[0] !== '/')) return url;
  const pathname = url.replace(/[?#].*$/, '');
  const { search, hash } = new URL(url, 'http://vite.dev');
  return pathname + '?' + queryToInject + (search ? '&' + search.slice(1) : '') + (hash || '');
}
const BaseElement = typeof HTMLElement !== 'undefined' ? HTMLElement : class {};
export class ErrorOverlay extends BaseElement {}
`);
      });
    }
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distDir = path.resolve(__dirname, 'dist');
    app.use(express.static(distDir));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distDir, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`SkylineOS 2 server running on http://0.0.0.0:${PORT}`);
  });
}

startServer();
