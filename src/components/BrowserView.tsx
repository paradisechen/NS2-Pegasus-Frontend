import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Hls from 'hls.js';
import {
  ChevronLeft,
  ChevronRight,
  Clock,
  Film,
  Flame,
  LayoutGrid,
  Loader2,
  Maximize,
  Minimize,
  Pause,
  Play,
  RectangleHorizontal,
  Search,
  Sparkles,
  Square,
  Star,
  Tv,
  Volume2,
  VolumeX,
  Youtube,
} from 'lucide-react';
import type { AdaptivePalette, LaMovieMediaItem } from '../types/skyline';
import type { Switch2LayoutMetrics } from '../utils/rp5Layout';
import { ESHOP_ALPHABET_LETTERS, stepAlphabetLetter } from '../utils/eshopHelpers';
import { filterAndPaginateLaMovieCatalog, LAMOVIE_FALLBACK_ITEMS } from '../utils/lamovieParser';
import { cache } from '../utils/cache';
import { BottomControllerGlyph } from './BottomControllerGlyph';
import { SwitchPdfIcon } from './SwitchPdfIcons';
import { HlsVideoPlayer } from './HlsVideoPlayer';

interface BrowserViewProps {
  initialUrl?: string;
  palette: AdaptivePalette;
  metrics: Switch2LayoutMetrics;
  onClose: () => void;
}

type NetflixTab =
  | 'forMe'
  | 'continue'
  | 'favorites'
  | 'movies'
  | 'series'
  | 'categories'
  | 'youtube'
  | 'search';
type DetailFocusZone = 'preview' | 'fullscreen' | 'favorite' | 'back';
type AspectMode = 'fit' | '16:9' | '1:1' | 'fill';

const FAVORITES_STORAGE_KEY = 'skyline2_netflix_favorites_v2';
const CONTINUE_STORAGE_KEY = 'skyline2_netflix_continue_v1';
const PAGE_SIZE = 20;

const GENRE_FILTERS = [
  { id: 'all', label: 'Todo' },
  { id: 'acción', label: 'Acción' },
  { id: 'aventura', label: 'Aventura' },
  { id: 'animación', label: 'Animación' },
  { id: 'comedia', label: 'Comedia' },
  { id: 'drama', label: 'Drama' },
  { id: 'terror', label: 'Terror' },
  { id: 'ciencia ficción', label: 'Sci-Fi' },
  { id: 'fantasía', label: 'Fantasía' },
  { id: 'romance', label: 'Romance' },
  { id: 'suspenso', label: 'Suspense' },
  { id: 'crimen', label: 'Crimen' },
  { id: 'documental', label: 'Documental' },
];

const NETFLIX_TABS: { id: NetflixTab; label: string }[] = [
  { id: 'forMe', label: 'For Me' },
  { id: 'continue', label: 'Continue' },
  { id: 'movies', label: 'Movies' },
  { id: 'series', label: 'Series' },
  { id: 'categories', label: 'Categorías' },
  { id: 'favorites', label: 'Favorites' },
  { id: 'youtube', label: 'YouTube' },
];

interface EpisodeItem {
  _id: number;
  title: string;
  overview?: string;
}

interface EmbedSource {
  url: string;
  server?: string;
  quality?: string;
  language?: string;
}

