import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { GAMES_CATALOG } from './data/games';
import { INITIAL_USERS } from './data/profiles';
import { useArtworkPalette } from './hooks/useArtworkPalette';
import { computeSwitch2Layout, DEFAULT_SKYLINE_CONFIG, fit16By9Viewport } from './utils/rp5Layout';
import { playUiSound } from './utils/uiSounds';
import type {
  ActiveModal,
  AlbumPhotoItem,
  ApkpGameDetail,
  ApkpGameSummary,
  FocusZone,
  GameItem,
  PlayActivityEntry,
  SkylineConfig,
  UiKitCharacterId,
  UserProfile,
} from './types/skyline';
import { TopStatusBar } from './components/TopStatusBar';
import { HomeCarousel } from './components/HomeCarousel';
import { BottomDock, DOCK_BUTTONS, type DockButtonDef } from './components/BottomDock';
import { ControllerHelpBar } from './components/ControllerHelpBar';
import { UserSelectOverlay } from './components/UserSelectOverlay';
import { GameEditOverlay } from './components/GameEditOverlay';
import { GamePageView } from './components/GamePageView';
import { BrowserView } from './components/BrowserView';
import { AllSoftwareGridView } from './components/AllSoftwareGridView';
import { NewsGridView } from './components/NewsGridView';
import { ChatView } from './components/ChatView';
import { AlbumLauncherView } from './components/AlbumLauncherView';
import { GameShareView } from './components/GameShareView';
import { ProfileSettingsView, type ProfileSettingsTab } from './components/ProfileSettingsView';
import { EShopView } from './components/EShopView';
import { SecondaryModals } from './components/SecondaryModals';
import { HlsVideoPlayer } from './components/HlsVideoPlayer';

// Indices 0..8 in DOCK_BUTTONS (index 9 is Sleep Mode; Controllers removed in SkyLine 3)
const SECTION_DOCK_INDICES = [0, 1, 2, 3, 4, 5, 6, 7, 8];

const DEFAULT_ALBUM_PHOTOS: AlbumPhotoItem[] = [
  {
    id: 'album-sample-1',
    name: 'Emberfall_Citadel_Capture.jpg',
    url: '/src/assets/images/cover_crimson_odyssey_1795374633248.jpg',
    addedAt: 'Saved in Screenshots',
  },
  {
    id: 'album-sample-2',
    name: 'Windward_Isles_Capture.jpg',
    url: '/src/assets/images/cover_azure_horizon_1795374632225.jpg',
    addedAt: 'Saved in Screenshots',
  },
  {
    id: 'album-sample-3',
    name: 'Apex_Skyway_120fps.jpg',
    url: '/src/assets/images/cover_neon_velocity_1795374632434.jpg',
    addedAt: 'Saved in Screenshots',
  },
];

function buildAndroidDirectBootIntent(game: GameItem): { intentUri: string; emulatorLabel: string } {
  const short = (game.platformShort || game.platform).toLowerCase();
  if (short.includes('ps2')) {
    return {
      emulatorLabel: 'NetherSX2 Direct Boot',
      intentUri:
        'intent:#Intent;action=android.intent.action.VIEW;component=xyz.aethersx2.android/.MainActivity;end',
    };
  }
  if (short.includes('gc') || short.includes('gamecube') || short.includes('wii')) {
    return {
      emulatorLabel: 'Dolphin Direct Boot',
      intentUri:
        'intent:#Intent;action=android.intent.action.VIEW;component=org.dolphinemu.dolphinemu/.ui.main.MainActivity;end',
    };
  }
  // Switch / Eden Direct Boot targeting EmulationActivity (skips library browser)
  return {
    emulatorLabel: 'Eden EmulationActivity Direct Boot',
    intentUri:
      'intent:#Intent;action=android.intent.action.VIEW;component=dev.eden.eden_emulator/org.yuzu.yuzu_emu.activities.EmulationActivity;end',
  };
}

const GAME_OVERRIDES_STORAGE_KEY = 'skyline2_game_overrides_v1';
const PLAY_SESSIONS_STORAGE_KEY = 'skyline2_play_sessions_v1';

interface StoredGameOverride {
  title?: string;
  coverUrl?: string;
  backgroundUrl?: string;
  youtubeVideoId?: string;
  summary?: string;
  playTimeHours?: number;
  favorite?: boolean;
  inBacklog?: boolean;
  lastPlayedByUser?: string;
  playedByUsers?: { name: string; characterId: UiKitCharacterId }[];
  lastPlayedAt?: string;
  lastPlayedSeq?: number;
}

function loadGamesWithOverrides(): GameItem[] {
  try {
    if (typeof window === 'undefined') return GAMES_CATALOG;
    const raw = localStorage.getItem(GAME_OVERRIDES_STORAGE_KEY);
    if (!raw) return GAMES_CATALOG;
    const overrides = JSON.parse(raw) as Record<string, StoredGameOverride>;
    return GAMES_CATALOG.map((g) => {
      const ov = overrides?.[g.id];
      return ov ? { ...g, ...ov } : g;
    });
  } catch {
    return GAMES_CATALOG;
  }
}

function loadPlayActivityLog(): PlayActivityEntry[] {
  try {
    if (typeof window === 'undefined') return [];
    const raw = localStorage.getItem(PLAY_SESSIONS_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as PlayActivityEntry[]) : [];
  } catch {
    return [];
  }
}

const USER_CONFIG_KEY = (uid: string) => `skyline2_user_config_v1_${uid}`;

function loadUserConfig(uid: string): SkylineConfig {
  try {
    if (typeof window === 'undefined') return DEFAULT_SKYLINE_CONFIG;
    const raw = localStorage.getItem(USER_CONFIG_KEY(uid));
    if (!raw) return DEFAULT_SKYLINE_CONFIG;
    const parsed = JSON.parse(raw);
    return { ...DEFAULT_SKYLINE_CONFIG, ...parsed };
  } catch {
    return DEFAULT_SKYLINE_CONFIG;
  }
}