function formatPlayerTime(secs: number): string {
  if (!Number.isFinite(secs) || secs < 0) return '0:00';
  const h = Math.floor(secs / 3600);
  const m = Math.floor((secs % 3600) / 60);
  const s = Math.floor(secs % 60);
  if (h > 0) return `${h}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  return `${m}:${s.toString().padStart(2, '0')}`;
}

function loadSavedMediaList(key: string): LaMovieMediaItem[] {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((x) => x && typeof x.id === 'string' && typeof x.title === 'string');
  } catch {
    return [];
  }
}

export function BrowserView({
  metrics,
  onClose,
}: BrowserViewProps) {
  const [activeTab, setActiveTab] = useState<NetflixTab>('forMe');
  const [activeGenre, setActiveGenre] = useState<string>('all');
  const [activeLetter, setActiveLetter] = useState<string>('All');
  const [searchDraft, setSearchDraft] = useState<string>('');
  const [committedQuery, setCommittedQuery] = useState<string>('');
  const [items, setItems] = useState<LaMovieMediaItem[]>(LAMOVIE_FALLBACK_ITEMS);
  const [loading, setLoading] = useState<boolean>(true);
  const [page, setPage] = useState<number>(1);
  const [totalPages, setTotalPages] = useState<number>(1);
  const [totalCount, setTotalCount] = useState<number>(LAMOVIE_FALLBACK_ITEMS.length);
  const [hasMore, setHasMore] = useState<boolean>(true);
  const [focusZone, setFocusZone] = useState<'tabs' | 'genres' | 'grid' | 'alphabet'>('grid');
  const [focusedIdx, setFocusedIdx] = useState<number>(0);
  const [gridCols, setGridCols] = useState<4 | 3 | 2>(4);
  const [carouselPairIdx, setCarouselPairIdx] = useState<number>(0);

  const [favorites, setFavorites] = useState<LaMovieMediaItem[]>(() =>
    loadSavedMediaList(FAVORITES_STORAGE_KEY)
  );
  const [continueWatching, setContinueWatching] = useState<LaMovieMediaItem[]>(() =>
    loadSavedMediaList(CONTINUE_STORAGE_KEY)
  );
  const [selectedItem, setSelectedItem] = useState<LaMovieMediaItem | null>(null);
  const [previewStream, setPreviewStream] = useState<{ url: string; kind: 'hls' | 'mp4' } | null>(null);
  const [previewMuted, setPreviewMuted] = useState<boolean>(true);
  const [previewPlaying, setPreviewPlaying] = useState<boolean>(true);
  const [playEmbedUrl, setPlayEmbedUrl] = useState<string>('');
  const [seasons, setSeasons] = useState<number[]>([1]);
  const [currentSeason, setCurrentSeason] = useState<number>(1);
  const [episodes, setEpisodes] = useState<EpisodeItem[]>([]);
  const [activeEpisodeId, setActiveEpisodeId] = useState<number | null>(null);
  const [embeds, setEmbeds] = useState<EmbedSource[]>([]);
  const [selectedEmbedIdx, setSelectedEmbedIdx] = useState<number>(0);
  const [detailLoading, setDetailLoading] = useState<boolean>(false);
  const [detailFocusZone, setDetailFocusZone] = useState<DetailFocusZone>('fullscreen');
  const [fullscreenPlayerOpen, setFullscreenPlayerOpen] = useState<boolean>(false);
  const [fsPlaying, setFsPlaying] = useState<boolean>(true);
  const [fsCurrentTime, setFsCurrentTime] = useState<number>(0);
  const [fsDuration, setFsDuration] = useState<number>(0);
  const [fsAspectMode, setFsAspectMode] = useState<AspectMode>('fit');
  const [fsControlsVisible, setFsControlsVisible] = useState<boolean>(true);
  const [resolvedStream, setResolvedStream] = useState<{
    loading: boolean;
    kind: 'hls' | 'mp4' | 'iframe';
    url: string;
    fallbackEmbedUrl: string;
  } | null>(null);

  const searchInputRef = useRef<HTMLInputElement>(null);
  const hlsVideoRef = useRef<HTMLVideoElement | null>(null);
  const fsOsdTimerRef = useRef<number | null>(null);
  const reqIdRef = useRef(0);
  const detailReqIdRef = useRef(0);

  const cycleGridZoom = useCallback(() => {
    setGridCols((prev) => (prev === 4 ? 3 : prev === 3 ? 2 : 4));
    setCarouselPairIdx(0);
  }, []);

  const cycleAspectMode = useCallback(() => {
    setFsAspectMode((prev) =>
      prev === 'fit' ? '16:9' : prev === '16:9' ? '1:1' : prev === '1:1' ? 'fill' : 'fit'
    );
  }, []);

  const bumpFsOsd = useCallback(() => {
    setFsControlsVisible(true);
    if (fsOsdTimerRef.current) window.clearTimeout(fsOsdTimerRef.current);
    fsOsdTimerRef.current = window.setTimeout(() => {
      setFsControlsVisible(false);
    }, 3600);
  }, []);

  const fetchCatalog = useCallback(
    async (tab: NetflixTab, genre: string, letter: string, q: string, pageNum: number) => {
      const reqId = ++reqIdRef.current;
      if (tab === 'favorites') {
        const pagedFavs = filterAndPaginateLaMovieCatalog(favorites, {
          letter,
          q,
          page: pageNum,
          pageSize: PAGE_SIZE,
        });
        setItems(pagedFavs.items);
        setTotalPages(pagedFavs.totalPages);
        setTotalCount(pagedFavs.totalCount);
        setHasMore(pagedFavs.page < pagedFavs.totalPages);
        setLoading(false);
        setFocusedIdx(0);
        return;
      }

      if (tab === 'continue') {
        const pagedCw = filterAndPaginateLaMovieCatalog(continueWatching, {
          letter,
          q,
          page: pageNum,
          pageSize: PAGE_SIZE,
        });
        setItems(pagedCw.items);
        setTotalPages(pagedCw.totalPages);
        setTotalCount(pagedCw.totalCount);
        setHasMore(pagedCw.page < pagedCw.totalPages);
        setLoading(false);
        setFocusedIdx(0);
        return;
      }

      const catCacheKey = `netflix_cat_${tab}_${genre}_${letter}_${q.toLowerCase()}_p${pageNum}`;
      const cachedPage = cache.get<{
        items: LaMovieMediaItem[];
        totalPages: number;
        totalCount: number;
        hasMore: boolean;
      }>(catCacheKey);
      if (cachedPage && cachedPage.items.length > 0) {
        setItems(cachedPage.items);
        setTotalPages(cachedPage.totalPages);
        setTotalCount(cachedPage.totalCount);
        setHasMore(cachedPage.hasMore);
        setLoading(false);
        setFocusedIdx(0);
        return;
      }

      setLoading(true);
      try {
        if (tab === 'youtube') {
          const ytQuery = q.trim() || 'Nintendo Switch 2 gameplay trailers';
          const res = await fetch(`/api/youtube/feed?q=${encodeURIComponent(ytQuery)}`);
          const json = (await res.json()) as { items?: LaMovieMediaItem[] };
          if (reqId !== reqIdRef.current) return;
          const rawYt = Array.isArray(json.items) ? json.items : [];
          const pagedYt = filterAndPaginateLaMovieCatalog(rawYt, {
            letter,
            page: pageNum,
            pageSize: PAGE_SIZE,
          });
          cache.set(
            catCacheKey,
            {
              items: pagedYt.items,
              totalPages: pagedYt.totalPages,
              totalCount: pagedYt.totalCount,
              hasMore: pagedYt.page < pagedYt.totalPages,
            },
            10 * 60 * 1000
          );
          setItems(pagedYt.items);
          setTotalPages(pagedYt.totalPages);
          setTotalCount(pagedYt.totalCount);
          setHasMore(pagedYt.page < pagedYt.totalPages);
        } else if (tab === 'search' && q.trim()) {
          const lmRes = await fetch(
            `/api/lamovie/catalog?section=search&q=${encodeURIComponent(q.trim())}&letter=${encodeURIComponent(letter)}&limit=${PAGE_SIZE}&page=${pageNum}`
          )
            .then((r) => r.json())
            .catch(() => ({ items: [] }));
          if (reqId !== reqIdRef.current) return;
          const lmItems = Array.isArray(lmRes.items) ? (lmRes.items as LaMovieMediaItem[]) : [];
          setItems(lmItems);
          setTotalPages(Math.max(1, Number(lmRes.totalPages || 1)));
          setTotalCount(Number(lmRes.totalCount ?? lmItems.length));
          setHasMore(Boolean(lmRes.hasMore));
        } else {
          // Combined LaMovie (630+ pages) + Fanpelis.to (465+ pages), deduplicated seamlessly
          const lmSection = tab === 'categories' ? 'forMe' : tab;
          const spLm = new URLSearchParams();
          spLm.set('section', lmSection);
          spLm.set('page', String(pageNum));
          spLm.set('limit', String(PAGE_SIZE));
          spLm.set('letter', letter);
          if (genre && genre !== 'all') spLm.set('genre', genre);

          const lmJson = await fetch(`/api/lamovie/catalog?${spLm.toString()}`)
            .then((r) => r.json())
            .catch(() => ({ items: [], totalPages: 1, totalCount: 0, hasMore: false }));
          if (reqId !== reqIdRef.current) return;

          const nextItems = Array.isArray(lmJson.items) ? (lmJson.items as LaMovieMediaItem[]) : [];
          const tp = Math.max(1, Number(lmJson.totalPages || 1));
          const tc = Number(lmJson.totalCount ?? nextItems.length);
          const hm = Boolean(lmJson.hasMore);

          if (nextItems.length > 0) {
            cache.set(catCacheKey, { items: nextItems, totalPages: tp, totalCount: tc || nextItems.length, hasMore: hm }, 10 * 60 * 1000);
          }
          setItems(nextItems);
          setTotalPages(tp);
          setTotalCount(tc || nextItems.length);
          setHasMore(hm);
        }
      } catch {
        if (reqId === reqIdRef.current) {
          const fb = filterAndPaginateLaMovieCatalog(LAMOVIE_FALLBACK_ITEMS, {
            letter,
            genre,
            page: pageNum,
            pageSize: PAGE_SIZE,
          });
          setItems(fb.items);
          setTotalPages(fb.totalPages);
          setTotalCount(fb.totalCount);
          setHasMore(false);
        }
      } finally {
        if (reqId === reqIdRef.current) {
          setLoading(false);
          setFocusedIdx(0);
          setCarouselPairIdx(0);
        }
      }
    },
    [continueWatching, favorites]
  );

  useEffect(() => {
    fetchCatalog(activeTab, activeGenre, activeLetter, committedQuery, page);
  }, [activeTab, activeGenre, activeLetter, committedQuery, page, fetchCatalog]);

  const persistFavorites = useCallback((next: LaMovieMediaItem[]) => {
    setFavorites(next);
    try {
      localStorage.setItem(FAVORITES_STORAGE_KEY, JSON.stringify(next));
    } catch {
      // Ignore quota issues
    }
  }, []);

  const recordContinueWatching = useCallback((item: LaMovieMediaItem) => {
    setContinueWatching((prev) => {
      const next = [item, ...prev.filter((x) => x.id !== item.id)].slice(0, 24);
      try {
        localStorage.setItem(CONTINUE_STORAGE_KEY, JSON.stringify(next));
      } catch {
        // Ignore quota issues
      }
      return next;
    });
  }, []);

  const isFavoriteItem = useCallback(
    (item: LaMovieMediaItem) => favorites.some((f) => f.id === item.id),
    [favorites]
  );

  const toggleFavorite = useCallback(
    (item: LaMovieMediaItem) => {
      const exists = favorites.some((f) => f.id === item.id);
      const next = exists ? favorites.filter((f) => f.id !== item.id) : [item, ...favorites];
      persistFavorites(next);
    },
    [favorites, persistFavorites]
  );

  const enterFullscreen = useCallback(() => {
    setPreviewPlaying(false);
    if (selectedItem) recordContinueWatching(selectedItem);
    setFullscreenPlayerOpen(true);
  }, [recordContinueWatching, selectedItem]);

  const togglePreviewPlayback = useCallback(() => {
    setPreviewPlaying((p) => !p);
  }, []);

  const openPreview = useCallback(async (item: LaMovieMediaItem) => {
    const reqId = ++detailReqIdRef.current;
    setSelectedItem(item);
    setFullscreenPlayerOpen(false);
    setResolvedStream(null);
    setPreviewStream(null);
    setPreviewPlaying(true);
    setDetailFocusZone('fullscreen');
    setSeasons([1]);
    setCurrentSeason(1);
    setEpisodes([]);
    setActiveEpisodeId(null);
    setEmbeds([]);
    setSelectedEmbedIdx(0);

    if (item.mediaType === 'youtube') {
      setDetailLoading(true);
      setPlayEmbedUrl(item.pageUrl || '');
      try {
        const dmParam = item.slug?.startsWith('dm:') ? `&dmId=${encodeURIComponent(item.slug.slice(3))}` : '';
        const res = await fetch(`/api/video/resolve?q=${encodeURIComponent(item.title)}${dmParam}`);
        if (res.ok && reqId === detailReqIdRef.current) {
          const data = (await res.json()) as { ok?: boolean; kind?: 'hls' | 'mp4'; proxyUrl?: string; streamUrl?: string };
          if (data.ok && (data.proxyUrl || data.streamUrl)) {
            const st = { url: data.proxyUrl || data.streamUrl!, kind: (data.kind || 'hls') as 'hls' | 'mp4' };
            setPreviewStream(st);
            setPlayEmbedUrl(st.url);
          }
        }
      } catch {
        // Fallback to backdrop
      } finally {
        if (reqId === detailReqIdRef.current) setDetailLoading(false);
      }
      return;
    }

    setPlayEmbedUrl('');
    setDetailLoading(true);

    type VidResolvePayload = {
      ok?: boolean;
      kind?: 'hls' | 'mp4';
      proxyUrl?: string;
      streamUrl?: string;
    };
    const trailerCacheKey = `netflix_prev_vid_${item.title.toLowerCase()}`;
    const cachedVid = cache.get<{ url: string; kind: 'hls' | 'mp4' }>(trailerCacheKey);
    const vidPromise: Promise<VidResolvePayload | null> = cachedVid
      ? Promise.resolve({ ok: true, kind: cachedVid.kind, proxyUrl: cachedVid.url })
      : fetch(`/api/video/resolve?q=${encodeURIComponent(`${item.title} trailer`)}`)
          .then((r) => (r.ok ? r.json() : null))
          .catch(() => null);

    const providerParam = item.sourceProvider === 'fanpelis' ? 'fanpelis' : 'lamovie';
    const altParams = item.altSource
      ? `&altProvider=${encodeURIComponent(item.altSource.provider)}&altId=${item.altSource.postId}&altSlug=${encodeURIComponent(item.altSource.slug)}`
      : '';
    const detailCacheKey = `netflix_detail_v2_${item.id}`;
    const cachedDetail = cache.get<{
      overview?: string;
      trailer?: string;
      embeds?: EmbedSource[];
      episodes?: EpisodeItem[];
      seasons?: number[];
      currentSeason?: number;
      embedUrl?: string;
    }>(detailCacheKey);

    const detailEndpoint = `/api/lamovie/detail?id=${encodeURIComponent(String(item.postId))}&slug=${encodeURIComponent(item.slug)}&type=${item.mediaType}&provider=${providerParam}&season=1${altParams}`;

    const detailPromise = cachedDetail
      ? Promise.resolve(cachedDetail)
      : fetch(detailEndpoint)
          .then((r) => (r.ok ? r.json() : null))
          .catch(() => null);

    const [vidData, detData] = await Promise.all([vidPromise, detailPromise]);
    if (reqId !== detailReqIdRef.current) return;

    if (detData) {
      cache.set(detailCacheKey, detData, 10 * 60 * 1000);
    }

    setSelectedItem((cur) => {
      if (!cur || cur.id !== item.id) return cur;
      return {
        ...cur,
        overview: detData?.overview || cur.overview,
      };
    });

    if (Array.isArray(detData?.seasons) && detData.seasons.length > 0) {
      setSeasons(detData.seasons);
      setCurrentSeason(detData.currentSeason || detData.seasons[0] || 1);
    }

    if (detData?.episodes && detData.episodes.length > 0) {
      setEpisodes(detData.episodes);
      setActiveEpisodeId(detData.episodes[0]._id);
    }

    const firstEmbed = detData?.embeds?.[0]?.url || detData?.embedUrl || '';
    if (detData?.embeds && detData.embeds.length > 0) {
      setEmbeds(detData.embeds);
      setPlayEmbedUrl(detData.embeds[0].url);
    } else if (detData?.embedUrl) {
      setPlayEmbedUrl(detData.embedUrl);
    } else {
      setPlayEmbedUrl(item.pageUrl);
    }

    if (vidData?.ok && (vidData.proxyUrl || vidData.streamUrl)) {
      const st = { url: vidData.proxyUrl || vidData.streamUrl!, kind: (vidData.kind || 'hls') as 'hls' | 'mp4' };
      cache.set(trailerCacheKey, st, 20 * 60 * 1000);
      setPreviewStream(st);
    } else if (firstEmbed && /^https?:\/\//i.test(firstEmbed)) {
      fetch(`/api/lamovie/stream?url=${encodeURIComponent(firstEmbed)}`)
        .then((r) => (r.ok ? r.json() : null))
        .then((st: { ok?: boolean; kind?: 'hls' | 'mp4'; proxyHlsUrl?: string; streamUrl?: string } | null) => {
          if (reqId !== detailReqIdRef.current) return;
          if (st?.ok && (st.proxyHlsUrl || st.streamUrl)) {
            setPreviewStream({ url: st.proxyHlsUrl || st.streamUrl!, kind: st.kind || 'hls' });
          }
        })
        .catch(() => {});
    }

    setDetailLoading(false);
  }, []);

  const changeSeason = useCallback(
    async (seasonNum: number) => {
      if (!selectedItem || selectedItem.mediaType !== 'tvshows') return;
      setCurrentSeason(seasonNum);
      setDetailLoading(true);
      const providerParam = selectedItem.sourceProvider === 'fanpelis' ? 'fanpelis' : 'lamovie';
      const altParams = selectedItem.altSource
        ? `&altProvider=${encodeURIComponent(selectedItem.altSource.provider)}&altId=${selectedItem.altSource.postId}&altSlug=${encodeURIComponent(selectedItem.altSource.slug)}`
        : '';
      try {
        const res = await fetch(
          `/api/lamovie/detail?id=${encodeURIComponent(String(selectedItem.postId))}&slug=${encodeURIComponent(selectedItem.slug)}&type=tvshows&provider=${providerParam}&season=${seasonNum}&episodeId=0${altParams}`
        );
        if (res.ok) {
          const data = (await res.json()) as {
            episodes?: EpisodeItem[];
            seasons?: number[];
            currentSeason?: number;
            embeds?: EmbedSource[];
            embedUrl?: string;
          };
          if (Array.isArray(data.seasons) && data.seasons.length > 0) {
            setSeasons(data.seasons);
          }
          if (Array.isArray(data.episodes)) {
            setEpisodes(data.episodes);
            if (data.episodes[0]) setActiveEpisodeId(data.episodes[0]._id);
          }
          if (data.embeds && data.embeds.length > 0) {
            setEmbeds(data.embeds);
            setSelectedEmbedIdx(0);
            setPlayEmbedUrl(data.embeds[0].url);
          } else if (data.embedUrl) {
            setPlayEmbedUrl(data.embedUrl);
          }
        }
      } catch {
        // Keep current season list
      } finally {
        setDetailLoading(false);
      }
    },
    [selectedItem]
  );

  const loadEpisodePlayer = useCallback(
    async (epId: number, andLaunchFullscreen = false) => {
      setActiveEpisodeId(epId);
      setDetailLoading(true);
      const providerParam = selectedItem?.sourceProvider === 'fanpelis' ? 'fanpelis' : 'lamovie';
      try {
        const res = await fetch(`/api/lamovie/detail?id=${epId}&type=movies&provider=${providerParam}`);
        if (res.ok) {
          const data = (await res.json()) as { embeds?: EmbedSource[]; embedUrl?: string };
          if (data.embeds && data.embeds.length > 0) {
            setEmbeds(data.embeds);
            setSelectedEmbedIdx(0);
            setPlayEmbedUrl(data.embeds[0].url);
          } else if (data.embedUrl) {
            setPlayEmbedUrl(data.embedUrl);
          }
        }
        if (andLaunchFullscreen) {
          setPreviewPlaying(false);
          setFullscreenPlayerOpen(true);
        }
      } catch {
        // keep existing
      } finally {
        setDetailLoading(false);
      }
    },
    [selectedItem]
  );

  const submitSearch = useCallback(
    (e?: React.FormEvent) => {
      if (e) e.preventDefault();
      const q = searchDraft.trim();
      if (!q) return;
      setCommittedQuery(q);
      if (activeTab !== 'youtube') {
        setActiveTab('search');
      }
      setSelectedItem(null);
      setFullscreenPlayerOpen(false);
      setPage(1);
      setFocusZone('grid');
      searchInputRef.current?.blur();
    },
    [activeTab, searchDraft]
  );

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (target && target.tagName === 'INPUT') {
        if (e.key === 'Escape') {
          e.preventDefault();
          target.blur();
        }
        return;
      }

      const lower = e.key.toLowerCase();
      if (e.key === 'Escape' || e.key === 'Backspace') {
        e.preventDefault();
        e.stopPropagation();
        if (fullscreenPlayerOpen) setFullscreenPlayerOpen(false);
        else if (selectedItem) {
          setSelectedItem(null);
          setPreviewPlaying(false);
        } else onClose();
        return;
      }

      if (lower === 'f') {
        e.preventDefault();
        e.stopPropagation();
        searchInputRef.current?.focus();
        return;
      }

      if (selectedItem) {
        if (fullscreenPlayerOpen) {
          const v = hlsVideoRef.current;
          bumpFsOsd();
          if (lower === ' ' || lower === 'enter' || lower === 'a' || lower === 'p') {
            e.preventDefault();
            e.stopPropagation();
            if (v) {
              if (v.paused) {
                v.play().catch(() => {});
                setFsPlaying(true);
              } else {
                v.pause();
                setFsPlaying(false);
              }
            }
            return;
          }
          if (e.key === 'ArrowLeft') {
            e.preventDefault();
            e.stopPropagation();
            if (v) v.currentTime = Math.max(0, v.currentTime - 10);
            return;
          }
          if (e.key === 'ArrowRight') {
            e.preventDefault();
            e.stopPropagation();
            if (v) v.currentTime = Math.min(v.duration || 99999, v.currentTime + 10);
            return;
          }
          if (e.key === '[' || lower === 'q' || e.key === 'PageUp') {
            e.preventDefault();
            e.stopPropagation();
            if (v) v.currentTime = Math.max(0, v.currentTime - 30);
            return;
          }
          if (e.key === ']' || lower === 'e' || e.key === 'PageDown') {
            e.preventDefault();
            e.stopPropagation();
            if (v) v.currentTime = Math.min(v.duration || 99999, v.currentTime + 30);
            return;
          }
          if (lower === 'y' || lower === 'z') {
            e.preventDefault();
            e.stopPropagation();
            cycleAspectMode();
            return;
          }
          return;
        }
        if (lower === 'x') {
          e.preventDefault();
          e.stopPropagation();
          toggleFavorite(selectedItem);
          return;
        }
        if (lower === 'p') {
          e.preventDefault();
          e.stopPropagation();
          togglePreviewPlayback();
          return;
        }
        if (e.key === 'ArrowUp') {
          e.preventDefault();
          e.stopPropagation();
          setDetailFocusZone('preview');
          return;
        }
        if (e.key === 'ArrowDown') {
          e.preventDefault();
          e.stopPropagation();
          if (detailFocusZone === 'preview') setDetailFocusZone('fullscreen');
          return;
        }
        if (e.key === 'ArrowLeft') {
          e.preventDefault();
          e.stopPropagation();
          const btnOrder: DetailFocusZone[] = ['fullscreen', 'favorite', 'back'];
          const idx = btnOrder.indexOf(detailFocusZone);
          if (idx > 0) setDetailFocusZone(btnOrder[idx - 1]);
          else setDetailFocusZone('preview');
          return;
        }
        if (e.key === 'ArrowRight') {
          e.preventDefault();
          e.stopPropagation();
          const btnOrder: DetailFocusZone[] = ['preview', 'fullscreen', 'favorite', 'back'];
          const idx = btnOrder.indexOf(detailFocusZone);
          setDetailFocusZone(btnOrder[(idx + 1) % btnOrder.length]);
          return;
        }
        if (e.key === 'Enter' || lower === 'a') {
          e.preventDefault();
          e.stopPropagation();
          if (detailFocusZone === 'preview') {
            togglePreviewPlayback();
          } else if (detailFocusZone === 'favorite') {
            toggleFavorite(selectedItem);
          } else if (detailFocusZone === 'back') {
            setSelectedItem(null);
            setPreviewPlaying(false);
          } else {
            enterFullscreen();
          }
          return;
        }
        return;
      }

      if (lower === 'y' || lower === 'z') {
        e.preventDefault();
        e.stopPropagation();
        cycleGridZoom();
        return;
      }

      if (lower === 'q' || e.key === '[') {
        e.preventDefault();
        e.stopPropagation();
        setActiveLetter((cur) => stepAlphabetLetter(cur, -1));
        setPage(1);
        setFocusedIdx(0);
        return;
      }
      if (lower === 'e' || e.key === ']') {
        e.preventDefault();
        e.stopPropagation();
        setActiveLetter((cur) => stepAlphabetLetter(cur, 1));
        setPage(1);
        setFocusedIdx(0);
        return;
      }

      if (e.key === 'PageUp' && page > 1) {
        e.preventDefault();
        e.stopPropagation();
        setPage((p) => Math.max(1, p - 1));
        return;
      }
      if (e.key === 'PageDown' && (page < totalPages || hasMore)) {
        e.preventDefault();
        e.stopPropagation();
        setPage((p) => p + 1);
        return;
      }

      const cols = gridCols;
      if (focusZone === 'tabs') {
        if (e.key === 'ArrowRight') {
          e.preventDefault();
          e.stopPropagation();
          const idx = NETFLIX_TABS.findIndex((t) => t.id === activeTab);
          const next = NETFLIX_TABS[(Math.max(0, idx) + 1) % NETFLIX_TABS.length];
          setActiveTab(next.id);
          setPage(1);
        } else if (e.key === 'ArrowLeft') {
          e.preventDefault();
          e.stopPropagation();
          const idx = NETFLIX_TABS.findIndex((t) => t.id === activeTab);
          const prev = NETFLIX_TABS[(Math.max(0, idx) - 1 + NETFLIX_TABS.length) % NETFLIX_TABS.length];
          setActiveTab(prev.id);
          setPage(1);
        } else if (e.key === 'ArrowDown' || e.key === 'Enter') {
          e.preventDefault();
          e.stopPropagation();
          setFocusZone(activeTab === 'categories' ? 'genres' : 'grid');
        }
        return;
      }

      if (focusZone === 'genres') {
        const gIdx = GENRE_FILTERS.findIndex((g) => g.id === activeGenre);
        if (e.key === 'ArrowRight') {
          e.preventDefault();
          e.stopPropagation();
          setActiveGenre(GENRE_FILTERS[(Math.max(0, gIdx) + 1) % GENRE_FILTERS.length].id);
          setPage(1);
        } else if (e.key === 'ArrowLeft') {
          e.preventDefault();
          e.stopPropagation();
          setActiveGenre(
            GENRE_FILTERS[(Math.max(0, gIdx) - 1 + GENRE_FILTERS.length) % GENRE_FILTERS.length].id
          );
          setPage(1);
        } else if (e.key === 'ArrowUp') {
          e.preventDefault();
          e.stopPropagation();
          setFocusZone('tabs');
        } else if (e.key === 'ArrowDown' || e.key === 'Enter') {
          e.preventDefault();
          e.stopPropagation();
          setFocusZone('grid');
        }
        return;
      }

      if (focusZone === 'alphabet') {
        if (e.key === 'ArrowLeft') {
          e.preventDefault();
          e.stopPropagation();
          setActiveLetter((cur) => stepAlphabetLetter(cur, -1));
          setPage(1);
          setFocusedIdx(0);
        } else if (e.key === 'ArrowRight') {
          e.preventDefault();
          e.stopPropagation();
          setActiveLetter((cur) => stepAlphabetLetter(cur, 1));
          setPage(1);
          setFocusedIdx(0);
        } else if (e.key === 'ArrowUp' || e.key === 'Enter') {
          e.preventDefault();
          e.stopPropagation();
          setFocusZone('grid');
        }
        return;
      }

      if (gridCols === 2 && items.length > 0) {
        if (e.key === 'ArrowRight') {
          e.preventDefault();
          e.stopPropagation();
          if (focusedIdx === 0 && items.length > carouselPairIdx + 1) {
            setFocusedIdx(1);
          } else if (carouselPairIdx + 2 < items.length) {
            setCarouselPairIdx((c) => c + 2);
            setFocusedIdx(0);
          } else if (page < totalPages || hasMore) {
            setPage((p) => p + 1);
            setCarouselPairIdx(0);
            setFocusedIdx(0);
          }
          return;
        }
        if (e.key === 'ArrowLeft') {
          e.preventDefault();
          e.stopPropagation();
          if (focusedIdx === 1) {
            setFocusedIdx(0);
          } else if (carouselPairIdx >= 2) {
            setCarouselPairIdx((c) => Math.max(0, c - 2));
            setFocusedIdx(1);
          } else if (page > 1) {
            setPage((p) => Math.max(1, p - 1));
            setCarouselPairIdx(0);
            setFocusedIdx(0);
          }
          return;
        }
      }

      if (e.key === 'ArrowRight' && items.length > 0) {
        e.preventDefault();
        e.stopPropagation();
        if (focusedIdx % cols === cols - 1 && (page < totalPages || hasMore)) {
          setPage((p) => p + 1);
          setFocusedIdx(Math.max(0, focusedIdx - (cols - 1)));
        } else {
          setFocusedIdx((p) => (p + 1 < items.length ? p + 1 : 0));
        }
      } else if (e.key === 'ArrowLeft' && items.length > 0) {
        e.preventDefault();
        e.stopPropagation();
        if (focusedIdx % cols === 0 && page > 1) {
          setPage((p) => Math.max(1, p - 1));
          setFocusedIdx(Math.min(items.length - 1, focusedIdx + (cols - 1)));
        } else {
          setFocusedIdx((p) => (p - 1 >= 0 ? p - 1 : items.length - 1));
        }
      } else if (e.key === 'ArrowDown' && items.length > 0) {
        e.preventDefault();
        e.stopPropagation();
        if (focusedIdx + cols < items.length) {
          setFocusedIdx((p) => p + cols);
        } else {
          setFocusZone('alphabet');
        }
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        e.stopPropagation();
        if (focusedIdx - cols >= 0) {
          setFocusedIdx((p) => p - cols);
        } else {
          setFocusZone(activeTab === 'categories' ? 'genres' : 'tabs');
        }
      } else if (e.key === 'Enter' && items[gridCols === 2 ? carouselPairIdx + focusedIdx : focusedIdx]) {
        e.preventDefault();
        e.stopPropagation();
        openPreview(items[gridCols === 2 ? carouselPairIdx + focusedIdx : focusedIdx]);
      }
    };

    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [
    activeGenre,
    activeTab,
    bumpFsOsd,
    carouselPairIdx,
    cycleAspectMode,
    cycleGridZoom,
    detailFocusZone,
    enterFullscreen,
    focusZone,
    focusedIdx,
    fullscreenPlayerOpen,
    gridCols,
    hasMore,
    items,
    onClose,
    openPreview,
    page,
    selectedItem,
    toggleFavorite,
    togglePreviewPlayback,
    totalPages,
  ]);

  useEffect(() => {
    const onFrameMessage = (ev: MessageEvent) => {
      if (ev.data && typeof ev.data === 'object' && ev.data.type === 'skyline-browser-escape') {
        setFullscreenPlayerOpen(false);
      }
    };
    window.addEventListener('message', onFrameMessage);
    return () => window.removeEventListener('message', onFrameMessage);
  }, []);

  const h = metrics.viewportHeight;
  const padX = Math.max(24, Math.round(metrics.screenMargin * 0.9));
  const bg = '#141414';
  const cardBg = '#1F1F24';
  const netflixRed = '#E50914';

  const activeFullscreenUrl = useMemo(() => {
    if (!playEmbedUrl) return '';
    if (playEmbedUrl.startsWith('/api/video/hls') || playEmbedUrl.startsWith('/api/lamovie/hls')) {
      return playEmbedUrl;
    }
    if (/^https?:\/\//i.test(playEmbedUrl)) {
      // Third-party direct embed hosts should load directly in the iframe rather than rewriting HTML chunks
      if (/(bysedikamoum\.com|mega\.nz\/embed|youtube\.com\/embed|voe\.sx|doodstream\.com|zarato\.top)/i.test(playEmbedUrl)) {
        return playEmbedUrl;
      }
      return `/api/lamovie/embed?url=${encodeURIComponent(playEmbedUrl)}`;
    }
    return playEmbedUrl;
  }, [playEmbedUrl]);

  // Fast Direct HLS/MP4 Stream Resolution for vimeos.net & LaMovie embeds when fullscreen opens
  useEffect(() => {
    if (!fullscreenPlayerOpen || !playEmbedUrl) {
      setResolvedStream(null);
      return;
    }
    if (playEmbedUrl.startsWith('/api/video/hls') || playEmbedUrl.startsWith('/api/lamovie/hls') || /\.(mp4|m3u8)(\?|$)/i.test(playEmbedUrl)) {
      setResolvedStream({
        loading: false,
        kind: playEmbedUrl.includes('.mp4') ? 'mp4' : 'hls',
        url: playEmbedUrl,
        fallbackEmbedUrl: playEmbedUrl,
      });
      return;
    }
    let cancelled = false;
    if (playEmbedUrl.startsWith('/api/video/resolve')) {
      setResolvedStream({ loading: true, kind: 'hls', url: '', fallbackEmbedUrl: activeFullscreenUrl });
      fetch(playEmbedUrl)
        .then((r) => (r.ok ? r.json() : null))
        .then((d: { ok?: boolean; kind?: 'hls' | 'mp4'; proxyUrl?: string; streamUrl?: string } | null) => {
          if (cancelled) return;
          if (d?.ok && (d.proxyUrl || d.streamUrl)) {
            setResolvedStream({
              loading: false,
              kind: d.kind || 'hls',
              url: d.proxyUrl || d.streamUrl!,
              fallbackEmbedUrl: activeFullscreenUrl,
            });
          } else {
            setResolvedStream({ loading: false, kind: 'iframe', url: activeFullscreenUrl, fallbackEmbedUrl: activeFullscreenUrl });
          }
        })
        .catch(() => {
          if (!cancelled) {
            setResolvedStream({ loading: false, kind: 'iframe', url: activeFullscreenUrl, fallbackEmbedUrl: activeFullscreenUrl });
          }
        });
      return () => {
        cancelled = true;
      };
    }

    setResolvedStream({
      loading: true,
      kind: 'iframe',
      url: '',
      fallbackEmbedUrl: activeFullscreenUrl,
    });
    const provHint = selectedItem?.sourceProvider === 'fanpelis' ? '&provider=fanpelis' : '';
    fetch(`/api/lamovie/stream?url=${encodeURIComponent(playEmbedUrl)}${provHint}`)
      .then((r) => (r.ok ? r.json() : null))
      .then(
        (
          data: {
            ok?: boolean;
            kind?: 'hls' | 'mp4';
            streamUrl?: string;
            proxyHlsUrl?: string;
            embedProxyUrl?: string;
          } | null
        ) => {
          if (cancelled) return;
          if (data?.ok && data.kind === 'hls' && data.proxyHlsUrl) {
            setResolvedStream({
              loading: false,
              kind: 'hls',
              url: data.proxyHlsUrl,
              fallbackEmbedUrl: data.embedProxyUrl || activeFullscreenUrl,
            });
          } else if (data?.ok && data.kind === 'mp4' && data.streamUrl) {
            setResolvedStream({
              loading: false,
              kind: 'mp4',
              url: data.streamUrl,
              fallbackEmbedUrl: data.embedProxyUrl || activeFullscreenUrl,
            });
          } else {
            setResolvedStream({
              loading: false,
              kind: 'iframe',
              url: data?.embedProxyUrl || activeFullscreenUrl,
              fallbackEmbedUrl: activeFullscreenUrl,
            });
          }
        }
      )
      .catch(() => {
        if (!cancelled) {
          setResolvedStream({
            loading: false,
            kind: 'iframe',
            url: activeFullscreenUrl,
            fallbackEmbedUrl: activeFullscreenUrl,
          });
        }
      });
    return () => {
      cancelled = true;
    };
  }, [activeFullscreenUrl, fullscreenPlayerOpen, playEmbedUrl, selectedItem]);

  // Attach hls.js to native video player for seamless .m3u8 playback with fast start
  useEffect(() => {
    const videoEl = hlsVideoRef.current;
    if (!fullscreenPlayerOpen || !resolvedStream || !videoEl) return;
    if (resolvedStream.kind !== 'hls' && resolvedStream.kind !== 'mp4') return;

    setFsCurrentTime(0);
    setFsDuration(0);
    setFsPlaying(true);
    bumpFsOsd();

    if (resolvedStream.kind === 'mp4') {
      videoEl.src = resolvedStream.url;
      videoEl.play().catch(() => {});
      return;
    }

    if (Hls.isSupported()) {
      const hls = new Hls({
        enableWorker: true,
        lowLatencyMode: false,
        startLevel: 0,
        capLevelToPlayerSize: true,
        maxBufferLength: 16,
      });
      hls.loadSource(resolvedStream.url);
      hls.attachMedia(videoEl);
      hls.on(Hls.Events.MANIFEST_PARSED, () => {
        videoEl.play().catch(() => {});
      });
      hls.on(Hls.Events.ERROR, (_ev, data) => {
        if (data.fatal) {
          hls.destroy();
          setResolvedStream((cur) =>
            cur
              ? { ...cur, kind: 'iframe', url: cur.fallbackEmbedUrl }
              : null
          );
        }
      });
      return () => {
        hls.destroy();
      };
    } else if (videoEl.canPlayType('application/vnd.apple.mpegurl')) {
      videoEl.src = resolvedStream.url;
      videoEl.play().catch(() => {});
    }
  }, [fullscreenPlayerOpen, resolvedStream]);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Netflix Streaming Hub"
      data-testid="browser-view"
      className="animate-ns2-fade absolute inset-0 z-50 flex flex-col overflow-hidden select-none text-white"
      style={{ backgroundColor: bg }}
    >
      {/* Top Netflix Navigation + Search Bar */}
      <header
        className="shrink-0 flex items-center justify-between gap-3 border-b border-white/10"
        style={{
          paddingLeft: `${padX}px`,
          paddingRight: `${padX}px`,
          height: `${Math.max(54, Math.round(h * 0.11))}px`,
          background: 'linear-gradient(180deg, rgba(12,12,15,0.98) 0%, rgba(20,20,24,0.95) 100%)',
        }}
      >
        <div className="flex items-center gap-4 min-w-0">
          <span
            data-testid="netflix-brand-title"
            className="font-ud-bold tracking-wider uppercase shrink-0"
            style={{
              color: netflixRed,
              fontSize: `${Math.max(20, Math.round(h * 0.042))}px`,
              letterSpacing: '0.08em',
            }}
          >
            NETFLIX
          </span>

          <nav className="flex items-center gap-1.5 overflow-x-auto no-scrollbar py-1">
            {NETFLIX_TABS.map((tab) => {
              const active = activeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  type="button"
                  data-testid={`netflix-tab-${tab.id}`}
                  onClick={() => {
                    setActiveTab(tab.id);
                    setSelectedItem(null);
                    setFullscreenPlayerOpen(false);
                    setPage(1);
                    setFocusZone('grid');
                  }}
                  className="px-3 py-1 rounded-md text-xs font-ud-semibold whitespace-nowrap cursor-pointer focus:outline-none transition-colors flex items-center gap-1.5"
                  style={{
                    backgroundColor: active ? netflixRed : 'rgba(255,255,255,0.08)',
                    color: '#FFFFFF',
                    border:
                      focusZone === 'tabs' && active
                        ? '2px solid #FFFFFF'
                        : '2px solid transparent',
                  }}
                >
                  {tab.id === 'forMe' && <Flame className="w-3.5 h-3.5" />}
                  {tab.id === 'continue' && <Clock className="w-3.5 h-3.5" />}
                  {tab.id === 'favorites' && <Star className="w-3.5 h-3.5 fill-current" />}
                  {tab.id === 'movies' && <Film className="w-3.5 h-3.5" />}
                  {tab.id === 'series' && <Tv className="w-3.5 h-3.5" />}
                  {tab.id === 'categories' && <Sparkles className="w-3.5 h-3.5" />}
                  {tab.id === 'youtube' && <Youtube className="w-3.5 h-3.5" />}
                  <span>{tab.label}</span>
                </button>
              );
            })}
          </nav>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          {!selectedItem && (
            <button
              type="button"
              data-testid="netflix-grid-zoom"
              onClick={cycleGridZoom}
              title="Zoom Grid (4×4 → 3×3 → 2 Carousel) [Y/Z]"
              className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs font-ud-bold bg-white/10 hover:bg-white/20 text-white cursor-pointer focus:outline-none"
            >
              <LayoutGrid className="w-3.5 h-3.5" />
              <span>{gridCols === 4 ? '4×4' : gridCols === 3 ? '3×3' : '2×1'}</span>
            </button>
          )}
          <form onSubmit={submitSearch} className="flex items-center gap-2 shrink-0">
            <div className="relative flex items-center">
              <Search className="w-3.5 h-3.5 text-white/60 absolute left-3 pointer-events-none" />
              <input
                ref={searchInputRef}
                type="text"
                data-testid="netflix-search-input"
                value={searchDraft}
                onChange={(e) => setSearchDraft(e.target.value)}
                placeholder="Search LaMovie & Fanpelis..."
                className="pl-8 pr-3 py-1.5 rounded-md text-xs bg-white/10 text-white placeholder-white/50 border border-white/15 focus:border-[#E50914] focus:outline-none ring-0 focus:ring-0 select-text"
                style={{
                  width: '195px',
                  outline: 'none',
                  boxShadow: 'none',
                }}
              />
            </div>
            <button
              type="submit"
              data-testid="netflix-search-submit"
              className="px-3 py-1.5 rounded-md text-xs font-ud-bold text-white cursor-pointer focus:outline-none hover:opacity-90"
              style={{ backgroundColor: netflixRed }}
            >
              Search
            </button>
          </form>
        </div>
      </header>

      {/* Categories Filter Ribbon when Categories tab is active */}
      {activeTab === 'categories' && !selectedItem && (
        <div
          data-testid="netflix-genre-bar"
          className="shrink-0 flex items-center gap-2 overflow-x-auto no-scrollbar py-2 border-b border-white/10"
          style={{ paddingLeft: `${padX}px`, paddingRight: `${padX}px`, backgroundColor: '#19191E' }}
        >
          {GENRE_FILTERS.map((g) => {
            const active = activeGenre === g.id;
            return (
              <button
                key={g.id}
                type="button"
                onClick={() => {
                  setActiveGenre(g.id);
                  setPage(1);
                }}
                className="px-3 py-1 rounded text-xs font-ud-semibold whitespace-nowrap cursor-pointer focus:outline-none"
                style={{
                  backgroundColor: active ? netflixRed : 'rgba(255,255,255,0.08)',
                  color: '#FFFFFF',
                  border: focusZone === 'genres' && active ? '2px solid #FFFFFF' : '2px solid transparent',
                }}
              >
                {g.label}
              </button>
            );
          })}
        </div>
      )}

      {/* Main Content: Either Media Grid (20/page) OR Game-Style In-Section Preview Window */}
      <div
        className="flex-1 min-h-0 overflow-y-auto no-scrollbar relative"
        style={{ paddingLeft: `${padX}px`, paddingRight: `${padX}px`, paddingTop: '12px', paddingBottom: '12px' }}
      >
        {selectedItem ? (
          <div data-testid="netflix-preview-page" className="flex flex-col md:flex-row gap-6 h-full">
            {/* Left / Top Preview Window (Click / A when selected -> Play/Pause Preview; Watch Fullscreen -> Stop Preview & Play Full Movie) */}
            <div className="md:w-[54%] flex flex-col gap-3 shrink-0">
              <div
                role="button"
                tabIndex={0}
                data-testid="netflix-preview-window"
                onClick={() => {
                  setDetailFocusZone('preview');
                  togglePreviewPlayback();
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    setDetailFocusZone('preview');
                    togglePreviewPlayback();
                  }
                }}
                className="relative w-full aspect-video rounded-xl overflow-hidden bg-black cursor-pointer group focus:outline-none transition-all"
                style={{
                  border: detailFocusZone === 'preview' ? '3px solid #FFFFFF' : `2px solid ${netflixRed}`,
                  boxShadow:
                    detailFocusZone === 'preview' ? '0 0 0 2px rgba(229,9,20,0.9)' : 'none',
                }}
              >
                <img
                  src={selectedItem.backdropUrl || selectedItem.posterUrl}
                  alt={selectedItem.title}
                  referrerPolicy="no-referrer"
                  className="w-full h-full object-cover"
                />
                {previewStream && previewPlaying && !fullscreenPlayerOpen && (
                  <HlsVideoPlayer
                    src={previewStream.url}
                    kind={previewStream.kind}
                    muted={previewMuted}
                    loop
                    autoPlay
                    fadeInOnReady
                    poster={selectedItem.backdropUrl || selectedItem.posterUrl}
                    onError={() => setPreviewStream(null)}
                    className="absolute inset-0 w-full h-full object-cover pointer-events-none transition-opacity duration-300"
                  />
                )}
                <div
                  className="absolute inset-0 flex items-end justify-between p-3 pointer-events-none"
                  style={{ background: 'linear-gradient(180deg, rgba(0,0,0,0) 45%, rgba(0,0,0,0.82) 100%)' }}
                >
                  <span className="text-xs font-ud-semibold text-white/95">
                    {previewPlaying
                      ? 'Preview Playing · Click window or press A to Pause'
                      : 'Preview Paused · Click window or press A to Play'}
                  </span>
                  <div className="flex items-center gap-1.5 pointer-events-auto">
                    {previewStream && (
                      <button
                        type="button"
                        onClick={(ev) => {
                          ev.stopPropagation();
                          setPreviewMuted((m) => !m);
                        }}
                        className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-ud-bold text-white bg-black/75 hover:bg-black cursor-pointer"
                      >
                        {previewMuted ? <VolumeX className="w-3.5 h-3.5" /> : <Volume2 className="w-3.5 h-3.5" />}
                        <span>{previewMuted ? 'Muted' : 'Audio'}</span>
                      </button>
                    )}
                    <span
                      data-testid="netflix-preview-toggle"
                      className="inline-flex items-center gap-1.5 px-3 py-1 rounded-md text-xs font-ud-bold text-white"
                      style={{ backgroundColor: previewPlaying ? netflixRed : 'rgba(255,255,255,0.22)' }}
                    >
                      {previewPlaying ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5 fill-current" />}
                      <span>{previewPlaying ? 'Pause' : 'Play'}</span>
                    </span>
                  </div>
                </div>
              </div>

              {/* Action Buttons */}
              <div className="flex flex-wrap items-center gap-2.5">
                <button
                  type="button"
                  data-testid="netflix-watch-fullscreen"
                  onClick={enterFullscreen}
                  className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg text-sm font-ud-bold text-white cursor-pointer focus:outline-none hover:opacity-90"
                  style={{
                    backgroundColor: netflixRed,
                    border: detailFocusZone === 'fullscreen' ? '2px solid #FFFFFF' : '2px solid transparent',
                  }}
                >
                  <Play className="w-4 h-4 fill-current" />
                  <span>Watch Fullscreen</span>
                </button>

                <button
                  type="button"
                  data-testid="netflix-toggle-favorite"
                  onClick={() => toggleFavorite(selectedItem)}
                  className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-lg text-xs font-ud-semibold bg-white/10 hover:bg-white/20 text-white cursor-pointer focus:outline-none"
                  style={{
                    border: detailFocusZone === 'favorite' ? '2px solid #FFFFFF' : '2px solid transparent',
                  }}
                >
                  <Star
                    className={`w-4 h-4 ${isFavoriteItem(selectedItem) ? 'fill-amber-400 text-amber-400' : ''}`}
                  />
                  <span>{isFavoriteItem(selectedItem) ? 'Saved in Favorites' : 'Add to Favorites'}</span>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setSelectedItem(null);
                    setPreviewPlaying(false);
                  }}
                  className="px-4 py-2.5 rounded-lg text-xs font-ud-semibold bg-white/10 hover:bg-white/20 text-white cursor-pointer focus:outline-none"
                  style={{
                    border: detailFocusZone === 'back' ? '2px solid #FFFFFF' : '2px solid transparent',
                  }}
                >
                  Back to Catalog
                </button>
              </div>
            </div>

            {/* Right Metadata, Synopsis, Servers & Series Episodes */}
            <div className="flex-1 min-w-0 flex flex-col gap-3 overflow-y-auto no-scrollbar pr-1">
              <div className="flex items-center gap-2 flex-wrap">
                <span
                  className="px-2.5 py-0.5 rounded text-[11px] font-ud-bold uppercase"
                  style={{ backgroundColor: netflixRed }}
                >
                  {selectedItem.mediaType === 'youtube'
                    ? 'YouTube · Video'
                    : selectedItem.sourceProvider === 'combined'
                      ? `${selectedItem.mediaType === 'tvshows' ? 'Series' : 'Movie'} · LaMovie · Fanpelis`
                      : selectedItem.sourceProvider === 'fanpelis'
                        ? `${selectedItem.mediaType === 'tvshows' ? 'Series' : 'Movie'} · Fanpelis`
                        : selectedItem.mediaType === 'tvshows'
                          ? 'Series · LaMovie'
                          : 'Movie · LaMovie'}
                </span>
                {selectedItem.year && (
                  <span className="text-xs text-white/75 font-ud-semibold">{selectedItem.year}</span>
                )}
                {selectedItem.rating && (
                  <span className="text-xs font-ud-bold text-amber-400">★ {selectedItem.rating}</span>
                )}
                {selectedItem.runtime && (
                  <span className="text-xs text-white/75">{selectedItem.runtime}</span>
                )}
              </div>

              <h2
                className="font-ud-bold leading-tight"
                style={{ fontSize: `${Math.max(20, Math.round(h * 0.04))}px` }}
              >
                {selectedItem.title}
              </h2>

              <div className="flex flex-wrap gap-1.5">
                {selectedItem.genres.map((g) => (
                  <span
                    key={g}
                    className="px-2.5 py-0.5 rounded text-[11px] bg-white/10 text-white/85"
                  >
                    {g}
                  </span>
                ))}
              </div>

              <p className="text-sm text-white/85 leading-relaxed line-clamp-3">
                {detailLoading ? 'Loading streams & synopsis...' : selectedItem.overview}
              </p>

              {embeds.length > 1 && (
                <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar py-0.5 shrink-0">
                  {embeds.slice(0, 6).map((emb, idx) => (
                    <button
                      key={`${emb.url}-${idx}`}
                      type="button"
                      onClick={() => {
                        setSelectedEmbedIdx(idx);
                        setPlayEmbedUrl(emb.url);
                      }}
                      className="px-2.5 py-1 rounded text-xs font-ud-semibold whitespace-nowrap shrink-0 cursor-pointer focus:outline-none"
                      style={{
                        backgroundColor:
                          selectedEmbedIdx === idx ? netflixRed : 'rgba(255,255,255,0.1)',
                      }}
                    >
                      {emb.server || `Server ${idx + 1}`}
                      {emb.language ? ` · ${emb.language}` : ''}
                    </button>
                  ))}
                </div>
              )}

              {/* Compact 2-Line Season & Episode Selector */}
              {selectedItem.mediaType === 'tvshows' && (seasons.length > 0 || episodes.length > 0) && (
                <div data-testid="netflix-seasons-bar" className="flex flex-col gap-1.5 pt-1 shrink-0">
                  {/* Line 1: Compact Single-Row Season Selector */}
                  {seasons.length > 0 && (
                    <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar whitespace-nowrap">
                      <span className="text-[11px] font-ud-bold text-white/55 uppercase tracking-wider shrink-0 mr-1">
                        Temp:
                      </span>
                      {seasons.map((sNum) => {
                        const activeS = currentSeason === sNum;
                        return (
                          <button
                            key={sNum}
                            type="button"
                            data-testid={`netflix-season-${sNum}`}
                            onClick={() => changeSeason(sNum)}
                            className="px-2.5 py-1 rounded text-xs font-ud-bold whitespace-nowrap shrink-0 cursor-pointer focus:outline-none transition-colors"
                            style={{
                              backgroundColor: activeS ? netflixRed : 'rgba(255,255,255,0.1)',
                              color: '#FFFFFF',
                              border: activeS ? '1px solid #FFFFFF' : '1px solid transparent',
                            }}
                          >
                            T{sNum}
                          </button>
                        );
                      })}
                    </div>
                  )}

                  {/* Line 2: Compact Single-Row Episode Selector */}
                  {episodes.length > 0 && (
                    <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar whitespace-nowrap">
                      <span className="text-[11px] font-ud-bold text-white/55 uppercase tracking-wider shrink-0 mr-1">
                        Ep:
                      </span>
                      {episodes.map((ep, idx) => {
                        const activeEp = activeEpisodeId === ep._id;
                        return (
                          <button
                            key={ep._id}
                            type="button"
                            onClick={() => loadEpisodePlayer(ep._id, true)}
                            className="px-3 py-1.5 rounded text-xs font-ud-medium whitespace-nowrap shrink-0 max-w-[200px] truncate cursor-pointer focus:outline-none transition-colors"
                            style={{
                              backgroundColor: activeEp ? netflixRed : 'rgba(255,255,255,0.1)',
                            }}
                            title={ep.title}
                          >
                            {idx + 1}. {ep.title}
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        ) : loading ? (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3.5">
            {Array.from({ length: 8 }).map((_, i) => (
              <div
                key={i}
                className="aspect-[16/10] rounded-lg bg-white/10 animate-pulse"
              />
            ))}
          </div>
        ) : items.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full gap-2 text-white/65">
            <Film className="w-9 h-9" />
            <p className="text-sm font-ud-semibold">
              {activeTab === 'favorites'
                ? `No favorites matched${activeLetter !== 'All' ? ` under "${activeLetter}"` : ''}.`
                : activeTab === 'continue'
                  ? 'No watched titles yet. Open any movie or series fullscreen to track it here.'
                  : `No titles found${activeLetter !== 'All' ? ` under "${activeLetter}"` : ''}. Try another letter or category.`}
            </p>
          </div>
        ) : gridCols === 2 ? (
          /* 2-Card Side-by-Side Carousel Zoom Mode with Soft Nintendo Transition */
          <div className="h-full flex flex-col justify-center gap-3">
            <div className="flex items-center justify-between gap-3">
              <button
                type="button"
                onClick={() => {
                  if (carouselPairIdx >= 2) {
                    setCarouselPairIdx((c) => Math.max(0, c - 2));
                    setFocusedIdx(0);
                  } else if (page > 1) {
                    setPage((p) => Math.max(1, p - 1));
                  }
                }}
                disabled={carouselPairIdx === 0 && page <= 1}
                className="p-2 rounded-full bg-white/10 hover:bg-white/20 disabled:opacity-30 cursor-pointer shrink-0"
                aria-label="Previous 2 titles"
              >
                <ChevronLeft className="w-5 h-5" />
              </button>

              <div
                data-testid="netflix-media-grid"
                className="flex-1 grid grid-cols-2 gap-5 transition-all duration-300 ease-out"
              >
                {items.slice(carouselPairIdx, carouselPairIdx + 2).map((item, idx) => {
                  const isFocused = focusZone === 'grid' && focusedIdx === idx;
                  const isFav = isFavoriteItem(item);
                  return (
                    <button
                      key={item.id}
                      type="button"
                      data-testid={`netflix-card-${idx}`}
                      onMouseEnter={() => {
                        setFocusZone('grid');
                        setFocusedIdx(idx);
                      }}
                      onClick={() => openPreview(item)}
                      className="relative flex flex-col overflow-hidden rounded-xl text-left cursor-pointer focus:outline-none transition-all duration-300"
                      style={{
                        backgroundColor: cardBg,
                        transform: isFocused ? 'scale(1.02)' : 'scale(0.99)',
                        border: isFocused ? `3px solid ${netflixRed}` : '3px solid rgba(255,255,255,0.1)',
                      }}
                    >
                      <div className="relative w-full aspect-video bg-black overflow-hidden">
                        <img
                          src={item.backdropUrl || item.posterUrl}
                          alt={item.title}
                          referrerPolicy="no-referrer"
                          className="w-full h-full object-cover"
                        />
                        <span
                          className="absolute top-2 left-2 px-2.5 py-0.5 rounded text-xs font-ud-bold text-white uppercase"
                          style={{
                            backgroundColor:
                              item.mediaType === 'youtube'
                                ? '#FF0033'
                                : item.sourceProvider === 'fanpelis'
                                  ? '#0EA5E9'
                                  : item.sourceProvider === 'combined'
                                    ? '#8B5CF6'
                                    : 'rgba(229,9,20,0.9)',
                          }}
                        >
                          {item.mediaType === 'youtube'
                            ? 'YouTube'
                            : item.mediaType === 'tvshows'
                              ? 'Series'
                              : 'Movie'}
                        </span>
                        {isFav && (
                          <span className="absolute top-2 right-2 p-1.5 rounded-full bg-black/75 text-amber-400">
                            <Star className="w-3.5 h-3.5 fill-current" />
                          </span>
                        )}
                      </div>
                      <div className="p-3.5 flex flex-col gap-1">
                        <div className="text-base font-ud-bold text-white line-clamp-1">{item.title}</div>
                        <div className="text-xs text-white/65 truncate">
                          {item.mediaType === 'youtube'
                            ? item.channel || 'YouTube'
                            : [
                                item.sourceProvider === 'combined'
                                  ? 'LaMovie · Fanpelis'
                                  : item.sourceProvider === 'fanpelis'
                                    ? 'Fanpelis'
                                    : 'LaMovie',
                                item.year,
                                item.genres[0],
                              ]
                                .filter(Boolean)
                                .join(' · ')}
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>

              <button
                type="button"
                onClick={() => {
                  if (carouselPairIdx + 2 < items.length) {
                    setCarouselPairIdx((c) => c + 2);
                    setFocusedIdx(0);
                  } else if (page < totalPages || hasMore) {
                    setPage((p) => p + 1);
                  }
                }}
                disabled={carouselPairIdx + 2 >= items.length && page >= totalPages && !hasMore}
                className="p-2 rounded-full bg-white/10 hover:bg-white/20 disabled:opacity-30 cursor-pointer shrink-0"
                aria-label="Next 2 titles"
              >
                <ChevronRight className="w-5 h-5" />
              </button>
            </div>
          </div>
        ) : (
          <div
            data-testid="netflix-media-grid"
            className={`grid gap-3.5 transition-all duration-200 ${
              gridCols === 3 ? 'grid-cols-2 sm:grid-cols-3' : 'grid-cols-2 sm:grid-cols-4'
            }`}
          >
            {items.slice(0, PAGE_SIZE).map((item, idx) => {
              const isFocused = focusZone === 'grid' && focusedIdx === idx;
              const isFav = isFavoriteItem(item);
              return (
                <button
                  key={item.id}
                  type="button"
                  data-testid={`netflix-card-${idx}`}
                  onMouseEnter={() => {
                    setFocusZone('grid');
                    setFocusedIdx(idx);
                  }}
                  onClick={() => openPreview(item)}
                  className="relative flex flex-col overflow-hidden rounded-lg text-left cursor-pointer focus:outline-none transition-transform duration-150"
                  style={{
                    backgroundColor: cardBg,
                    border: isFocused ? `3px solid ${netflixRed}` : '3px solid rgba(255,255,255,0.08)',
                  }}
                >
                  <div className="relative w-full aspect-video bg-black overflow-hidden">
                    <img
                      src={item.backdropUrl || item.posterUrl}
                      alt={item.title}
                      referrerPolicy="no-referrer"
                      className="w-full h-full object-cover"
                    />
                    <span
                      className="absolute top-1.5 left-1.5 px-2 py-0.5 rounded text-[10px] font-ud-bold text-white uppercase"
                      style={{
                        backgroundColor:
                          item.mediaType === 'youtube'
                            ? '#FF0033'
                            : item.sourceProvider === 'fanpelis'
                              ? '#0EA5E9'
                              : item.sourceProvider === 'combined'
                                ? '#8B5CF6'
                                : 'rgba(229,9,20,0.9)',
                      }}
                    >
                      {item.mediaType === 'youtube'
                        ? 'YouTube'
                        : item.mediaType === 'tvshows'
                          ? 'Series'
                          : 'Movie'}
                    </span>
                    {isFav && (
                      <span className="absolute top-1.5 right-1.5 p-1 rounded-full bg-black/75 text-amber-400">
                        <Star className="w-3 h-3 fill-current" />
                      </span>
                    )}
                  </div>
                  <div className="p-2.5 flex flex-col gap-0.5">
                    <div className="text-xs font-ud-bold text-white line-clamp-1">{item.title}</div>
                    <div className="text-[11px] text-white/60 truncate">
                      {item.mediaType === 'youtube'
                        ? item.channel || 'YouTube'
                        : [
                            item.sourceProvider === 'combined'
                              ? 'LaMovie · Fanpelis'
                              : item.sourceProvider === 'fanpelis'
                                ? 'Fanpelis'
                                : 'LaMovie',
                            item.year,
                            item.genres[0],
                          ]
                            .filter(Boolean)
                            .join(' · ')}
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* A-Z Alphabet Filter Bar BELOW Grid (Matching eShop, LB/RB or Clickable) */}
      {!selectedItem && (
        <div
          data-testid="netflix-alphabet-bar"
          className="shrink-0 py-1.5 flex items-center gap-1.5 border-t border-white/10"
          style={{
            paddingLeft: `${padX}px`,
            paddingRight: `${padX}px`,
            backgroundColor: '#151519',
            outline: focusZone === 'alphabet' ? `2px solid ${netflixRed}` : 'none',
          }}
        >
          <button
            type="button"
            data-testid="netflix-alphabet-prev"
            onClick={() => {
              setActiveLetter((cur) => stepAlphabetLetter(cur, -1));
              setPage(1);
              setFocusedIdx(0);
            }}
            title="Previous Letter (LB)"
            className="flex items-center gap-1 px-1.5 py-1 rounded bg-white/10 hover:bg-white/20 text-[10px] font-ud-bold text-gray-200 cursor-pointer shrink-0"
          >
            <SwitchPdfIcon button="L1" size={16} fillColor="#FFFFFF" cutoutColor="#151519" />
          </button>

          <div className="flex-1 flex items-center justify-between gap-0.5 overflow-x-auto no-scrollbar">
            {ESHOP_ALPHABET_LETTERS.map((ltr) => {
              const isSel = activeLetter === ltr;
              return (
                <button
                  key={ltr}
                  type="button"
                  data-testid={`netflix-letter-${ltr}`}
                  onClick={() => {
                    setActiveLetter(ltr);
                    setPage(1);
                    setFocusedIdx(0);
                  }}
                  className="px-1.5 py-0.5 rounded text-[11px] font-ud-bold cursor-pointer focus:outline-none transition-colors shrink-0"
                  style={{
                    backgroundColor: isSel ? netflixRed : 'transparent',
                    color: isSel ? '#FFFFFF' : '#9CA3AF',
                  }}
                >
                  {ltr}
                </button>
              );
            })}
          </div>

          <button
            type="button"
            data-testid="netflix-alphabet-next"
            onClick={() => {
              setActiveLetter((cur) => stepAlphabetLetter(cur, 1));
              setPage(1);
              setFocusedIdx(0);
            }}
            title="Next Letter (RB)"
            className="flex items-center gap-1 px-1.5 py-1 rounded bg-white/10 hover:bg-white/20 text-[10px] font-ud-bold text-gray-200 cursor-pointer shrink-0"
          >
            <SwitchPdfIcon button="R1" size={16} fillColor="#FFFFFF" cutoutColor="#151519" />
          </button>
        </div>
      )}

      {/* Bottom Controller Help & Paging */}
      <footer
        className="shrink-0 border-t border-white/10"
        style={{ paddingLeft: `${padX}px`, paddingRight: `${padX}px`, backgroundColor: '#101013' }}
      >
        <div
          className="flex items-center justify-between"
          style={{ height: `${Math.max(40, Math.round(h * 0.082))}px` }}
        >
          <div className="flex items-center gap-3">
            <BottomControllerGlyph size={metrics.helpIconSize} color="#FFFFFF" />
            {!selectedItem && (
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  data-testid="netflix-prev-page"
                  disabled={page <= 1}
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  className="flex items-center gap-0.5 px-2 py-1 rounded bg-white/10 hover:bg-white/20 disabled:opacity-35 text-xs font-ud-semibold cursor-pointer focus:outline-none"
                  aria-label="Previous page"
                >
                  <ChevronLeft className="w-3.5 h-3.5" />
                  <span>Prev</span>
                </button>
                <span
                  data-testid="netflix-page-indicator"
                  className="text-xs font-mono-tabular text-white/80 px-1.5"
                >
                  Page {page} / {totalPages}
                  {hasMore && page >= totalPages ? '+' : ''} · {totalCount}
                </span>
                <button
                  type="button"
                  data-testid="netflix-next-page"
                  disabled={page >= totalPages && !hasMore}
                  onClick={() => setPage((p) => p + 1)}
                  className="flex items-center gap-0.5 px-2 py-1 rounded bg-white/10 hover:bg-white/20 disabled:opacity-35 text-xs font-ud-semibold cursor-pointer focus:outline-none"
                  aria-label="Next page"
                >
                  <span>Next</span>
                  <ChevronRight className="w-3.5 h-3.5" />
                </button>
              </div>
            )}
          </div>

          <div className="flex items-center gap-5">
            {selectedItem && (
              <button
                type="button"
                onClick={() => toggleFavorite(selectedItem)}
                className="flex items-center gap-1.5 cursor-pointer hover:opacity-80 focus:outline-none"
              >
                <SwitchPdfIcon
                  button="X"
                  size={Math.max(18, Math.round(metrics.helpIconSize * 0.62))}
                  fillColor="#FFFFFF"
                  cutoutColor="#101013"
                />
                <span className="text-xs font-ud-semibold">Favorite</span>
              </button>
            )}

            <button
              type="button"
              data-testid="browser-back-button"
              onClick={() => {
                if (fullscreenPlayerOpen) setFullscreenPlayerOpen(false);
                else if (selectedItem) {
                  setSelectedItem(null);
                  setPreviewPlaying(false);
                } else onClose();
              }}
              className="flex items-center gap-1.5 cursor-pointer hover:opacity-80 focus:outline-none"
            >
              <SwitchPdfIcon
                button="B"
                size={Math.max(18, Math.round(metrics.helpIconSize * 0.62))}
                fillColor="#FFFFFF"
                cutoutColor="#101013"
              />
              <span className="text-xs font-ud-semibold">Back</span>
            </button>

            <button
              type="button"
              onClick={() => {
                if (selectedItem) {
                  if (detailFocusZone === 'preview') togglePreviewPlayback();
                  else enterFullscreen();
                } else if (items[focusedIdx]) {
                  openPreview(items[focusedIdx]);
                }
              }}
              className="flex items-center gap-1.5 cursor-pointer hover:opacity-80 focus:outline-none"
            >
              <SwitchPdfIcon
                button="A"
                size={Math.max(18, Math.round(metrics.helpIconSize * 0.62))}
                fillColor="#FFFFFF"
                cutoutColor="#101013"
              />
              <span className="text-xs font-ud-semibold">
                {selectedItem
                  ? detailFocusZone === 'preview'
                    ? previewPlaying
                      ? 'Pause Preview'
                      : 'Play Preview'
                    : 'Watch Fullscreen'
                  : 'Preview'}
              </span>
            </button>
          </div>
        </div>
      </footer>

      {/* Flat Nintendo Switch Dark-Transparent Fullscreen Media Player + Ambient Artwork Borders (No Top Close Button) */}
      {fullscreenPlayerOpen && selectedItem && (
        <div
          data-testid="streaming-fullscreen-player"
          onMouseMove={bumpFsOsd}
          onClick={bumpFsOsd}
          className="absolute inset-0 z-50 bg-black flex items-center justify-center overflow-hidden"
        >
          {/* Ambient Blurred Artwork Surroundings + Nintendo Switch Translucent Bezel Decal */}
          {(selectedItem.backdropUrl || selectedItem.posterUrl) && (
            <div className="absolute inset-0 pointer-events-none overflow-hidden">
              <img
                src={selectedItem.backdropUrl || selectedItem.posterUrl}
                alt=""
                referrerPolicy="no-referrer"
                className="w-full h-full object-cover scale-110 blur-2xl opacity-55"
              />
              <div
                className="absolute inset-0"
                style={{
                  background:
                    'radial-gradient(circle at center, rgba(10,12,18,0.22) 35%, rgba(6,8,14,0.78) 100%)',
                }}
              />
              {/* Subtle Nintendo Switch geometric corner framing */}
              <div className="absolute inset-3 rounded-2xl border border-white/15" />
              <div className="absolute top-5 left-5 w-10 h-1.5 rounded-full bg-white/25" />
              <div className="absolute top-5 right-5 w-10 h-1.5 rounded-full bg-[#E50914]/55" />
            </div>
          )}

          {/* Video Viewport with Aspect Ratio Switcher (Fit / 16:9 / 1:1 / Fill) */}
          <div className="relative z-10 w-full h-full flex items-center justify-center">
            {resolvedStream?.loading || (detailLoading && !activeFullscreenUrl) ? (
              <div className="flex flex-col items-center gap-3 text-white/90 px-6 py-4 rounded-xl bg-black/65 backdrop-blur-md">
                <Loader2 className="w-8 h-8 animate-spin text-[#E50914]" />
                <span className="text-sm font-ud-semibold">Preparing fast stream...</span>
              </div>
            ) : resolvedStream && (resolvedStream.kind === 'hls' || resolvedStream.kind === 'mp4') ? (
              <div
                className="relative flex items-center justify-center overflow-hidden transition-all duration-300"
                style={{
                  width: fsAspectMode === '1:1' ? 'min(100%, 100vh)' : '100%',
                  height: fsAspectMode === '16:9' ? 'min(100%, 56.25vw)' : '100%',
                  aspectRatio:
                    fsAspectMode === '16:9'
                      ? '16 / 9'
                      : fsAspectMode === '1:1'
                        ? '1 / 1'
                        : undefined,
                }}
              >
                <video
                  ref={hlsVideoRef}
                  data-testid="streaming-hls-video"
                  autoPlay
                  playsInline
                  onTimeUpdate={() => {
                    if (hlsVideoRef.current) setFsCurrentTime(hlsVideoRef.current.currentTime);
                  }}
                  onDurationChange={() => {
                    if (hlsVideoRef.current && Number.isFinite(hlsVideoRef.current.duration)) {
                      setFsDuration(hlsVideoRef.current.duration);
                    }
                  }}
                  onPlaying={() => setFsPlaying(true)}
                  onPause={() => setFsPlaying(false)}
                  onClick={(e) => {
                    e.stopPropagation();
                    bumpFsOsd();
                    const v = hlsVideoRef.current;
                    if (!v) return;
                    if (v.paused) {
                      v.play().catch(() => {});
                      setFsPlaying(true);
                    } else {
                      v.pause();
                      setFsPlaying(false);
                    }
                  }}
                  className={`w-full h-full bg-transparent ${
                    fsAspectMode === 'fill' ? 'object-cover' : 'object-contain'
                  }`}
                />
              </div>
            ) : (resolvedStream?.url || activeFullscreenUrl) ? (
              <iframe
                src={resolvedStream?.url || activeFullscreenUrl}
                title={`${selectedItem.title} Fullscreen Player`}
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share; fullscreen"
                referrerPolicy="strict-origin-when-cross-origin"
                allowFullScreen
                className="w-full h-full border-0 bg-transparent"
              />
            ) : (
              <div className="text-sm text-white/80 bg-black/65 px-5 py-3 rounded-xl">
                No stream URL found for this title.
              </div>
            )}
          </div>

          {/* Flat Nintendo Switch Dark-Transparent Media Controls Overlay */}
          {resolvedStream && (resolvedStream.kind === 'hls' || resolvedStream.kind === 'mp4') && (
            <div
              className={`absolute inset-x-0 bottom-0 z-20 px-6 pb-5 pt-10 transition-opacity duration-300 ${
                fsControlsVisible || !fsPlaying ? 'opacity-100' : 'opacity-0 pointer-events-none'
              }`}
              style={{
                background: 'linear-gradient(180deg, rgba(10,12,18,0) 0%, rgba(10,12,18,0.82) 100%)',
              }}
              onClick={(e) => e.stopPropagation()}
            >
              <div className="max-w-4xl mx-auto rounded-xl bg-black/65 backdrop-blur-md border border-white/15 px-4 py-3 flex flex-col gap-2.5">
                {/* Row 1: Scrubber + Start - End Time */}
                <div className="flex items-center gap-3">
                  <span className="text-xs font-mono-tabular text-white/90 w-12 text-right shrink-0">
                    {formatPlayerTime(fsCurrentTime)}
                  </span>
                  <input
                    type="range"
                    min={0}
                    max={fsDuration || 100}
                    value={fsCurrentTime}
                    onChange={(e) => {
                      const val = Number(e.target.value);
                      if (hlsVideoRef.current) hlsVideoRef.current.currentTime = val;
                      setFsCurrentTime(val);
                      bumpFsOsd();
                    }}
                    className="flex-1 h-1.5 bg-white/25 rounded-full appearance-none cursor-pointer accent-white"
                  />
                  <span className="text-xs font-mono-tabular text-white/70 w-12 shrink-0">
                    {formatPlayerTime(fsDuration)}
                  </span>
                </div>

                {/* Row 2: Flat Play/Pause + L/R Skip + Single In-Place Aspect Icon (No Text) */}
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        const v = hlsVideoRef.current;
                        if (!v) return;
                        if (v.paused) {
                          v.play().catch(() => {});
                          setFsPlaying(true);
                        } else {
                          v.pause();
                          setFsPlaying(false);
                        }
                        bumpFsOsd();
                      }}
                      className="w-9 h-9 rounded-lg bg-white/15 hover:bg-white/25 flex items-center justify-center text-white cursor-pointer focus:outline-none"
                      aria-label={fsPlaying ? 'Pause' : 'Play'}
                    >
                      {fsPlaying ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4 fill-current" />}
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        if (hlsVideoRef.current) {
                          hlsVideoRef.current.currentTime = Math.max(0, hlsVideoRef.current.currentTime - 30);
                        }
                        bumpFsOsd();
                      }}
                      className="h-9 px-2.5 rounded-lg bg-white/10 hover:bg-white/20 flex items-center gap-1 text-white/85 cursor-pointer"
                      aria-label="Rewind 30s (L)"
                    >
                      <SwitchPdfIcon button="L1" size={16} fillColor="#FFFFFF" cutoutColor="#141414" />
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        if (hlsVideoRef.current) {
                          hlsVideoRef.current.currentTime = Math.min(
                            hlsVideoRef.current.duration || 99999,
                            hlsVideoRef.current.currentTime + 30
                          );
                        }
                        bumpFsOsd();
                      }}
                      className="h-9 px-2.5 rounded-lg bg-white/10 hover:bg-white/20 flex items-center gap-1 text-white/85 cursor-pointer"
                      aria-label="Fast Forward 30s (R)"
                    >
                      <SwitchPdfIcon button="R1" size={16} fillColor="#FFFFFF" cutoutColor="#141414" />
                    </button>
                    <span className="text-xs font-ud-semibold text-white/85 truncate max-w-[260px] ml-2">
                      {selectedItem.title}
                    </span>
                  </div>

                  {/* Single In-Place Cycling Aspect Ratio Icon (No Text) */}
                  <button
                    type="button"
                    data-testid="streaming-aspect-toggle"
                    onClick={() => {
                      cycleAspectMode();
                      bumpFsOsd();
                    }}
                    className="w-9 h-9 rounded-lg bg-white/15 hover:bg-white/25 flex items-center justify-center text-white cursor-pointer focus:outline-none"
                    aria-label="Cycle Aspect Ratio"
                    title={fsAspectMode}
                  >
                    {fsAspectMode === '16:9' ? (
                      <RectangleHorizontal className="w-4 h-4" />
                    ) : fsAspectMode === '1:1' ? (
                      <Square className="w-4 h-4" />
                    ) : fsAspectMode === 'fill' ? (
                      <Maximize className="w-4 h-4" />
                    ) : (
                      <Minimize className="w-4 h-4" />
                    )}
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