export default function App() {
  const [games, setGames] = useState<GameItem[]>(loadGamesWithOverrides);
  const [playActivityLog, setPlayActivityLog] = useState<PlayActivityEntry[]>(loadPlayActivityLog);
  const [activePlaySession, setActivePlaySession] = useState<{
    gameId: string;
    title: string;
    platform: string;
    coverUrl: string;
    playerName: string;
    characterId: UiKitCharacterId;
    startedAtMs: number;
  } | null>(null);
  const [users, setUsers] = useState<UserProfile[]>(INITIAL_USERS);
  const [activeUserId, setActiveUserId] = useState<string>(INITIAL_USERS[0].id);
  const [config, setConfig] = useState<SkylineConfig>(() => loadUserConfig(INITIAL_USERS[0].id));

  useEffect(() => {
    setConfig(loadUserConfig(activeUserId));
  }, [activeUserId]);

  useEffect(() => {
    try {
      localStorage.setItem(USER_CONFIG_KEY(activeUserId), JSON.stringify(config));
    } catch {
      // ignore
    }
  }, [activeUserId, config]);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [focusZone, setFocusZone] = useState<FocusZone>('games');
  const [focusedDockIndex, setFocusedDockIndex] = useState(8);
  const [hoveredDockIndex, setHoveredDockIndex] = useState<number | null>(null);
  const [activeModal, setActiveModal] = useState<ActiveModal>(null);
  const [settingsInitialTab, setSettingsInitialTab] = useState<ProfileSettingsTab>('profile');
  const [wishlistIds, setWishlistIds] = useState<string[]>([]);
  const [albumPhotos, setAlbumPhotos] = useState<AlbumPhotoItem[]>(DEFAULT_ALBUM_PHOTOS);
  const [browserUrl, setBrowserUrl] = useState<string>('https://www.nintendo.com');
  const [pendingLaunchGame, setPendingLaunchGame] = useState<GameItem | null>(null);
  const [inspectedGameId, setInspectedGameId] = useState<string | null>(null);
  const [launchNotice, setLaunchNotice] = useState<string | null>(null);

  const [viewport, setViewport] = useState(() => ({
    width: typeof window !== 'undefined' ? window.innerWidth : 1440,
    height: typeof window !== 'undefined' ? window.innerHeight : 900,
  }));

  useEffect(() => {
    const onResize = () => {
      setViewport({ width: window.innerWidth, height: window.innerHeight });
    };
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  const stageSize = useMemo(() => {
    if (config.rp5FrameMode === 'fill') {
      return viewport;
    }
    return fit16By9Viewport(viewport.width, viewport.height);
  }, [viewport, config.rp5FrameMode]);

  const metrics = useMemo(
    () => computeSwitch2Layout(stageSize.width, stageSize.height, config),
    [stageSize.width, stageSize.height, config]
  );

  const activeUser = useMemo(
    () => users.find((u) => u.id === activeUserId) ?? users[0],
    [users, activeUserId]
  );

  // Home screen shows strictly the latest 10 played titles
  const homeGames = useMemo(() => {
    return [...games]
      .sort((a, b) => (b.lastPlayedSeq ?? 0) - (a.lastPlayedSeq ?? 0))
      .slice(0, 10);
  }, [games]);

  const stageRef = useRef<HTMLElement>(null);

  const carouselGame = selectedIndex < homeGames.length ? homeGames[selectedIndex] : null;
  const activeGame = useMemo(() => {
    if (activeModal && inspectedGameId) {
      return games.find((g) => g.id === inspectedGameId) ?? carouselGame;
    }
    return carouselGame;
  }, [activeModal, carouselGame, games, inspectedGameId]);

  useEffect(() => {
    if (activeModal === null) {
      setInspectedGameId(null);
      if (document.activeElement instanceof HTMLElement && document.activeElement !== stageRef.current) {
        document.activeElement.blur();
      }
      window.getSelection()?.removeAllRanges();
      stageRef.current?.focus({ preventScroll: true });
    }
  }, [activeModal]);

  const bgImageOpacity = config.enableBackgroundArt
    ? Math.max(0, Math.min(0.92, config.backgroundDimPct / 100))
    : 0;

  const palette = useArtworkPalette(
    activeGame,
    config.appearanceMode,
    config.adaptiveColors,
    config.borderPreset,
    config.hudThemeId,
    bgImageOpacity
  );

  const showToast = useCallback((msg: string) => {
    setLaunchNotice(msg);
    window.setTimeout(() => {
      setLaunchNotice((cur) => (cur === msg ? null : cur));
    }, 2400);
  }, []);

  // Persist customized game artwork, trailers, favorites & real playtime across reloads
  useEffect(() => {
    try {
      const overrides: Record<string, StoredGameOverride> = {};
      for (const g of games) {
        const base = GAMES_CATALOG.find((b) => b.id === g.id);
        if (
          !base ||
          g.title !== base.title ||
          g.coverUrl !== base.coverUrl ||
          g.backgroundUrl !== base.backgroundUrl ||
          g.youtubeVideoId !== base.youtubeVideoId ||
          g.playTimeHours !== base.playTimeHours ||
          g.favorite !== base.favorite ||
          g.inBacklog !== base.inBacklog ||
          g.lastPlayedByUser !== base.lastPlayedByUser ||
          g.lastPlayedAt !== base.lastPlayedAt ||
          g.lastPlayedSeq !== base.lastPlayedSeq
        ) {
          overrides[g.id] = {
            title: g.title,
            coverUrl: g.coverUrl,
            backgroundUrl: g.backgroundUrl,
            youtubeVideoId: g.youtubeVideoId,
            summary: g.summary,
            playTimeHours: g.playTimeHours,
            favorite: g.favorite,
            inBacklog: g.inBacklog,
            lastPlayedByUser: g.lastPlayedByUser,
            playedByUsers: g.playedByUsers,
            lastPlayedAt: g.lastPlayedAt,
            lastPlayedSeq: g.lastPlayedSeq,
          };
        }
      }
      localStorage.setItem(GAME_OVERRIDES_STORAGE_KEY, JSON.stringify(overrides));
    } catch {
      // Ignore storage quota issues
    }
  }, [games]);

  useEffect(() => {
    try {
      localStorage.setItem(PLAY_SESSIONS_STORAGE_KEY, JSON.stringify(playActivityLog.slice(0, 40)));
    } catch {
      // Ignore storage quota issues
    }
  }, [playActivityLog]);

  // Gently fill missing YouTube trailers across the game library in small batches
  const trailerWarmupStartedRef = useRef(false);
  useEffect(() => {
    if (trailerWarmupStartedRef.current) return;
    trailerWarmupStartedRef.current = true;
    let cancelled = false;
    const missing = games.filter((g) => !g.youtubeVideoId);
    if (missing.length === 0) return;

    (async () => {
      for (let i = 0; i < missing.length; i += 2) {
        if (cancelled) break;
        const batch = missing.slice(i, i + 2);
        const foundUpdates: Record<string, string> = {};
        await Promise.all(
          batch.map(async (g) => {
            try {
              const res = await fetch(
                `/api/youtube/search?q=${encodeURIComponent(g.title)}&strict=1`
              );
              if (!res.ok) return;
              const data = (await res.json()) as { found?: boolean; videoId?: string };
              if (data.found && data.videoId) {
                foundUpdates[g.id] = data.videoId;
              }
            } catch {
              // Keep background-only fallback when unavailable
            }
          })
        );
        if (!cancelled && Object.keys(foundUpdates).length > 0) {
          setGames((prev) =>
            prev.map((item) =>
              foundUpdates[item.id] ? { ...item, youtubeVideoId: foundUpdates[item.id] } : item
            )
          );
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [games]);



  const finishActivePlaySession = useCallback(
    (forceLog = true) => {
      setActivePlaySession((cur) => {
        if (!cur) return null;
        const elapsedMs = Math.max(0, Date.now() - cur.startedAtMs);
        if (!forceLog && elapsedMs < 4000) return cur;
        const sessionMinutes = Math.max(1, Math.round(elapsedMs / 60000));
        const endedAtMs = Date.now();
        setGames((prev) =>
          prev.map((g) => {
            if (g.id !== cur.gameId) return g;
            return {
              ...g,
              playTimeHours: +((g.playTimeHours || 0) + sessionMinutes / 60).toFixed(3),
              lastPlayedAt: `Just finished (${sessionMinutes}m)`,
            };
          })
        );
        setPlayActivityLog((prev) => [
          {
            id: `sess-${endedAtMs}`,
            gameId: cur.gameId,
            title: cur.title,
            platform: cur.platform,
            coverUrl: cur.coverUrl,
            playerName: cur.playerName,
            characterId: cur.characterId,
            startedAtMs: cur.startedAtMs,
            endedAtMs,
            durationMinutes: sessionMinutes,
          },
          ...prev.slice(0, 39),
        ]);
        showToast(`Logged ${sessionMinutes}m play time for ${cur.title}`);
        return null;
      });
    },
    [showToast]
  );

  // Automatically record real elapsed session time when returning to the launcher
  useEffect(() => {
    const onVisibility = () => {
      if (document.visibilityState === 'visible' && activePlaySession) {
        finishActivePlaySession(false);
      }
    };
    document.addEventListener('visibilitychange', onVisibility);
    return () => document.removeEventListener('visibilitychange', onVisibility);
  }, [activePlaySession, finishActivePlaySession]);

  const finalizeGameLaunch = useCallback(
    (game: GameItem, player: UserProfile) => {
      playUiSound('launch', config.uiSoundsEnabled);
      setGames((prev) => {
        const maxSeq = prev.reduce((acc, item) => Math.max(acc, item.lastPlayedSeq ?? 0), 0);
        return prev.map((g) => {
          if (g.id !== game.id) return g;
          const existingPlayers = g.playedByUsers ?? [];
          const filtered = existingPlayers.filter(
            (p) => p.name.toLowerCase() !== player.name.toLowerCase()
          );
          return {
            ...g,
            lastPlayedByUser: player.name,
            playedByUsers: [{ name: player.name, characterId: player.characterId }, ...filtered],
            lastPlayedAt: 'Playing now',
            lastPlayedSeq: maxSeq + 1,
          };
        });
      });
      setActivePlaySession({
        gameId: game.id,
        title: game.title,
        platform: game.platform,
        coverUrl: game.coverUrl,
        playerName: player.name,
        characterId: player.characterId,
        startedAtMs: Date.now(),
      });
      setInspectedGameId(null);

      const { intentUri, emulatorLabel } = buildAndroidDirectBootIntent(game);
      const isAndroid = typeof navigator !== 'undefined' && /android/i.test(navigator.userAgent);
      if (isAndroid) {
        try {
          window.location.href = intentUri;
        } catch {
          // ignore if unhandled by webview
        }
        showToast(`Direct Boot (${emulatorLabel}): Launching ${game.title}...`);
      } else {
        showToast(`Direct Boot (${emulatorLabel}): Playing ${game.title} as ${player.name}...`);
      }
    },
    [config.uiSoundsEnabled, showToast]
  );

  const requestPlayWithProfileCheck = useCallback(
    (game: GameItem) => {
      playUiSound('user', config.uiSoundsEnabled);
      setPendingLaunchGame(game);
      setActiveModal('userSelect');
    },
    [config.uiSoundsEnabled]
  );

  const openInChromeExternal = useCallback(
    (targetUrl: string) => {
      playUiSound('browser', config.uiSoundsEnabled);
      const isAndroid = /android/i.test(navigator.userAgent);
      if (isAndroid) {
        const stripped = targetUrl.replace(/^https?:\/\//, '');
        window.location.href = `intent://${stripped}#Intent;scheme=https;package=com.android.chrome;end`;
      } else {
        const link = document.createElement('a');
        link.href = targetUrl;
        link.target = '_blank';
        link.rel = 'noopener noreferrer';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
      }
      showToast('Opening download link in Chrome...');
    },
    [config.uiSoundsEnabled, showToast]
  );

  const openBrowser = useCallback(
    (targetUrl = '') => {
      playUiSound('browser', config.uiSoundsEnabled);
      if (config.browserMode === 'chrome' && targetUrl) {
        openInChromeExternal(targetUrl);
      } else {
        setBrowserUrl(targetUrl);
        setActiveModal('browser');
      }
    },
    [config.browserMode, config.uiSoundsEnabled, openInChromeExternal]
  );

  const handleActivateCarouselItem = useCallback(
    (idx: number) => {
      if (idx === homeGames.length) {
        playUiSound('confirm', config.uiSoundsEnabled);
        setActiveModal('software');
      } else if (homeGames[idx]) {
        setFocusZone('games');
        setSelectedIndex(idx);
        setInspectedGameId(null);
        requestPlayWithProfileCheck(homeGames[idx]);
      }
    },
    [config.uiSoundsEnabled, homeGames, requestPlayWithProfileCheck]
  );

  const openProfileSettings = useCallback(
    (tab: ProfileSettingsTab = 'profile') => {
      playUiSound('settings', config.uiSoundsEnabled);
      setSettingsInitialTab(tab);
      setActiveModal('settings');
    },
    [config.uiSoundsEnabled]
  );

  const handleDockAction = useCallback(
    (idx: number, action: DockButtonDef['action']) => {
      setFocusZone('dock');
      setFocusedDockIndex(idx);
      if (action === 'settings') {
        openProfileSettings('profile');
      } else if (action === 'browser') {
        playUiSound('browser', config.uiSoundsEnabled);
        setBrowserUrl('');
        setActiveModal('browser');
      } else if (action === 'album') {
        playUiSound('album', config.uiSoundsEnabled);
        setActiveModal('album');
      } else {
        playUiSound('fade', config.uiSoundsEnabled);
        setActiveModal(action);
      }
    },
    [config.uiSoundsEnabled, openProfileSettings]
  );

  const cycleDockSection = useCallback(
    (dir: -1 | 1) => {
      playUiSound('fade', config.uiSoundsEnabled);
      const currentModalDockIdx = activeModal
        ? DOCK_BUTTONS.findIndex((b) => b.action === activeModal)
        : focusedDockIndex;
      const startPos = Math.max(0, SECTION_DOCK_INDICES.indexOf(currentModalDockIdx));
      const nextPos =
        (startPos + dir + SECTION_DOCK_INDICES.length) % SECTION_DOCK_INDICES.length;
      const nextDockIdx = SECTION_DOCK_INDICES[nextPos];
      const targetBtn = DOCK_BUTTONS[nextDockIdx];
      if (!targetBtn) return;

      setFocusZone('dock');
      setFocusedDockIndex(nextDockIdx);
      if (targetBtn.action === 'settings') {
        setSettingsInitialTab('profile');
        setActiveModal('settings');
      } else if (targetBtn.action === 'browser') {
        setActiveModal('browser');
      } else {
        setActiveModal(targetBtn.action);
      }
    },
    [activeModal, config.uiSoundsEnabled, focusedDockIndex]
  );

  const handleAddUser = useCallback(
    (name: string, characterId: UiKitCharacterId) => {
      const suffix = Math.floor(1000 + Math.random() * 8999);
      const created: UserProfile = {
        id: `user-${Date.now()}`,
        name,
        characterId,
        friendCode: `SW-${suffix}-4218-9012`,
      };
      setUsers((prev) => [...prev, created]);
      setActiveUserId(created.id);
      setConfig((prev) => ({ ...prev, username: created.name }));

      if (pendingLaunchGame) {
        const toLaunch = pendingLaunchGame;
        setPendingLaunchGame(null);
        setActiveModal(null);
        finalizeGameLaunch(toLaunch, created);
      } else {
        playUiSound('confirm', config.uiSoundsEnabled);
        setActiveModal(null);
      }
    },
    [config.uiSoundsEnabled, finalizeGameLaunch, pendingLaunchGame]
  );

  const handleRenameUser = useCallback((userId: string, nextName: string) => {
    setUsers((prev) => prev.map((u) => (u.id === userId ? { ...u, name: nextName } : u)));
    setConfig((prev) => ({ ...prev, username: nextName }));
  }, []);

  const handleSelectUser = useCallback(
    (userId: string) => {
      setActiveUserId(userId);
      const found = users.find((u) => u.id === userId);
      if (found) {
        setConfig((prev) => ({ ...prev, username: found.name }));
        if (pendingLaunchGame) {
          const toLaunch = pendingLaunchGame;
          setPendingLaunchGame(null);
          setActiveModal(null);
          finalizeGameLaunch(toLaunch, found);
          return;
        }
      }
      playUiSound('confirm', config.uiSoundsEnabled);
      setActiveModal(null);
    },
    [config.uiSoundsEnabled, finalizeGameLaunch, pendingLaunchGame, users]
  );

  const handleDeleteUser = useCallback(
    (userId: string) => {
      setUsers((prev) => {
        if (prev.length <= 1) {
          showToast('At least one user profile must remain');
          return prev;
        }
        const next = prev.filter((u) => u.id !== userId);
        if (activeUserId === userId && next[0]) {
          setActiveUserId(next[0].id);
          setConfig((cfg) => ({ ...cfg, username: next[0].name }));
        }
        playUiSound('back', config.uiSoundsEnabled);
        showToast('User profile removed');
        return next;
      });
    },
    [activeUserId, config.uiSoundsEnabled, showToast]
  );

  const handleSaveGameEdit = useCallback(
    (gameId: string, updates: { title: string; coverUrl?: string; backgroundUrl?: string }) => {
      setGames((prev) =>
        prev.map((g) =>
          g.id === gameId
            ? {
                ...g,
                title: updates.title,
                coverUrl: updates.coverUrl ?? g.coverUrl,
                backgroundUrl: updates.backgroundUrl ?? g.backgroundUrl,
              }
            : g
        )
      );
      showToast(`Saved "${updates.title}" changes`);
    },
    [showToast]
  );

  const handleTrailerResolved = useCallback((gameId: string, videoId: string) => {
    setGames((prev) =>
      prev.map((g) => (g.id === gameId && !g.youtubeVideoId ? { ...g, youtubeVideoId: videoId } : g))
    );
  }, []);

  const handleBulkScrapeSystem = useCallback(
    async (platform: string): Promise<{ updated: number; total: number }> => {
      const targets =
        platform === 'all' ? games : games.filter((g) => g.platform === platform);
      if (targets.length === 0) return { updated: 0, total: 0 };

      const res = await fetch('/api/artwork/scrape-batch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          games: targets.map((g) => ({
            id: g.id,
            title: g.title,
            platform: g.platform,
            hasYoutubeId: Boolean(g.youtubeVideoId),
          })),
        }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = (await res.json()) as {
        results?: { id: string; coverUrl?: string; backgroundUrl?: string; youtubeVideoId?: string }[];
      };
      const byId = new Map((json.results || []).map((r) => [r.id, r]));
      let updatedCount = 0;

      setGames((prev) =>
        prev.map((g) => {
          const hit = byId.get(g.id);
          if (!hit) return g;
          const nextCover = hit.coverUrl || g.coverUrl;
          const nextBg = hit.backgroundUrl || g.backgroundUrl;
          const nextYt = hit.youtubeVideoId || g.youtubeVideoId;
          if (nextCover !== g.coverUrl || nextBg !== g.backgroundUrl || nextYt !== g.youtubeVideoId) {
            updatedCount++;
          }
          return {
            ...g,
            coverUrl: nextCover,
            backgroundUrl: nextBg,
            youtubeVideoId: nextYt,
          };
        })
      );

      return { updated: updatedCount, total: targets.length };
    },
    [games]
  );

  const handleLoadAlbumPhotos = useCallback(
    (loaded: AlbumPhotoItem[], folderLabel: string) => {
      playUiSound('album', config.uiSoundsEnabled);
      setAlbumPhotos(loaded);
      setConfig((prev) => ({ ...prev, albumFolderLabel: folderLabel }));
      showToast(`Loaded ${loaded.length} photo(s) into Album`);
    },
    [config.uiSoundsEnabled, showToast]
  );

  const handleAddAlbumPhotos = useCallback(
    (added: AlbumPhotoItem[], folderLabel?: string) => {
      playUiSound('album', config.uiSoundsEnabled);
      setAlbumPhotos((prev) => [...added, ...prev]);
      if (folderLabel) {
        setConfig((prev) => ({ ...prev, albumFolderLabel: folderLabel }));
      }
    },
    [config.uiSoundsEnabled]
  );

  const handleApplyAlbumDirectory = useCallback(
    async (dirPath: string) => {
      const cleaned = dirPath.trim() || '/storage/emulated/0/Pictures';
      setConfig((prev) => ({ ...prev, albumFolderLabel: cleaned }));
      try {
        const res = await fetch(`/api/album/photos?dir=${encodeURIComponent(cleaned)}`);
        if (res.ok) {
          const json = (await res.json()) as {
            exists?: boolean;
            photos?: { id: string; name: string; url: string; addedAt: string }[];
          };
          if (Array.isArray(json.photos) && json.photos.length > 0) {
            setAlbumPhotos(json.photos);
            playUiSound('album', config.uiSoundsEnabled);
            showToast(`Loaded ${json.photos.length} photo(s) from ${cleaned}`);
            return;
          }
          if (json.exists) {
            setAlbumPhotos([]);
            showToast(`Photos Directory set to ${cleaned} (no images found)`);
            return;
          }
        }
      } catch {
        // Fallback for virtual/Android paths in browser preview
      }
      playUiSound('confirm', config.uiSoundsEnabled);
      showToast(`Photos Directory set to ${cleaned}`);
    },
    [config.uiSoundsEnabled, showToast]
  );

  useEffect(() => {
    let cancelled = false;
    const dir = config.albumFolderLabel;
    if (!dir || dir.includes('Local Photo')) return;
    fetch(`/api/album/photos?dir=${encodeURIComponent(dir)}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((json) => {
        if (!cancelled && json && Array.isArray(json.photos) && json.photos.length > 0) {
          setAlbumPhotos(json.photos);
        }
      })
      .catch(() => {
        // ignore in browser-only preview
      });
    return () => {
      cancelled = true;
    };
  }, [config.albumFolderLabel]);

  const toggleFavorite = useCallback(
    (gameId: string) => {
      playUiSound('tick', config.uiSoundsEnabled);
      setGames((prev) =>
        prev.map((g) => (g.id === gameId ? { ...g, favorite: !g.favorite } : g))
      );
    },
    [config.uiSoundsEnabled]
  );

  const toggleBacklog = useCallback(
    (gameId: string) => {
      playUiSound('tick', config.uiSoundsEnabled);
      setGames((prev) =>
        prev.map((g) => (g.id === gameId ? { ...g, inBacklog: !g.inBacklog } : g))
      );
    },
    [config.uiSoundsEnabled]
  );

  const toggleWishlist = useCallback(
    (id: string) => {
      playUiSound('tick', config.uiSoundsEnabled);
      setWishlistIds((prev) =>
        prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]
      );
    },
    [config.uiSoundsEnabled]
  );

  const handleInstallApkPort = useCallback(
    (summary: ApkpGameSummary, detail?: ApkpGameDetail | null) => {
      playUiSound('confirm', config.uiSoundsEnabled);
      const isNsw = summary.sourceSite === 'nswpedia' || summary.slug.startsWith('nsw-');
      const isSwitchsrom = summary.sourceSite === 'switchsrom' || summary.slug.startsWith('swr-');
      const isVimm = summary.sourceSite === 'vimm' || summary.slug.startsWith('vimm-');
      setGames((prev) => {
        if (prev.some((g) => g.apkportsSlug === summary.slug)) return prev;
        const maxSeq = prev.reduce((acc, item) => Math.max(acc, item.lastPlayedSeq ?? 0), 0);
        const added: GameItem = {
          id: `apkp-${summary.id}`,
          apkportsSlug: summary.slug,
          version: summary.version,
          title: summary.title,
          platform: isSwitchsrom || isNsw
            ? 'Nintendo Switch'
            : isVimm
              ? summary.system || "Vimm's Vault ROM"
              : summary.portType === 'official'
                ? 'Android Official Port'
                : 'APKPorts Port',
          platformShort: isSwitchsrom || isNsw ? 'switch' : isVimm ? (summary.system || 'rom').toLowerCase() : 'android',
          developer:
            detail?.developer ||
            summary.franchises[0] ||
            (isSwitchsrom ? 'SwitchsROM' : isVimm ? "Vimm's Vault" : isNsw ? 'Nintendo Switch' : 'APKPorts Community'),
          releaseYear: detail?.releaseDate?.slice(0, 4) || '2026',
          genre: summary.categories[0] || summary.system || 'Game',
          playTimeHours: 1,
          lastPlayedByUser: activeUser.name,
          playedByUsers: [{ name: activeUser.name, characterId: activeUser.characterId }],
          lastPlayedAt: 'Just Added',
          lastPlayedSeq: maxSeq + 1,
          favorite: false,
          coverUrl: summary.coverUrl,
          backgroundUrl: summary.coverUrl,
          summary:
            detail?.description ||
            summary.description ||
            `${summary.title} added to Retroid Pocket 5.`,
          fallbackDominant: { r: 30, g: 38, b: 54 },
          fallbackAccent: { r: 230, g: 0, b: 18 },
        };
        return [added, ...prev];
      });
      setSelectedIndex(0);
      setFocusZone('games');
      showToast(`Added "${summary.title}" to RP5 Home Screen`);
    },
    [activeUser.characterId, activeUser.name, config.uiSoundsEnabled, showToast]
  );

  // Web Gamepad API Support (D-Pad, Left Analog = sidebar/nav, Right Analog = smooth scroll, Select+Start OR Long-Press Select = Sleep Mode)
  const prevButtonsRef = useRef<boolean[]>([]);
  const prevAxisDirRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });
  const sleepComboTriggeredRef = useRef(false);
  const selectHoldStartRef = useRef<number | null>(null);
  const selectLongFiredRef = useRef(false);

  useEffect(() => {
    let raf = 0;
    const emitKey = (key: string) => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true }));
    };

    const poll = () => {
      const pads = navigator.getGamepads ? navigator.getGamepads() : [];
      const pad = pads?.[0];
      if (pad) {
        const pressed = pad.buttons.map((b) => b.pressed);
        const prev = prevButtonsRef.current;
        const justPressed = (idx: number) => Boolean(pressed[idx] && !prev[idx]);

        // Retroid Pocket 5 (- / Select + + / Start) simultaneously OR Long-Press Select (3000ms) -> Sleep Mode
        const selectHeld = Boolean(pressed[8]);
        const startHeld = Boolean(pressed[9]);
        if (selectHeld && startHeld) {
          selectHoldStartRef.current = null;
          selectLongFiredRef.current = false;
          if (!sleepComboTriggeredRef.current) {
            sleepComboTriggeredRef.current = true;
            playUiSound('fade', config.uiSoundsEnabled);
            setActiveModal('suspend');
          }
        } else {
          sleepComboTriggeredRef.current = false;
          if (selectHeld) {
            if (selectHoldStartRef.current === null) {
              selectHoldStartRef.current = performance.now();
            } else if (!selectLongFiredRef.current && performance.now() - selectHoldStartRef.current >= 3000) {
              selectLongFiredRef.current = true;
              playUiSound('fade', config.uiSoundsEnabled);
              setActiveModal('suspend');
            }
          } else {
            selectHoldStartRef.current = null;
            selectLongFiredRef.current = false;
          }
          if (justPressed(9)) emitKey('+');
        }

        if (justPressed(14)) emitKey('ArrowLeft');
        if (justPressed(15)) emitKey('ArrowRight');
        if (justPressed(12)) emitKey('ArrowUp');
        if (justPressed(13)) emitKey('ArrowDown');
        if (justPressed(0)) emitKey('Enter');
        if (justPressed(1)) emitKey('Escape');
        if (justPressed(2)) emitKey('x');
        if (justPressed(3)) emitKey('y');
        if (justPressed(4)) emitKey('q'); // L1 / LB
        if (justPressed(5)) emitKey('e'); // R1 / RB
        if (justPressed(6)) emitKey('PageUp'); // L2 / ZL
        if (justPressed(7)) emitKey('PageDown'); // R2 / ZR

        // Left Analog Stick (navigates sidebars & carousels/grids)
        const ax = pad.axes[0] ?? 0;
        const ay = pad.axes[1] ?? 0;
        const dirX = ax < -0.55 ? -1 : ax > 0.55 ? 1 : 0;
        const dirY = ay < -0.55 ? -1 : ay > 0.55 ? 1 : 0;
        if (dirX !== prevAxisDirRef.current.x) {
          if (dirX === -1) emitKey('ArrowLeft');
          if (dirX === 1) emitKey('ArrowRight');
        }
        if (dirY !== prevAxisDirRef.current.y) {
          if (dirY === -1) emitKey('ArrowUp');
          if (dirY === 1) emitKey('ArrowDown');
        }
        prevAxisDirRef.current = { x: dirX, y: dirY };

        // Right Analog Stick (axes 2 & 3 -> smoothly scrolls active page / menu)
        const rx = pad.axes[2] ?? 0;
        const ry = pad.axes[3] ?? 0;
        if (Math.abs(ry) > 0.25 || Math.abs(rx) > 0.25) {
          const scrollTargets = document.querySelectorAll('[data-scroll-container="true"]');
          const topMost = scrollTargets[scrollTargets.length - 1] as HTMLElement | undefined;
          if (topMost) {
            if (Math.abs(ry) > 0.25) topMost.scrollTop += ry * 14;
            if (Math.abs(rx) > 0.25) topMost.scrollLeft += rx * 14;
          }
        }

        prevButtonsRef.current = pressed;
      }
      raf = requestAnimationFrame(poll);
    };

    raf = requestAnimationFrame(poll);
    return () => cancelAnimationFrame(raf);
  }, [config.uiSoundsEnabled]);

  // Global Retroid hardware Back button -> always return straight to Home screen
  useEffect(() => {
    const returnHome = () => {
      playUiSound('back', config.uiSoundsEnabled);
      setPendingLaunchGame(null);
      setInspectedGameId(null);
      setActiveModal(null);
    };
    const onGlobalBack = (e: KeyboardEvent) => {
      if (e.key === 'BrowserBack' || e.key === 'GoBack' || e.key === 'XF86Back') {
        e.preventDefault();
        e.stopPropagation();
        returnHome();
      }
    };
    const onIframeBackMessage = (e: MessageEvent) => {
      if (e.data && typeof e.data === 'object' && e.data.type === 'skyline-browser-home-back') {
        returnHome();
      }
    };
    window.addEventListener('keydown', onGlobalBack, true);
    window.addEventListener('message', onIframeBackMessage);
    return () => {
      window.removeEventListener('keydown', onGlobalBack, true);
      window.removeEventListener('message', onIframeBackMessage);
    };
  }, [config.uiSoundsEnabled]);

  // Keyboard Navigation + -/+ Sleep Combo + Long-Press Select (-) Sleep + L1/R1 Section Switching
  const heldKeysRef = useRef<Set<string>>(new Set());
  const selectKeyHoldTimerRef = useRef<number | null>(null);

  useEffect(() => {
    const clearSelectHold = () => {
      if (selectKeyHoldTimerRef.current !== null) {
        window.clearTimeout(selectKeyHoldTimerRef.current);
        selectKeyHoldTimerRef.current = null;
      }
    };
    const onKeyUp = (e: KeyboardEvent) => {
      heldKeysRef.current.delete(e.key);
      if (e.key === '-') {
        clearSelectHold();
      }
    };
    const onKeyDown = (e: KeyboardEvent) => {
      heldKeysRef.current.add(e.key);

      // Keyboard - and + / = pressed simultaneously -> Sleep Mode Lock Screen
      if (
        heldKeysRef.current.has('-') &&
        (heldKeysRef.current.has('=') || heldKeysRef.current.has('+'))
      ) {
        clearSelectHold();
        e.preventDefault();
        playUiSound('fade', config.uiSoundsEnabled);
        setActiveModal('suspend');
        return;
      }

      const target = e.target as HTMLElement | null;
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA')) {
        return;
      }

      // Long pressing Select (-) for 3000ms (3 seconds) turns on Sleep Mode
      if (e.key === '-' && !e.repeat && selectKeyHoldTimerRef.current === null) {
        selectKeyHoldTimerRef.current = window.setTimeout(() => {
          selectKeyHoldTimerRef.current = null;
          playUiSound('fade', config.uiSoundsEnabled);
          setActiveModal('suspend');
        }, 3000);
      }

      const lower = e.key.toLowerCase();

      // L1 / R1 Dock Section Switching (only outside sections that consume L1/R1 directly)
      if (
        (lower === 'q' || e.key === '[') &&
        activeModal !== 'store' &&
        activeModal !== 'software' &&
        activeModal !== 'news' &&
        activeModal !== 'nso' &&
        activeModal !== 'userSelect' &&
        activeModal !== 'gameEdit' &&
        activeModal !== 'gamePage'
      ) {
        e.preventDefault();
        cycleDockSection(-1);
        return;
      }
      if (
        (lower === 'e' || e.key === ']') &&
        activeModal !== 'store' &&
        activeModal !== 'software' &&
        activeModal !== 'news' &&
        activeModal !== 'nso' &&
        activeModal !== 'userSelect' &&
        activeModal !== 'gameEdit' &&
        activeModal !== 'gamePage'
      ) {
        e.preventDefault();
        cycleDockSection(1);
        return;
      }

      if (activeModal) {
        return;
      }

      const maxCarouselIdx = homeGames.length;

      if (e.key === 'ArrowLeft') {
        e.preventDefault();
        playUiSound('tick', config.uiSoundsEnabled);
        if (focusZone === 'games') {
          setSelectedIndex((prev) => (prev > 0 ? prev - 1 : maxCarouselIdx));
        } else if (focusZone === 'dock') {
          setFocusedDockIndex((prev) => (prev > 0 ? prev - 1 : DOCK_BUTTONS.length - 1));
        }
      } else if (e.key === 'ArrowRight') {
        e.preventDefault();
        playUiSound('tick', config.uiSoundsEnabled);
        if (focusZone === 'games') {
          setSelectedIndex((prev) => (prev < maxCarouselIdx ? prev + 1 : 0));
        } else if (focusZone === 'dock') {
          setFocusedDockIndex((prev) => (prev < DOCK_BUTTONS.length - 1 ? prev + 1 : 0));
        }
      } else if (e.key === 'ArrowDown') {
        e.preventDefault();
        playUiSound('tick', config.uiSoundsEnabled);
        if (focusZone === 'profile') {
          setFocusZone('games');
        } else if (focusZone === 'games') {
          setFocusZone('dock');
        }
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        playUiSound('tick', config.uiSoundsEnabled);
        if (focusZone === 'dock') {
          setFocusZone('games');
        } else if (focusZone === 'games') {
          setFocusZone('profile');
        }
      } else if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        if (focusZone === 'games') {
          handleActivateCarouselItem(selectedIndex);
        } else if (focusZone === 'dock') {
          const btn = DOCK_BUTTONS[focusedDockIndex];
          if (btn) handleDockAction(focusedDockIndex, btn.action);
        } else if (focusZone === 'profile') {
          playUiSound('user', config.uiSoundsEnabled);
          setPendingLaunchGame(null);
          setActiveModal('userSelect');
        }
      } else if (lower === 'b' || e.key === 'Escape' || e.key === 'Backspace') {
        e.preventDefault();
        playUiSound('tick', config.uiSoundsEnabled);
        if (focusZone === 'dock' && focusedDockIndex === 9) {
          setActiveModal('suspend');
        } else {
          setFocusZone('dock');
          setFocusedDockIndex(9); // Sleep Mode icon
        }
      } else if (lower === 's') {
        e.preventDefault();
        openProfileSettings('profile');
      } else if ((e.key === '+' || e.key === '=') && activeGame) {
        e.preventDefault();
        playUiSound('confirm', config.uiSoundsEnabled);
        setActiveModal('gameEdit');
      } else if (lower === 'y' && carouselGame) {
        e.preventDefault();
        playUiSound('confirm', config.uiSoundsEnabled);
        setInspectedGameId(null);
        setActiveModal('gamePage');
      } else if (lower === 'x' && carouselGame) {
        e.preventDefault();
        toggleFavorite(carouselGame.id);
      }
    };

    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    return () => {
      clearSelectHold();
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
    };
  }, [
    activeModal,
    activeGame,
    carouselGame,
    config.uiSoundsEnabled,
    cycleDockSection,
    focusZone,
    focusedDockIndex,
    homeGames.length,
    handleActivateCarouselItem,
    handleDockAction,
    openProfileSettings,
    selectedIndex,
    toggleFavorite,
  ]);

  const installedSlugs = useMemo(
    () => games.map((g) => g.apkportsSlug).filter((s): s is string => Boolean(s)),
    [games]
  );

  return (
    <div className="w-screen h-screen overflow-hidden flex items-center justify-center bg-[#0B0C0F]">
      {/* Retroid Pocket 5 (16:9) Display Stage */}
      <main
        ref={stageRef}
        tabIndex={-1}
        data-testid="rp5-stage"
        className="relative flex flex-col overflow-hidden transition-colors duration-300 focus:outline-none"
        style={{
          width: `${stageSize.width}px`,
          height: `${stageSize.height}px`,
          backgroundColor: palette.canvasBg,
          filter: `brightness(${config.brightnessPct / 100})`,
          border:
            config.rp5FrameMode === 'fit-16-9'
              ? '1px solid rgba(255, 255, 255, 0.08)'
              : 'none',
        }}
      >
        {/* Game Background Artwork + Lightweight Auto-Starting Trailer Video */}
        {config.enableBackgroundArt && activeGame && (
          <div
            aria-hidden="true"
            data-testid="game-background-art"
            className="absolute inset-0 pointer-events-none overflow-hidden"
          >
            {(() => {
              const blurPx = Math.round(((config.backgroundBlurPct ?? 25) / 100) * 32);
              return (
                <img
                  key={`${activeGame.id}-${activeGame.backgroundUrl || activeGame.coverUrl}`}
                  src={activeGame.backgroundUrl || activeGame.coverUrl}
                  alt=""
                  referrerPolicy="no-referrer"
                  className="w-full h-full object-cover transition-all duration-300"
                  style={{
                    opacity: bgImageOpacity,
                    filter: blurPx > 0 ? `blur(${blurPx}px)` : 'none',
                    transform: blurPx > 0 ? 'scale(1.1)' : 'scale(1.02)',
                  }}
                />
              );
            })()}

            <div
              className="absolute inset-0 transition-colors duration-300"
              style={{
                background: `radial-gradient(circle at 50% 42%, transparent 0%, ${palette.backdropWash} 72%, rgba(0, 0, 0, 0.16) 100%)`,
              }}
            />
          </div>
        )}

        {/* Top Status Bar */}
        <TopStatusBar
          metrics={metrics}
          palette={palette}
          config={config}
          activeUser={activeUser}
          activeGame={activeGame}
          focusZone={focusZone}
          onProfileClick={() => {
            playUiSound('user', config.uiSoundsEnabled);
            setPendingLaunchGame(null);
            setFocusZone('profile');
            setActiveModal('userSelect');
          }}
          onStatusClick={() => openProfileSettings('customize')}
        />

        {/* Horizontal Switch 2 Game Carousel (Latest 10 Played) */}
        <HomeCarousel
          games={homeGames}
          selectedIndex={selectedIndex}
          focusZone={focusZone}
          metrics={metrics}
          palette={palette}
          onSelectIndex={(idx) => {
            playUiSound('tick', config.uiSoundsEnabled);
            setFocusZone('games');
            setInspectedGameId(null);
            setSelectedIndex(idx);
          }}
          onActivateItem={handleActivateCarouselItem}
          onLongPressEdit={(game, idx) => {
            playUiSound('confirm', config.uiSoundsEnabled);
            setFocusZone('games');
            setSelectedIndex(idx);
            setInspectedGameId(game.id);
            setActiveModal('gameEdit');
          }}
        />

        {/* Solid Borderless Bottom System Dock */}
        <BottomDock
          metrics={metrics}
          palette={palette}
          focusZone={focusZone}
          focusedDockIndex={focusedDockIndex}
          hoveredDockIndex={hoveredDockIndex}
          onHoverDock={setHoveredDockIndex}
          onClickDock={handleDockAction}
        />

        {/* Bottom Controller Help Bar */}
        <ControllerHelpBar
          metrics={metrics}
          palette={palette}
          activeGame={carouselGame}
          onLaunch={() => handleActivateCarouselItem(selectedIndex)}
          onDetails={() => {
            playUiSound('confirm', config.uiSoundsEnabled);
            if (carouselGame) {
              setInspectedGameId(null);
              setActiveModal('gamePage');
            } else {
              setActiveModal('software');
            }
          }}
          onToggleFavorite={() => {
            if (carouselGame) toggleFavorite(carouselGame.id);
          }}
          onSleepMode={() => {
            playUiSound('tick', config.uiSoundsEnabled);
            setFocusZone('dock');
            setFocusedDockIndex(9);
          }}
          onOpenGameSettings={() => {
            playUiSound('confirm', config.uiSoundsEnabled);
            if (carouselGame) setActiveModal('gameEdit');
            else openProfileSettings('customize');
          }}
        />

        {/* Full-Screen Game Page */}
        {activeModal === 'gamePage' && activeGame && (
          <GamePageView
            game={activeGame}
            config={config}
            palette={palette}
            metrics={metrics}
            onPlayRequest={requestPlayWithProfileCheck}
            onToggleFavorite={toggleFavorite}
            onTrailerResolved={handleTrailerResolved}
            onOpenGameEdit={() => {
              playUiSound('confirm', config.uiSoundsEnabled);
              setActiveModal('gameEdit');
            }}
            onClose={() => {
              playUiSound('back', config.uiSoundsEnabled);
              setInspectedGameId(null);
              setActiveModal(null);
            }}
          />
        )}

        {/* In-App Switch 2 Internet Browser */}
        {activeModal === 'browser' && (
          <BrowserView
            initialUrl={browserUrl}
            palette={palette}
            metrics={metrics}
            onClose={() => {
              playUiSound('back', config.uiSoundsEnabled);
              setActiveModal(null);
            }}
          />
        )}

        {/* Full-Screen All Software Section */}
        {activeModal === 'software' && (
          <AllSoftwareGridView
            games={games}
            allSoftwareSizePct={config.allSoftwareSizePct}
            palette={palette}
            metrics={metrics}
            onChangeSizePct={(nextPct) => setConfig((prev) => ({ ...prev, allSoftwareSizePct: nextPct }))}
            onLongPressEdit={(game) => {
              playUiSound('confirm', config.uiSoundsEnabled);
              setInspectedGameId(game.id);
              setActiveModal('gameEdit');
            }}
            onSelectAndLaunch={(game) => {
              requestPlayWithProfileCheck(game);
            }}
            onOpenDetails={(game) => {
              playUiSound('confirm', config.uiSoundsEnabled);
              const homeIdx = homeGames.findIndex((h) => h.id === game.id);
              if (homeIdx >= 0) setSelectedIndex(homeIdx);
              setInspectedGameId(game.id);
              setFocusZone('games');
              setActiveModal('gamePage');
            }}
            onClose={() => {
              playUiSound('back', config.uiSoundsEnabled);
              setActiveModal(null);
            }}
          />
        )}

        {(activeModal === 'nso' || activeModal === 'news') && (
          <NewsGridView
            mode={activeModal}
            browserMode={config.browserMode}
            palette={palette}
            metrics={metrics}
            onOpenInBrowser={openBrowser}
            onClose={() => {
              playUiSound('back', config.uiSoundsEnabled);
              setActiveModal(null);
            }}
          />
        )}

        {activeModal === 'chat' && (
          <ChatView
            palette={palette}
            metrics={metrics}
            onAddFriend={(code) => showToast(`Friend request sent to ${code}`)}
            onClose={() => {
              playUiSound('back', config.uiSoundsEnabled);
              setActiveModal(null);
            }}
          />
        )}

        {activeModal === 'store' && (
          <EShopView
            metrics={metrics}
            palette={palette}
            activeUser={activeUser}
            wishlistIds={wishlistIds}
            installedSlugs={installedSlugs}
            fontScalePct={config.systemFontScalePct}
            onToggleWishlist={toggleWishlist}
            onInstallToHome={handleInstallApkPort}
            onOpenDownloadPage={openInChromeExternal}
            onOpenUserSelect={() => {
              setPendingLaunchGame(null);
              setActiveModal('userSelect');
            }}
            onClose={() => {
              playUiSound('back', config.uiSoundsEnabled);
              setActiveModal(null);
            }}
          />
        )}

        {activeModal === 'album' && (
          <AlbumLauncherView
            photos={albumPhotos}
            folderLabel={config.albumFolderLabel}
            palette={palette}
            metrics={metrics}
            onAddPhotos={handleAddAlbumPhotos}
            onClose={() => {
              playUiSound('back', config.uiSoundsEnabled);
              setActiveModal(null);
            }}
          />
        )}

        {activeModal === 'gameshare' && (
          <GameShareView
            activeUser={activeUser}
            users={users}
            games={games}
            palette={palette}
            metrics={metrics}
            fontScalePct={config.systemFontScalePct}
            onSelectGame={(idx) => {
              const target = games[idx];
              if (target) {
                const homeIdx = homeGames.findIndex((h) => h.id === target.id);
                if (homeIdx >= 0) setSelectedIndex(homeIdx);
                else setInspectedGameId(target.id);
              }
              setFocusZone('games');
            }}
            onToggleBacklog={toggleBacklog}
            onClose={() => {
              playUiSound('back', config.uiSoundsEnabled);
              setActiveModal(null);
            }}
          />
        )}

        {activeModal === 'settings' && (
          <ProfileSettingsView
            initialTab={settingsInitialTab}
            activeUser={activeUser}
            users={users}
            games={games}
            playActivityLog={playActivityLog}
            config={config}
            palette={palette}
            metrics={metrics}
            onUpdateConfig={setConfig}
            onRenameUser={handleRenameUser}
            onSelectUser={(uid) => {
              setActiveUserId(uid);
              const found = users.find((u) => u.id === uid);
              if (found) setConfig((prev) => ({ ...prev, username: found.name }));
              playUiSound('confirm', config.uiSoundsEnabled);
            }}
            onDeleteUser={handleDeleteUser}
            onLoadAlbumPhotos={handleLoadAlbumPhotos}
            onApplyAlbumDirectory={handleApplyAlbumDirectory}
            onBulkScrapeSystem={handleBulkScrapeSystem}
            onOpenUserSelect={() => {
              setPendingLaunchGame(null);
              setActiveModal('userSelect');
            }}
            onSelectGame={(idx) => {
              const target = games[idx];
              if (target) {
                const homeIdx = homeGames.findIndex((h) => h.id === target.id);
                if (homeIdx >= 0) setSelectedIndex(homeIdx);
                else setInspectedGameId(target.id);
              }
              setFocusZone('games');
            }}
            onClose={() => {
              playUiSound('back', config.uiSoundsEnabled);
              setActiveModal(null);
            }}
          />
        )}

        {/* Fast Slide-Up/Down User Select / "¿Quién está jugando?" Overlay */}
        <UserSelectOverlay
          isOpen={activeModal === 'userSelect'}
          title="¿Quién está jugando?"
          users={users}
          activeUserId={activeUserId}
          palette={palette}
          metrics={metrics}
          onSelectUser={handleSelectUser}
          onAddUser={handleAddUser}
          onDeleteUser={handleDeleteUser}
          onClose={() => {
            playUiSound('back', config.uiSoundsEnabled);
            setPendingLaunchGame(null);
            setActiveModal(null);
          }}
        />

        {/* Fast Slide-Up/Down + Settings Game Overlay */}
        <GameEditOverlay
          isOpen={activeModal === 'gameEdit'}
          game={activeGame}
          palette={palette}
          metrics={metrics}
          onSaveGame={handleSaveGameEdit}
          onToggleFavorite={toggleFavorite}
          onClose={() => {
            playUiSound('back', config.uiSoundsEnabled);
            setActiveModal(null);
          }}
        />

        {/* Active Play Session Return Trigger (logs exact elapsed minutes) */}
        {activePlaySession && !activeModal && (
          <button
            type="button"
            data-testid="btn-return-to-launcher"
            onClick={() => finishActivePlaySession(true)}
            className="absolute top-6 right-8 z-40 px-4 py-2 rounded-full text-xs font-ud-bold text-white cursor-pointer hover:opacity-90 shadow-lg flex items-center gap-2"
            style={{
              backgroundColor: palette.borderPrimary,
              border: '1.5px solid rgba(255,255,255,0.28)',
            }}
          >
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
            <span>Playing {activePlaySession.title} · Return &amp; Log Time</span>
          </button>
        )}

        {/* Launch / Action Confirmation Toast */}
        {launchNotice && (
          <div
            role="status"
            data-testid="launch-toast"
            className="absolute top-6 left-1/2 -translate-x-1/2 z-50 px-5 py-2.5 rounded-full text-xs font-ud-medium text-white"
            style={{
              backgroundColor: palette.borderPrimary,
              border: '1px solid rgba(255,255,255,0.22)',
            }}
          >
            {launchNotice}
          </div>
        )}

        {/* Nintendo Switchboard Lock Screen inside RP5 Stage */}
        {activeModal === 'suspend' && (
          <SecondaryModals
            activeModal="suspend"
            selectedGame={activeGame}
            palette={palette}
            config={config}
            onClose={() => {
              playUiSound('confirm', config.uiSoundsEnabled);
              setActiveModal(null);
            }}
            onOpenNewsFromLock={() => {
              playUiSound('fade', config.uiSoundsEnabled);
              setActiveModal('news');
            }}
          />
        )}
      </main>
    </div>
  );
}
