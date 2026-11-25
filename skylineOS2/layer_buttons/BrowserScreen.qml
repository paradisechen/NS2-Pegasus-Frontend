// skylineOS 2 — BrowserScreen.qml (Netflix Streaming Hub: LaMovie 630+ pages + Fanpelis.to merged, Separate YouTube/Dailymotion HLS, 2-Line Season/Episode, Grid Zoom 4x4/3x3/2x1, Flat Switch OSD Player)
import QtQuick 2.12
import QtQuick.Layouts 1.3
import QtMultimedia 5.9
import QtGraphicalEffects 1.0

FocusScope {
    id: browserRoot
    anchors.fill: parent

    property string homeUrl: "https://lamovie.org"
    property string currentUrl: homeUrl
    property string pageTitle: "Netflix"
    property string searchQuery: ""
    property string inputUrl: searchQuery !== "" ? searchQuery : currentUrl
    property bool isLoading: false
    property bool editingUrl: false
    property string activeTab: "forme" // "forme" | "continue" | "favorites" | "movies" | "series" | "youtube" | "genre" | "external"
    property string selectedGenre: ""
    property int sidebarFocusIdx: 0
    property int gridIndex: 0
    property int gridCols: 4 // 4 = 4x4, 3 = 3x3, 2 = 2x1 carousel
    property string focusZone: "grid" // "sidebar" | "grid" | "detail" | "fullscreenVideo"

    // A-Z Alphabet + Dynamic Pagination & Full 630+ LaMovie + Fanpelis Catalog
    property var alphabetLetters: ["All", "#", "A", "B", "C", "D", "E", "F", "G", "H", "I", "J", "K", "L", "M", "N", "O", "P", "Q", "R", "S", "T", "U", "V", "W", "X", "Y", "Z"]
    property string activeLetter: "All"
    property int itemsPerPage: gridCols === 4 ? 16 : (gridCols === 3 ? 9 : 2)
    property int currentPage: 0
    property int moviesApiPage: 1
    property int seriesApiPage: 1
    property int fanMoviesApiPage: 1
    property int fanSeriesApiPage: 1
    property int lamovieMaxPages: 700
    property int fanpelisMaxPages: 500
    property bool hasMoreMovies: true
    property bool hasMoreSeries: true
    property bool hasMoreFanMovies: true
    property bool hasMoreFanSeries: true
    property bool feedBusy: false

    // Detail + Preview Pause/Play + Native Fullscreen Switch Player
    property bool detailOpen: false
    property var detailItem: ({})
    property string detailSynopsis: ""
    property string detailPreviewUrl: ""
    property string detailPreviewDirectUrl: ""
    property string detailPlayUrl: ""
    property string detailBackdrop: ""
    property bool previewPaused: false
    property bool streamsLoading: false
    property bool fullscreenPending: false
    property bool fullscreenVideo: false
    property string fullscreenStatusText: ""
    property string activeFullscreenStream: ""
    property int detailBtnIdx: 1 // 0=Preview Pause/Play, 1=Play Fullscreen, 2=Favorite, 3=Open External
    property int aspectMode: 0 // 0=Fit, 1=16:9, 2=1:1, 3=Fill
    property bool osdVisible: true
    property real gridAnimOffset: 0

    property var inlineWebView: null
    property var fullWebView: null
    property var nativeWebView: null

    property var savedFavorites: []
    property var continueWatching: []
    property var allStreamItems: []
    ListModel { id: filteredStreamModel }
    ListModel { id: pageStreamModel }
    ListModel { id: seasonsModel }
    ListModel { id: episodesModel }
    ListModel { id: playerSourcesModel }
    property int activeSeason: 1
    property int selectedEpisodeIdx: 0
    property int selectedPlayerIdx: 0

    // Live LaMovie genre ID mapping
    property var lamovieGenreMap: ({
        "32": "Acción",
        "705": "Action & Adventure",
        "520": "Animación",
        "130": "Aventura",
        "3056": "Bélica",
        "131": "Ciencia Ficción",
        "18": "Comedia",
        "180": "Crimen",
        "164": "Documental",
        "17": "Drama",
        "398": "Familia",
        "229": "Fantasía",
        "165": "Historia",
        "703": "Kids",
        "97": "Misterio",
        "8": "Música",
        "6787": "Película de TV",
        "12485": "Reality",
        "115": "Romance",
        "704": "Sci-Fi & Fantasy",
        "19824": "Soap",
        "33": "Suspense",
        "9532": "Talk",
        "96": "Terror",
        "786": "War & Politics",
        "674": "Western"
    })

    // Live Fanpelis.to genre ID mapping
    property var fanpelisGenreMap: ({
        "1572": "Acción",
        "1600": "Action & Adventure",
        "1584": "Animación",
        "1581": "Aventura",
        "1609": "Bélica",
        "1596": "Ciencia Ficción",
        "1580": "Comedia",
        "1577": "Crimen",
        "1592": "Documental",
        "1578": "Drama",
        "1593": "Familia",
        "1583": "Fantasía",
        "1610": "Historia",
        "1597": "Misterio",
        "1602": "Romance",
        "1576": "Suspense",
        "1591": "Terror",
        "1620": "Western"
    })

    property var sidebarItems: [
        { id: "forme",        label: "For Me",             kind: "tab",    genre: "", lmIds: "", fpIds: "" },
        { id: "continue",     label: "Continue",           kind: "tab",    genre: "", lmIds: "", fpIds: "" },
        { id: "favorites",    label: "★ Favorites",        kind: "tab",    genre: "", lmIds: "", fpIds: "" },
        { id: "movies",       label: "Movies",             kind: "tab",    genre: "", lmIds: "", fpIds: "" },
        { id: "series",       label: "Series",             kind: "tab",    genre: "", lmIds: "", fpIds: "" },
        { id: "youtube",      label: "YouTube",            kind: "tab",    genre: "", lmIds: "", fpIds: "" },
        { id: "hdr_cat",      label: "Categorías",         kind: "header", genre: "", lmIds: "", fpIds: "" },
        { id: "g_action",     label: "Acción",             kind: "genre",  genre: "acción|action",               lmIds: "32,705", fpIds: "1572,1600" },
        { id: "g_actadv",     label: "Action & Adventure", kind: "genre",  genre: "action & adventure|aventura", lmIds: "705",    fpIds: "1600" },
        { id: "g_anime",      label: "Animación",          kind: "genre",  genre: "animación|anime",             lmIds: "520",    fpIds: "1584" },
        { id: "g_adventure",  label: "Aventura",           kind: "genre",  genre: "aventura|adventure",          lmIds: "130",    fpIds: "1581" },
        { id: "g_war",        label: "Bélica",             kind: "genre",  genre: "bélica|war|guerra",           lmIds: "3056,786", fpIds: "1609" },
        { id: "g_scifi",      label: "Ciencia Ficción",    kind: "genre",  genre: "ciencia ficción|sci-fi",      lmIds: "131,704", fpIds: "1596" },
        { id: "g_comedy",     label: "Comedia",            kind: "genre",  genre: "comedia|comedy",              lmIds: "18",     fpIds: "1580" },
        { id: "g_crime",      label: "Crimen",             kind: "genre",  genre: "crimen|crime",                lmIds: "180",    fpIds: "1577" },
        { id: "g_doc",        label: "Documental",         kind: "genre",  genre: "documental|documentary",      lmIds: "164",    fpIds: "1592" },
        { id: "g_drama",      label: "Drama",              kind: "genre",  genre: "drama",                       lmIds: "17",     fpIds: "1578" },
        { id: "g_family",     label: "Familia",            kind: "genre",  genre: "familia|family|kids",         lmIds: "398,703", fpIds: "1593" },
        { id: "g_fantasy",    label: "Fantasía",           kind: "genre",  genre: "fantasía|fantasy",            lmIds: "229,704", fpIds: "1583" },
        { id: "g_history",    label: "Historia",           kind: "genre",  genre: "historia|history",            lmIds: "165",    fpIds: "1610" },
        { id: "g_mystery",    label: "Misterio",           kind: "genre",  genre: "misterio|mystery",            lmIds: "97",     fpIds: "1597" },
        { id: "g_romance",    label: "Romance",            kind: "genre",  genre: "romance",                     lmIds: "115",    fpIds: "1602" },
        { id: "g_suspense",   label: "Suspense",           kind: "genre",  genre: "suspense|suspenso|thriller",  lmIds: "33",     fpIds: "1576" },
        { id: "g_horror",     label: "Terror",             kind: "genre",  genre: "terror|horror",               lmIds: "96",     fpIds: "1591" },
        { id: "g_western",    label: "Western",            kind: "genre",  genre: "western",                     lmIds: "674",    fpIds: "1620" }
    ]

    property var fallbackCatalog: [
        { id: "27988", slug: "lm-movie-27988", apiSlug: "la-familia-mitchell-vs-las-maquinas-2021", mediaType: "movie", source: "LaMovie", sourceProvider: "lamovie", altId: "", altSlug: "", altProvider: "", title: "La familia Mitchell vs. las máquinas", year: "2021", rating: "7.8", genre: "Animación / Aventura", thumb: "https://lamovie.org/wp-content/uploads/thumbs/049d3d9696bc3de22323ffb9009edf55_hd.webp", backdrop: "https://lamovie.org/wp-content/uploads/backdrops/049d3d9696bc3de22323ffb9009edf55.webp", overview: "El apocalipsis robot llegó y puso freno al viaje por carretera de los Mitchell, la familia más rara del mundo.", trailerId: "", dmId: "", pageUrl: "https://lamovie.org/peliculas/la-familia-mitchell-vs-las-maquinas-2021/" },
        { id: "14552", slug: "lm-series-14552", apiSlug: "csi-miami-2002", mediaType: "series", source: "LaMovie", sourceProvider: "lamovie", altId: "", altSlug: "", altProvider: "", title: "CSI: Miami", year: "2002", rating: "7.5", genre: "Crimen / Drama", thumb: "https://lamovie.org/wp-content/uploads/thumbs/806beafe154032a5b818e97b4420ad98_hd.webp", backdrop: "https://lamovie.org/wp-content/uploads/backdrops/806beafe154032a5b818e97b4420ad98.webp", overview: "El equipo forense de Miami investiga casos complejos combinando ciencia avanzada y trabajo de campo.", trailerId: "", dmId: "", pageUrl: "https://lamovie.org/series/csi-miami-2002/" },
        { id: "x9c5o1k", slug: "dm-x9c5o1k", apiSlug: "x9c5o1k", mediaType: "youtube", source: "YouTube", sourceProvider: "youtube", altId: "", altSlug: "", altProvider: "", title: "Nintendo Switch 2 Official Reveal Trailer", year: "2026", rating: "HD", genre: "Videos / Gaming", thumb: "https://s1.dmcdn.net/v/Xg5L81dY3sE0v4fX1/x720", backdrop: "https://s1.dmcdn.net/v/Xg5L81dY3sE0v4fX1/x720", overview: "Nintendo Switch 2 reveal and gameplay showcase.", trailerId: "", dmId: "x9c5o1k", pageUrl: "https://www.dailymotion.com/video/x9c5o1k" }
    ]

    function decodeEntities(str) {
        return String(str || "")
            .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
            .replace(/&#(\d+);/g, function(_, dec) { return String.fromCharCode(parseInt(dec, 10)); })
            .replace(/&#x([0-9a-fA-F]+);/g, function(_, hex) { return String.fromCharCode(parseInt(hex, 16)); })
            .replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">")
            .replace(/&quot;/g, "\"").replace(/&#0?39;|&apos;/g, "'").replace(/&nbsp;/g, " ");
    }

    function normalizeMediaTitleKey(title) {
        return String(title || "")
            .toLowerCase()
            .replace(/[áàäâã]/g, "a")
            .replace(/[éèëê]/g, "e")
            .replace(/[íìïî]/g, "i")
            .replace(/[óòöôõ]/g, "o")
            .replace(/[úùüû]/g, "u")
            .replace(/ñ/g, "n")
            .replace(/\(.*?\)/g, " ")
            .replace(/[^a-z0-9]/g, "");
    }

    function formatMsTime(ms) {
        var totalSec = Math.max(0, Math.floor((Number(ms) || 0) / 1000));
        var h = Math.floor(totalSec / 3600);
        var m = Math.floor((totalSec % 3600) / 60);
        var s = totalSec % 60;
        var msStr = (m < 10 && h > 0 ? "0" : "") + m + ":" + (s < 10 ? "0" : "") + s;
        return h > 0 ? (h + ":" + msStr) : msStr;
    }

    function wakePlayerOsd() {
        osdVisible = true;
        osdHideTimer.restart();
    }

    Timer {
        id: osdHideTimer
        interval: 4200
        repeat: false
        onTriggered: {
            if (browserRoot.fullscreenVideo && fullscreenVideoPlayer.playbackState === MediaPlayer.PlayingState) {
                browserRoot.osdVisible = false;
            }
        }
    }

    function triggerGridSoftSlide(dirSign) {
        gridAnimOffset = dirSign * vpx(46);
        gridSlideBackAnim.restart();
    }

    NumberAnimation {
        id: gridSlideBackAnim
        target: browserRoot
        property: "gridAnimOffset"
        to: 0
        duration: 210
        easing.type: Easing.OutCubic
    }

    function cycleGridZoom() {
        if (gridCols === 4) gridCols = 3;
        else if (gridCols === 3) gridCols = 2;
        else gridCols = 4;
        currentPage = 0;
        gridIndex = 0;
        navSound.play();
        triggerGridSoftSlide(1);
        rebuildPageSlice();
    }

    function cycleAspectMode() {
        aspectMode = (aspectMode + 1) % 4;
        navSound.play();
        wakePlayerOsd();
    }

    function seekFullscreenRelative(deltaMs) {
        if (!fullscreenVideo) return;
        wakePlayerOsd();
        try {
            if (fullscreenVideoPlayer && fullscreenVideoPlayer.seekable && fullscreenVideoPlayer.duration > 0) {
                var nextPos = Math.max(0, Math.min(fullscreenVideoPlayer.duration - 500, fullscreenVideoPlayer.position + deltaMs));
                fullscreenVideoPlayer.seek(nextPos);
            }
        } catch (e) {}
    }

    function toggleFullscreenPlayPause() {
        if (!fullscreenVideo) return;
        wakePlayerOsd();
        try {
            if (fullscreenVideoPlayer.playbackState === MediaPlayer.PlayingState) {
                fullscreenVideoPlayer.pause();
            } else {
                fullscreenVideoPlayer.play();
            }
        } catch (e) {}
    }

    function loadSavedFavorites() {
        var raw = (typeof api !== "undefined" && api.memory && api.memory.has("BROWSER_FAVORITES")) ? String(api.memory.get("BROWSER_FAVORITES")) : "[]";
        var arr = [];
        try {
            var parsed = JSON.parse(raw);
            if (Array.isArray(parsed)) arr = parsed;
        } catch (e) { arr = []; }
        savedFavorites = arr;
    }

    function loadContinueWatching() {
        var raw = (typeof api !== "undefined" && api.memory && api.memory.has("NETFLIX_HISTORY")) ? String(api.memory.get("NETFLIX_HISTORY")) : "[]";
        var arr = [];
        try {
            var parsed = JSON.parse(raw);
            if (Array.isArray(parsed)) arr = parsed;
        } catch (e) { arr = []; }
        continueWatching = arr;
    }

    function recordContinueWatching(item) {
        if (!item || !item.title) return;
        var key = String(item.slug || item.pageUrl || item.title);
        var next = [{
            id: String(item.id || ""),
            slug: key,
            apiSlug: String(item.apiSlug || ""),
            mediaType: String(item.mediaType || "movie"),
            source: String(item.source || "LaMovie"),
            sourceProvider: String(item.sourceProvider || "lamovie"),
            altId: String(item.altId || ""),
            altSlug: String(item.altSlug || ""),
            altProvider: String(item.altProvider || ""),
            title: String(item.title || ""),
            year: String(item.year || ""),
            rating: String(item.rating || ""),
            genre: String(item.genre || ""),
            thumb: String(item.thumb || item.backdrop || ""),
            backdrop: String(item.backdrop || item.thumb || ""),
            overview: String(item.overview || ""),
            trailerId: String(item.trailerId || ""),
            dmId: String(item.dmId || ""),
            pageUrl: String(item.pageUrl || "https://lamovie.org")
        }];
        for (var i = 0; i < continueWatching.length && next.length < 24; i++) {
            var cur = continueWatching[i];
            if (cur && cur.slug !== key) next.push(cur);
        }
        continueWatching = next;
        if (typeof api !== "undefined" && api.memory) {
            try { api.memory.set("NETFLIX_HISTORY", JSON.stringify(next)); } catch (e) {}
        }
    }

    function isFavoriteItem(slugOrUrl) {
        for (var i = 0; i < savedFavorites.length; i++) {
            var it = savedFavorites[i];
            if (it && (it.slug === slugOrUrl || it.url === slugOrUrl)) return true;
        }
        return false;
    }

    function toggleFavorite() {
        var target = detailOpen ? detailItem : (pageStreamModel.count > 0 && gridIndex < pageStreamModel.count ? pageStreamModel.get(gridIndex) : null);
        if (!target) return;
        var key = String(target.slug || target.pageUrl || target.title || "");
        if (key === "") return;
        var next = [];
        var found = false;
        for (var i = 0; i < savedFavorites.length; i++) {
            var f = savedFavorites[i];
            if (!f) continue;
            if (f.slug === key || f.url === key) { found = true; }
            else { next.push(f); }
        }
        if (!found) {
            next.unshift({
                id: String(target.id || ""),
                slug: String(target.slug || key),
                apiSlug: String(target.apiSlug || ""),
                url: String(target.pageUrl || key),
                label: String(target.title || key),
                title: String(target.title || key),
                mediaType: String(target.mediaType || "movie"),
                source: String(target.source || "LaMovie"),
                sourceProvider: String(target.sourceProvider || "lamovie"),
                altId: String(target.altId || ""),
                altSlug: String(target.altSlug || ""),
                altProvider: String(target.altProvider || ""),
                year: String(target.year || ""),
                rating: String(target.rating || ""),
                genre: String(target.genre || ""),
                thumb: String(target.thumb || ""),
                backdrop: String(target.backdrop || target.thumb || ""),
                overview: String(target.overview || ""),
                trailerId: String(target.trailerId || ""),
                dmId: String(target.dmId || ""),
                pageUrl: String(target.pageUrl || key)
            });
            turnOnSfx.play();
        } else {
            turnOffSfx.play();
        }
        savedFavorites = next;
        if (typeof api !== "undefined" && api.memory) {
            api.memory.set("BROWSER_FAVORITES", JSON.stringify(next));
        }
        if (activeTab === "favorites") rebuildFilteredStream();
    }

    function normalizeMediaImage(rawPath, siteOrigin) {
        var p = String(rawPath || "").trim();
        if (p === "") return "";
        if (p.indexOf("http://") === 0 || p.indexOf("https://") === 0) return p;
        if (p.indexOf("//") === 0) return "https:" + p;
        if (siteOrigin === "fanpelis") {
            return "https://fanpelis.to/wp-content/uploads" + (p.indexOf("/") === 0 ? p : "/" + p);
        }
        return "https://lamovie.org/wp-content/uploads" + (p.indexOf("/") === 0 ? p : "/" + p);
    }

    function parseProviderList(jsonText, mediaType, providerName) {
        var out = [];
        var isFp = (providerName === "fanpelis");
        var totalPagesOut = 0;
        try {
            var parsed = JSON.parse(jsonText);
            if (parsed && parsed.data && parsed.data.pagination) {
                var pg = parsed.data.pagination;
                totalPagesOut = parseInt(pg.last_page || pg.totalPages || pg.total_pages || 0, 10) || 0;
            }
            var posts = (parsed && parsed.data && Array.isArray(parsed.data.posts)) ? parsed.data.posts
                      : (parsed && Array.isArray(parsed.posts) ? parsed.posts
                      : (Array.isArray(parsed) ? parsed : []));
            for (var i = 0; i < posts.length; i++) {
                var p = posts[i];
                if (!p) continue;
                var pid = String(p._id || p.id || p.slug || i);
                var title = decodeEntities(p.title || p.name || "");
                if (title === "") continue;
                var rawType = String(p.type || p.post_type || "").toLowerCase();
                var resolvedType = (rawType === "tvshows" || rawType === "series" || mediaType === "series") ? "series" : "movie";
                var imgs = p.images || {};
                var poster = normalizeMediaImage(imgs.poster || p.poster || p.image || "", providerName);
                var back = normalizeMediaImage(imgs.backdrop || p.backdrop || imgs.poster || p.poster || "", providerName);
                var yr = p.release_date ? String(p.release_date).slice(0, 4) : (p.year ? String(p.year) : "");
                var rate = p.rating ? String(p.rating) : (p.vote_average ? Number(p.vote_average).toFixed(1) : "");
                var gmap = isFp ? fanpelisGenreMap : lamovieGenreMap;
                var genreStr = resolvedType === "series" ? "Series" : "Películas";
                if (Array.isArray(p.genres) && p.genres.length > 0) {
                    var gnames = [];
                    for (var g = 0; g < Math.min(3, p.genres.length); g++) {
                        var gv = p.genres[g];
                        var gName = "";
                        if (typeof gv === "number" || typeof gv === "string") {
                            gName = gmap[String(gv)] || lamovieGenreMap[String(gv)] || (typeof gv === "string" && isNaN(Number(gv)) ? gv : "");
                        } else if (gv && gv.name) {
                            gName = String(gv.name);
                        }
                        if (gName !== "") gnames.push(gName);
                    }
                    if (gnames.length > 0) genreStr = gnames.join(" / ");
                }
                var slugVal = String(p.slug || pid);
                var prefix = isFp ? "fp-" : "lm-";
                var originBase = isFp ? "https://fanpelis.to/" : "https://lamovie.org/";
                out.push({
                    id: pid,
                    slug: prefix + resolvedType + "-" + pid,
                    apiSlug: slugVal,
                    mediaType: resolvedType,
                    source: isFp ? "Fanpelis" : "LaMovie",
                    sourceProvider: isFp ? "fanpelis" : "lamovie",
                    altId: "",
                    altSlug: "",
                    altProvider: "",
                    title: title,
                    year: yr,
                    rating: rate,
                    genre: genreStr,
                    thumb: poster || back,
                    backdrop: back || poster,
                    overview: decodeEntities(p.overview || p.description || (title + " disponible en streaming HD.")),
                    trailerId: String(p.trailer || p.youtube_id || ""),
                    dmId: "",
                    pageUrl: originBase + (resolvedType === "series" ? "series/" : "peliculas/") + slugVal + "/"
                });
            }
        } catch (e) {}
        return { items: out, totalPages: totalPagesOut };
    }

    function mergeStreamItems(added) {
        if (!added || added.length === 0) return;
        var merged = allStreamItems.slice(0);
        var bySlug = {};
        var byTitleKey = {};
        var i;
        for (i = 0; i < merged.length; i++) {
            var cur = merged[i];
            if (!cur) continue;
            bySlug[cur.slug] = i;
            if (cur.mediaType !== "youtube") {
                var tk = cur.mediaType + "::" + normalizeMediaTitleKey(cur.title) + "::" + String(cur.year || "");
                byTitleKey[tk] = i;
                var tkNoYr = cur.mediaType + "::" + normalizeMediaTitleKey(cur.title);
                if (byTitleKey[tkNoYr] === undefined) byTitleKey[tkNoYr] = i;
            }
        }
        for (var j = 0; j < added.length; j++) {
            var item = added[j];
            if (!item || !item.slug) continue;
            if (bySlug[item.slug] !== undefined) {
                var sIdx = bySlug[item.slug];
                if ((!merged[sIdx].thumb || merged[sIdx].thumb === "") && item.thumb) merged[sIdx].thumb = item.thumb;
                if ((!merged[sIdx].backdrop || merged[sIdx].backdrop === "") && item.backdrop) merged[sIdx].backdrop = item.backdrop;
                continue;
            }
            var dedupIdx = undefined;
            if (item.mediaType !== "youtube") {
                var exactKey = item.mediaType + "::" + normalizeMediaTitleKey(item.title) + "::" + String(item.year || "");
                var fallbackKey = item.mediaType + "::" + normalizeMediaTitleKey(item.title);
                dedupIdx = byTitleKey[exactKey];
                if (dedupIdx === undefined && item.year === "") dedupIdx = byTitleKey[fallbackKey];
            }
            if (dedupIdx !== undefined) {
                var target = merged[dedupIdx];
                if (target.sourceProvider !== item.sourceProvider && target.altId === "") {
                    target.altId = item.id;
                    target.altSlug = item.apiSlug || item.slug;
                    target.altProvider = item.sourceProvider;
                    target.source = "LaMovie · Fanpelis";
                }
                if ((!target.thumb || target.thumb === "") && item.thumb) target.thumb = item.thumb;
                if ((!target.backdrop || target.backdrop === "") && item.backdrop) target.backdrop = item.backdrop;
                if ((!target.overview || target.overview.indexOf("disponible en streaming") >= 0) && item.overview) target.overview = item.overview;
                if (target.trailerId === "" && item.trailerId) target.trailerId = item.trailerId;
            } else {
                var newIdx = merged.length;
                bySlug[item.slug] = newIdx;
                if (item.mediaType !== "youtube") {
                    var nk = item.mediaType + "::" + normalizeMediaTitleKey(item.title) + "::" + String(item.year || "");
                    byTitleKey[nk] = newIdx;
                    var nk2 = item.mediaType + "::" + normalizeMediaTitleKey(item.title);
                    if (byTitleKey[nk2] === undefined) byTitleKey[nk2] = newIdx;
                }
                merged.push(item);
            }
        }
        allStreamItems = merged;
        if (typeof api !== "undefined" && api.memory && merged.length > 4) {
            try {
                api.memory.set("STREAM_CACHE_V3", JSON.stringify({ ts: Date.now(), items: merged.slice(0, 320) }));
            } catch (eC) {}
        }
        rebuildFilteredStream();
    }

    function getActiveGenreIds(provider) {
        if (activeTab !== "genre") return "";
        for (var i = 0; i < sidebarItems.length; i++) {
            var it = sidebarItems[i];
            if (it && it.kind === "genre" && it.genre === selectedGenre) {
                return provider === "fanpelis" ? (it.fpIds || "") : (it.lmIds || "");
            }
        }
        return "";
    }

    function fetchLaMovieFeed(endpoint, mediaType, onDone) {
        var xhr = new XMLHttpRequest();
        xhr.onreadystatechange = function() {
            if (xhr.readyState !== XMLHttpRequest.DONE) return;
            var addedCount = 0;
            if (xhr.status >= 200 && xhr.status < 400 && xhr.responseText) {
                var parsed = parseProviderList(xhr.responseText, mediaType, "lamovie");
                if (parsed.totalPages > 0) lamovieMaxPages = parsed.totalPages;
                addedCount = parsed.items.length;
                if (addedCount > 0) mergeStreamItems(parsed.items);
            }
            if (typeof onDone === "function") onDone(addedCount);
        };
        xhr.onerror = function() { if (typeof onDone === "function") onDone(0); };
        xhr.open("GET", "https://lamovie.org/wp-api/v1/" + endpoint);
        xhr.setRequestHeader("Accept", "application/json");
        xhr.send();
    }

    function fetchFanpelisFeed(endpoint, mediaType, onDone) {
        var xhrF = new XMLHttpRequest();
        xhrF.onreadystatechange = function() {
            if (xhrF.readyState !== XMLHttpRequest.DONE) return;
            var addedCount = 0;
            if (xhrF.status >= 200 && xhrF.status < 400 && xhrF.responseText) {
                var parsed = parseProviderList(xhrF.responseText, mediaType, "fanpelis");
                if (parsed.totalPages > 0) fanpelisMaxPages = parsed.totalPages;
                addedCount = parsed.items.length;
                if (addedCount > 0) mergeStreamItems(parsed.items);
            }
            if (typeof onDone === "function") onDone(addedCount);
        };
        xhrF.onerror = function() { if (typeof onDone === "function") onDone(0); };
        xhrF.open("GET", "https://fanpelis.to/api/rest/" + endpoint);
        xhrF.setRequestHeader("Accept", "application/json");
        xhrF.send();
    }

    function loadMoreStreamingFeeds() {
        if (feedBusy) return;
        if (activeTab === "youtube") {
            fetchYouTubeDailymotionFeed(searchQuery !== "" ? searchQuery : "nintendo switch 2 trailer gameplay");
            return;
        }
        var wantLmMovies = (activeTab === "movies" || activeTab === "forme" || activeTab === "genre") && hasMoreMovies;
        var wantLmSeries = (activeTab === "series" || activeTab === "forme" || activeTab === "genre") && hasMoreSeries;
        var wantFpMovies = (activeTab === "movies" || activeTab === "forme" || activeTab === "genre") && hasMoreFanMovies;
        var wantFpSeries = (activeTab === "series" || activeTab === "forme" || activeTab === "genre") && hasMoreFanSeries;
        if (!wantLmMovies && !wantLmSeries && !wantFpMovies && !wantFpSeries) return;

        feedBusy = true;
        var lmG = getActiveGenreIds("lamovie");
        var fpG = getActiveGenreIds("fanpelis");
        var lmGSuf = lmG !== "" ? ("&genres=" + encodeURIComponent(lmG)) : "";
        var fpGSuf = fpG !== "" ? ("&genres=" + encodeURIComponent(fpG)) : "";

        var pending = (wantLmMovies ? 1 : 0) + (wantLmSeries ? 1 : 0) + (wantFpMovies ? 1 : 0) + (wantFpSeries ? 1 : 0);
        var finishOne = function() {
            pending--;
            if (pending <= 0) { feedBusy = false; isLoading = false; }
        };
        if (wantLmMovies) {
            moviesApiPage += 1;
            fetchLaMovieFeed("listing/movies?page=" + moviesApiPage + "&postsPerPage=24&postType=movies&orderBy=latest&order=desc" + lmGSuf, "movie", function(cnt) {
                if (cnt === 0 || moviesApiPage >= lamovieMaxPages) hasMoreMovies = false;
                finishOne();
            });
        }
        if (wantLmSeries) {
            seriesApiPage += 1;
            fetchLaMovieFeed("listing/tvshows?page=" + seriesApiPage + "&postsPerPage=24&postType=tvshows&orderBy=latest&order=desc" + lmGSuf, "series", function(cnt) {
                if (cnt === 0 || seriesApiPage >= lamovieMaxPages) hasMoreSeries = false;
                finishOne();
            });
        }
        if (wantFpMovies) {
            fanMoviesApiPage += 1;
            fetchFanpelisFeed("listing?page=" + fanMoviesApiPage + "&postsPerPage=24&postType=movies" + fpGSuf, "movie", function(cnt) {
                if (cnt === 0 || fanMoviesApiPage >= fanpelisMaxPages) hasMoreFanMovies = false;
                finishOne();
            });
        }
        if (wantFpSeries) {
            fanSeriesApiPage += 1;
            fetchFanpelisFeed("listing?page=" + fanSeriesApiPage + "&postsPerPage=24&postType=series" + fpGSuf, "series", function(cnt) {
                if (cnt === 0 || fanSeriesApiPage >= fanpelisMaxPages) hasMoreFanSeries = false;
                finishOne();
            });
        }
    }

    function fetchYouTubeDailymotionFeed(queryStr) {
        var q = String(queryStr || "").trim();
        if (q === "") q = "Nintendo Switch 2 trailer gameplay";
        var xhrD = new XMLHttpRequest();
        xhrD.onreadystatechange = function() {
            if (xhrD.readyState !== XMLHttpRequest.DONE) return;
            isLoading = false;
            if (xhrD.status >= 200 && xhrD.status < 400 && xhrD.responseText) {
                try {
                    var parsed = JSON.parse(xhrD.responseText);
                    var list = (parsed && Array.isArray(parsed.list)) ? parsed.list : [];
                    var out = [];
                    for (var i = 0; i < list.length; i++) {
                        var v = list[i];
                        if (!v || !v.id || !v.title) continue;
                        var dmId = String(v.id);
                        var thumb = String(v.thumbnail_720_url || v.thumbnail_url || "");
                        out.push({
                            id: dmId,
                            slug: "dm-" + dmId,
                            apiSlug: dmId,
                            mediaType: "youtube",
                            source: "YouTube",
                            sourceProvider: "youtube",
                            altId: "",
                            altSlug: "",
                            altProvider: "",
                            title: decodeEntities(v.title),
                            year: "Video",
                            rating: "HD",
                            genre: "Videos / Gaming",
                            thumb: thumb,
                            backdrop: thumb,
                            overview: decodeEntities(v.title) + " — Instant HD stream ready for Nintendo Switch player.",
                            trailerId: "",
                            dmId: dmId,
                            pageUrl: "https://www.dailymotion.com/video/" + dmId
                        });
                    }
                    if (out.length > 0) mergeStreamItems(out);
                } catch (eD) {}
            }
        };
        xhrD.open("GET", "https://api.dailymotion.com/videos?search=" + encodeURIComponent(q) + "&fields=id,title,thumbnail_720_url,thumbnail_url,duration&limit=24&sort=relevance");
        xhrD.setRequestHeader("Accept", "application/json");
        xhrD.send();
    }

    function fetchMultiSourceSearch(q) {
        if (!q || q === "") return;
        isLoading = true;
        if (activeTab === "youtube") {
            fetchYouTubeDailymotionFeed(q);
            return;
        }
        var pending = 2;
        var markDone = function() {
            pending--;
            if (pending <= 0) isLoading = false;
        };
        var xhrS = new XMLHttpRequest();
        xhrS.onreadystatechange = function() {
            if (xhrS.readyState !== XMLHttpRequest.DONE) return;
            if (xhrS.status >= 200 && xhrS.status < 400 && xhrS.responseText) {
                var parsed = parseProviderList(xhrS.responseText, "movie", "lamovie");
                if (parsed.items.length > 0) mergeStreamItems(parsed.items);
            }
            markDone();
        };
        xhrS.onerror = function() { markDone(); };
        xhrS.open("GET", "https://lamovie.org/wp-api/v1/search?q=" + encodeURIComponent(q) + "&postType=any&postsPerPage=30");
        xhrS.send();

        var xhrFp = new XMLHttpRequest();
        xhrFp.onreadystatechange = function() {
            if (xhrFp.readyState !== XMLHttpRequest.DONE) return;
            if (xhrFp.status >= 200 && xhrFp.status < 400 && xhrFp.responseText) {
                var parsedFp = parseProviderList(xhrFp.responseText, "movie", "fanpelis");
                if (parsedFp.items.length > 0) mergeStreamItems(parsedFp.items);
            }
            markDone();
        };
        xhrFp.onerror = function() { markDone(); };
        xhrFp.open("GET", "https://fanpelis.to/api/rest/search?q=" + encodeURIComponent(q) + "&postsPerPage=30");
        xhrFp.send();
    }

    function matchesLetter(title, letter) {
        if (!letter || letter === "All") return true;
        var clean = String(title || "").trim();
        if (clean === "") return letter === "#";
        var first = clean.charAt(0).toUpperCase();
        if (letter === "#") return !/^[A-Z]$/.test(first);
        return first === String(letter).toUpperCase();
    }

    function stepAlphabetLetter(dir) {
        var idx = alphabetLetters.indexOf(activeLetter);
        if (idx < 0) idx = 0;
        var nextIdx = (idx + dir + alphabetLetters.length) % alphabetLetters.length;
        activeLetter = alphabetLetters[nextIdx];
        currentPage = 0;
        navSound.play();
        rebuildFilteredStream();
        if (filteredStreamModel.count < 8 && hasAnyMoreFeeds()) loadMoreStreamingFeeds();
    }

    function selectAlphabetLetter(letter) {
        activeLetter = letter;
        currentPage = 0;
        navSound.play();
        rebuildFilteredStream();
        if (filteredStreamModel.count < 8 && hasAnyMoreFeeds()) loadMoreStreamingFeeds();
    }

    function hasAnyMoreFeeds() {
        if (activeTab === "favorites" || activeTab === "continue") return false;
        if (activeTab === "youtube") return true;
        return hasMoreMovies || hasMoreSeries || hasMoreFanMovies || hasMoreFanSeries;
    }

    function totalPages() {
        return Math.max(1, Math.ceil(filteredStreamModel.count / itemsPerPage));
    }

    function rebuildPageSlice() {
        pageStreamModel.clear();
        var tp = totalPages();
        if (currentPage >= tp) currentPage = tp - 1;
        if (currentPage < 0) currentPage = 0;
        var start = currentPage * itemsPerPage;
        var end = Math.min(filteredStreamModel.count, start + itemsPerPage);
        for (var i = start; i < end; i++) {
            pageStreamModel.append(filteredStreamModel.get(i));
        }
        if (gridIndex >= pageStreamModel.count) gridIndex = Math.max(0, pageStreamModel.count - 1);
    }

    function nextPage() {
        var tp = totalPages();
        if (currentPage + 1 < tp) {
            navSound.play();
            triggerGridSoftSlide(1);
            currentPage += 1;
            gridIndex = 0;
            rebuildPageSlice();
            if (currentPage + 2 >= tp && hasAnyMoreFeeds()) {
                loadMoreStreamingFeeds();
            }
        } else if (hasAnyMoreFeeds()) {
            navSound.play();
            loadMoreStreamingFeeds();
        }
    }

    function prevPage() {
        if (currentPage > 0) {
            navSound.play();
            triggerGridSoftSlide(-1);
            currentPage -= 1;
            gridIndex = 0;
            rebuildPageSlice();
        }
    }

    function rebuildFilteredStream() {
        filteredStreamModel.clear();
        var src = [];
        var i;
        if (activeTab === "favorites") {
            for (i = 0; i < savedFavorites.length; i++) {
                var fav = savedFavorites[i];
                if (!fav) continue;
                if (!matchesLetter(fav.title || fav.label || "", activeLetter)) continue;
                src.push({
                    id: fav.id || fav.slug || String(i),
                    slug: fav.slug || fav.url || String(i),
                    apiSlug: fav.apiSlug || fav.slug || "",
                    mediaType: fav.mediaType || "movie",
                    source: fav.source || "Favorite",
                    sourceProvider: fav.sourceProvider || "lamovie",
                    altId: fav.altId || "",
                    altSlug: fav.altSlug || "",
                    altProvider: fav.altProvider || "",
                    title: fav.title || fav.label || "Favorite",
                    year: fav.year || "",
                    rating: fav.rating || "",
                    genre: fav.genre || "Favorite",
                    thumb: fav.thumb || fav.backdrop || "",
                    backdrop: fav.backdrop || fav.thumb || "",
                    overview: fav.overview || "",
                    trailerId: fav.trailerId || "",
                    dmId: fav.dmId || "",
                    pageUrl: fav.pageUrl || fav.url || "https://lamovie.org"
                });
            }
        } else if (activeTab === "continue") {
            for (i = 0; i < continueWatching.length; i++) {
                var cw = continueWatching[i];
                if (!cw) continue;
                if (!matchesLetter(cw.title || "", activeLetter)) continue;
                src.push(cw);
            }
        } else {
            var base = allStreamItems.length > 0 ? allStreamItems : fallbackCatalog;
            var qLower = String(searchQuery || "").trim().toLowerCase();
            var genreTerms = String(selectedGenre || "").trim().toLowerCase().split("|");
            for (i = 0; i < base.length; i++) {
                var it = base[i];
                // Strictly keep YouTube separate from Movies/Series/ForMe/Genres
                if (activeTab === "youtube") {
                    if (it.mediaType !== "youtube") continue;
                } else {
                    if (it.mediaType === "youtube") continue;
                }
                if (activeTab === "movies" && it.mediaType !== "movie") continue;
                if (activeTab === "series" && it.mediaType !== "series") continue;
                if (!matchesLetter(it.title, activeLetter)) continue;
                if (activeTab === "genre" && genreTerms.length > 0 && genreTerms[0] !== "") {
                    var blob = (String(it.genre || "") + " " + String(it.title || "") + " " + String(it.overview || "")).toLowerCase();
                    var gMatched = false;
                    for (var gt = 0; gt < genreTerms.length; gt++) {
                        if (genreTerms[gt] !== "" && blob.indexOf(genreTerms[gt]) >= 0) { gMatched = true; break; }
                    }
                    if (!gMatched) continue;
                }
                if (qLower !== "") {
                    var qBlob = (String(it.title || "") + " " + String(it.genre || "") + " " + String(it.overview || "") + " " + String(it.source || "")).toLowerCase();
                    if (qBlob.indexOf(qLower) < 0) continue;
                }
                src.push(it);
            }
        }
        if (activeLetter !== "All") {
            src.sort(function(a, b) {
                var ta = String(a.title || "").toLowerCase();
                var tb = String(b.title || "").toLowerCase();
                return ta < tb ? -1 : (ta > tb ? 1 : 0);
            });
        }
        for (i = 0; i < src.length; i++) {
            filteredStreamModel.append(src[i]);
        }
        rebuildPageSlice();
    }

    function destroyPreviewPlayer() {
        detailPreviewDirectUrl = "";
        try { previewVideoPlayer.stop(); } catch (e0) {}
        if (inlineWebView) {
            try { inlineWebView.destroy(); } catch (e) {}
            inlineWebView = null;
        }
    }

    function destroyFullscreenPlayer() {
        activeFullscreenStream = "";
        try { fullscreenVideoPlayer.stop(); } catch (e0) {}
        if (fullWebView) {
            try { fullWebView.destroy(); } catch (e2) {}
            fullWebView = null;
        }
    }

    function mountNativeVideo(streamUrl) {
        if (!streamUrl) return false;
        destroyFullscreenPlayer();
        activeFullscreenStream = String(streamUrl).trim();
        fullscreenStatusText = "";
        wakePlayerOsd();
        try { fullscreenVideoPlayer.play(); } catch (e) {}
        return true;
    }

    function mountWebInto(hostItem, targetUrl, disableInput, assignProp, optionalHtml, optionalBaseUrl) {
        if ((!targetUrl && !optionalHtml) || !hostItem) return;
        var extra = disableInput ? "; enabled: false" : "";
        var candidates = [
            "import QtQuick 2.12; import QtWebView 1.1; WebView { x: 0; y: 0; width: parent.width; height: parent.height" + extra + " }",
            "import QtQuick 2.12; import QtWebView 1.0; WebView { x: 0; y: 0; width: parent.width; height: parent.height" + extra + " }",
            "import QtQuick 2.12; import QtWebView 1.15; WebView { x: 0; y: 0; width: parent.width; height: parent.height" + extra + " }",
            "import QtQuick 2.12; import QtWebEngine 1.8; WebEngineView { x: 0; y: 0; width: parent.width; height: parent.height" + extra + " }"
        ];
        for (var i = 0; i < candidates.length; i++) {
            try {
                var o = Qt.createQmlObject(candidates[i], hostItem, "netflixWeb_" + assignProp + "_" + i);
                if (o) {
                    if (optionalHtml && typeof o.loadHtml === "function") {
                        o.loadHtml(optionalHtml, optionalBaseUrl || targetUrl || "https://lamovie.org/");
                    } else {
                        o.url = String(targetUrl);
                    }
                    if (assignProp === "inline") inlineWebView = o;
                    else if (assignProp === "full") fullWebView = o;
                    else if (assignProp === "external") nativeWebView = o;
                    fullscreenStatusText = "";
                    return;
                }
            } catch (e) {}
        }
    }

    function startPreviewPlayback(streamOrEmbedUrl) {
        destroyPreviewPlayer();
        if (!streamOrEmbedUrl || previewPaused || fullscreenVideo) return;
        var clean = String(streamOrEmbedUrl).trim();
        if (/\.(m3u8|mp4|webm)(\?|$)/i.test(clean)) {
            detailPreviewDirectUrl = clean;
            try { previewVideoPlayer.play(); } catch (e) {}
        } else {
            mountWebInto(previewVideoHost, clean, true, "inline", "", "");
        }
    }

    function togglePreviewPlayback() {
        previewPaused = !previewPaused;
        if (previewPaused) {
            turnOffSfx.play();
            destroyPreviewPlayer();
        } else {
            turnOnSfx.play();
            if (detailPreviewUrl !== "") startPreviewPlayback(detailPreviewUrl);
        }
    }

    function resolveDailymotionHlsForId(dmId, expectedTitle, forFullscreen) {
        if (!dmId) return;
        var xhrM = new XMLHttpRequest();
        xhrM.onreadystatechange = function() {
            if (xhrM.readyState !== XMLHttpRequest.DONE) return;
            if (!detailOpen || detailItem.title !== expectedTitle) return;
            if (xhrM.status >= 200 && xhrM.status < 400 && xhrM.responseText) {
                try {
                    var mj = JSON.parse(xhrM.responseText);
                    var q = mj && mj.qualities ? mj.qualities : null;
                    var hls = "";
                    if (q && Array.isArray(q.auto) && q.auto.length > 0 && q.auto[0].url) {
                        hls = String(q.auto[0].url);
                    } else if (q && Array.isArray(q["380"]) && q["380"].length > 0 && q["380"][0].url) {
                        hls = String(q["380"][0].url);
                    }
                    if (hls !== "") {
                        detailPreviewUrl = hls;
                        if (detailPlayUrl === "" || forFullscreen) detailPlayUrl = hls;
                        if (fullscreenVideo && (forFullscreen || fullscreenPending)) {
                            fullscreenPending = false;
                            mountNativeVideo(hls);
                        } else if (!previewPaused && !fullscreenVideo) {
                            startPreviewPlayback(hls);
                        }
                        return;
                    }
                } catch (e) {}
            }
            if (forFullscreen && fullscreenVideo) {
                mountWebInto(fullscreenHost, "https://www.dailymotion.com/embed/video/" + dmId + "?autoplay=1", false, "full", "", "");
            }
        };
        xhrM.open("GET", "https://www.dailymotion.com/player/metadata/video/" + encodeURIComponent(dmId));
        xhrM.send();
    }

    function resolvePreviewTrailerForTitle(itemTitle, dmIdHint, isYouTubeItem) {
        if (dmIdHint && dmIdHint !== "") {
            resolveDailymotionHlsForId(dmIdHint, itemTitle, isYouTubeItem);
            return;
        }
        var expected = itemTitle;
        var clean = String(itemTitle || "").replace(/\([^)]*\)/g, " ").replace(/\[[^\]]*\]/g, " ").trim();
        var xhrT = new XMLHttpRequest();
        xhrT.onreadystatechange = function() {
            if (xhrT.readyState !== XMLHttpRequest.DONE) return;
            if (!detailOpen || detailItem.title !== expected) return;
            if (xhrT.status >= 200 && xhrT.status < 400 && xhrT.responseText) {
                try {
                    var pj = JSON.parse(xhrT.responseText);
                    var list = (pj && Array.isArray(pj.list)) ? pj.list : [];
                    if (list.length > 0 && list[0] && list[0].id) {
                        resolveDailymotionHlsForId(String(list[0].id), expected, isYouTubeItem);
                    }
                } catch (e) {}
            }
        };
        xhrT.open("GET", "https://api.dailymotion.com/videos?search=" + encodeURIComponent(clean + " official trailer") + "&fields=id,title&limit=4&sort=relevance");
        xhrT.send();
    }

    function appendPlayerEmbedsFromJson(jsonText, providerLabel) {
        var preferred = "";
        try {
            var res = JSON.parse(jsonText);
            var embeds = (res && res.data && Array.isArray(res.data.embeds)) ? res.data.embeds
                       : (res && Array.isArray(res.embeds) ? res.embeds
                       : (res && res.data && Array.isArray(res.data.sources) ? res.data.sources : []));
            for (var i = 0; i < embeds.length; i++) {
                var emb = embeds[i];
                var srcUrl = String(emb.url || emb.src || "").trim();
                if (srcUrl.indexOf("//") === 0) srcUrl = "https:" + srcUrl;
                if (srcUrl !== "") {
                    var dup = false;
                    for (var k = 0; k < playerSourcesModel.count; k++) {
                        if (playerSourcesModel.get(k).url === srcUrl) { dup = true; break; }
                    }
                    if (dup) continue;
                    var srvName = String(emb.server || emb.lang || emb.language || ("Server " + (playerSourcesModel.count + 1)));
                    var lbl = providerLabel !== "" ? (srvName + " (" + providerLabel + ")") : srvName;
                    playerSourcesModel.append({ label: lbl, url: srcUrl });
                    if (preferred === "" || (srcUrl.indexOf("vimeos.net") >= 0 && preferred.indexOf("vimeos.net") < 0)) {
                        preferred = srcUrl;
                    }
                }
            }
        } catch (e) {}
        return preferred;
    }

    function loadPlayerSourcesByPostId(targetId, expectedTitle, andAutoLaunch, providerOverride) {
        var prov = providerOverride || (detailItem && detailItem.sourceProvider ? detailItem.sourceProvider : "lamovie");
        var isFp = (prov === "fanpelis");
        var baseUrl = isFp
            ? ("https://fanpelis.to/api/rest/player?post_id=" + encodeURIComponent(targetId) + "&_any=1")
            : ("https://lamovie.org/wp-api/v1/player?postId=" + encodeURIComponent(targetId) + "&demo=0");

        playerSourcesModel.clear();
        selectedPlayerIdx = 0;

        var pending = 1;
        var hasAlt = (detailItem && detailItem.altId && detailItem.altId !== "" && detailItem.altProvider && detailItem.altProvider !== "" && detailItem.mediaType === "movie");
        if (hasAlt) pending = 2;

        var finishLoad = function() {
            pending--;
            if (pending > 0) return;
            streamsLoading = false;
            if (detailPlayUrl === "" && playerSourcesModel.count > 0) {
                detailPlayUrl = playerSourcesModel.get(0).url;
            } else if (detailPlayUrl === "" && detailItem && detailItem.pageUrl) {
                detailPlayUrl = detailItem.pageUrl;
            }
            if ((andAutoLaunch || fullscreenPending) && fullscreenVideo) {
                fullscreenPending = false;
                mountFullscreenTarget(detailPlayUrl !== "" ? detailPlayUrl : detailItem.pageUrl);
            }
        };

        var xhrP = new XMLHttpRequest();
        xhrP.onreadystatechange = function() {
            if (xhrP.readyState !== XMLHttpRequest.DONE) return;
            if (!detailOpen || detailItem.title !== expectedTitle) return;
            if (xhrP.status >= 200 && xhrP.status < 400 && xhrP.responseText) {
                var pref = appendPlayerEmbedsFromJson(xhrP.responseText, isFp ? "Fanpelis" : "LaMovie");
                if (pref !== "") detailPlayUrl = pref;
            }
            finishLoad();
        };
        xhrP.onerror = function() { finishLoad(); };
        xhrP.open("GET", baseUrl);
        xhrP.setRequestHeader("Accept", "application/json");
        xhrP.send();

        if (hasAlt) {
            var altIsFp = (detailItem.altProvider === "fanpelis");
            var altUrl = altIsFp
                ? ("https://fanpelis.to/api/rest/player?post_id=" + encodeURIComponent(detailItem.altId) + "&_any=1")
                : ("https://lamovie.org/wp-api/v1/player?postId=" + encodeURIComponent(detailItem.altId) + "&demo=0");
            var xhrA = new XMLHttpRequest();
            xhrA.onreadystatechange = function() {
                if (xhrA.readyState !== XMLHttpRequest.DONE) return;
                if (!detailOpen || detailItem.title !== expectedTitle) return;
                if (xhrA.status >= 200 && xhrA.status < 400 && xhrA.responseText) {
                    var prefA = appendPlayerEmbedsFromJson(xhrA.responseText, altIsFp ? "Fanpelis" : "LaMovie");
                    if (detailPlayUrl === "" && prefA !== "") detailPlayUrl = prefA;
                }
                finishLoad();
            };
            xhrA.onerror = function() { finishLoad(); };
            xhrA.open("GET", altUrl);
            xhrA.setRequestHeader("Accept", "application/json");
            xhrA.send();
        }
    }

    function loadSeasonEpisodes(postId, seasonNum, expectedTitle) {
        if (!postId) return;
        activeSeason = Math.max(1, parseInt(seasonNum, 10) || 1);
        streamsLoading = true;
        episodesModel.clear();
        selectedEpisodeIdx = 0;

        var isFp = (detailItem && detailItem.sourceProvider === "fanpelis");
        var epUrl = isFp
            ? ("https://fanpelis.to/api/rest/episodes?post_id=" + encodeURIComponent(postId))
            : ("https://lamovie.org/wp-api/v1/single/episodes/list?_id=" + encodeURIComponent(postId) + "&season=" + activeSeason + "&page=1&postsPerPage=80");

        var xhrEp = new XMLHttpRequest();
        xhrEp.onreadystatechange = function() {
            if (xhrEp.readyState !== XMLHttpRequest.DONE) return;
            if (!detailOpen || detailItem.title !== expectedTitle) return;
            var firstEpId = "";
            if (xhrEp.status >= 200 && xhrEp.status < 400 && xhrEp.responseText) {
                try {
                    var epJson = JSON.parse(xhrEp.responseText);
                    if (isFp) {
                        var rawPosts = (epJson && epJson.data && Array.isArray(epJson.data.posts)) ? epJson.data.posts
                                     : (epJson && epJson.data && Array.isArray(epJson.data.episodes) ? epJson.data.episodes
                                     : (Array.isArray(epJson && epJson.data) ? epJson.data : []));
                        var seasonMap = {};
                        var sList = [];
                        for (var k = 0; k < rawPosts.length; k++) {
                            var rp = rawPosts[k];
                            if (!rp) continue;
                            var sn = parseInt(rp.season || rp.season_number || 1, 10) || 1;
                            if (!seasonMap[sn]) { seasonMap[sn] = true; sList.push(sn); }
                            if (sn === activeSeason) {
                                var rpid = String(rp._id || rp.id || "");
                                if (rpid !== "") {
                                    episodesModel.append({ eid: rpid, title: decodeEntities(rp.title || rp.name || ("Episode " + (episodesModel.count + 1))) });
                                    if (firstEpId === "") firstEpId = rpid;
                                }
                            }
                        }
                        if (sList.length > 0) {
                            sList.sort(function(a, b) { return a - b; });
                            seasonsModel.clear();
                            for (var si2 = 0; si2 < sList.length; si2++) seasonsModel.append({ seasonNum: sList[si2] });
                        }
                    } else {
                        if (epJson && epJson.data && Array.isArray(epJson.data.seasons) && epJson.data.seasons.length > 0) {
                            var sArr = epJson.data.seasons;
                            seasonsModel.clear();
                            for (var si = 0; si < sArr.length; si++) {
                                var sNum = parseInt(sArr[si], 10);
                                if (!isNaN(sNum) && sNum >= 1)
                                    seasonsModel.append({ seasonNum: sNum });
                            }
                        }
                        var epPosts = (epJson && epJson.data && Array.isArray(epJson.data.posts)) ? epJson.data.posts : [];
                        for (var i = 0; i < epPosts.length; i++) {
                            var ep = epPosts[i];
                            if (!ep || (!ep._id && !ep.id)) continue;
                            var epIdStr = String(ep._id || ep.id);
                            episodesModel.append({ eid: epIdStr, title: decodeEntities(ep.title || ("Episode " + (i + 1))) });
                            if (firstEpId === "") firstEpId = epIdStr;
                        }
                    }
                } catch (e) {}
            }
            if (seasonsModel.count === 0) seasonsModel.append({ seasonNum: 1 });
            selectedEpisodeIdx = 0;
            loadPlayerSourcesByPostId(firstEpId !== "" ? firstEpId : postId, expectedTitle, false, isFp ? "fanpelis" : "lamovie");
        };
        xhrEp.onerror = function() {
            if (seasonsModel.count === 0) seasonsModel.append({ seasonNum: 1 });
            streamsLoading = false;
        };
        xhrEp.open("GET", epUrl);
        xhrEp.setRequestHeader("Accept", "application/json");
        xhrEp.send();
    }

    function fetchProviderPlayers(postId, mediaType, expectedTitle, providerName) {
        playerSourcesModel.clear();
        seasonsModel.clear();
        episodesModel.clear();
        activeSeason = 1;
        if (!postId) { streamsLoading = false; return; }
        streamsLoading = true;
        if (mediaType === "series") {
            loadSeasonEpisodes(postId, 1, expectedTitle);
        } else {
            loadPlayerSourcesByPostId(postId, expectedTitle, false, providerName);
        }
    }

    function openItemDetail(idx) {
        if (idx < 0 || idx >= pageStreamModel.count) return;
        var item = pageStreamModel.get(idx);
        detailItem = {
            id: item.id, slug: item.slug, apiSlug: item.apiSlug || "", mediaType: item.mediaType,
            source: item.source, sourceProvider: item.sourceProvider || "lamovie",
            altId: item.altId || "", altSlug: item.altSlug || "", altProvider: item.altProvider || "",
            title: item.title, year: item.year, rating: item.rating, genre: item.genre,
            thumb: item.thumb, backdrop: item.backdrop, overview: item.overview,
            trailerId: item.trailerId, dmId: item.dmId || "", pageUrl: item.pageUrl
        };
        detailSynopsis = item.overview || "";
        detailBackdrop = item.backdrop || item.thumb || "";
        detailPreviewUrl = "";
        detailPreviewDirectUrl = "";
        detailPlayUrl = "";
        previewPaused = false;
        streamsLoading = (item.mediaType !== "youtube");
        fullscreenPending = false;
        detailBtnIdx = 1;
        activeSeason = 1;
        selectedEpisodeIdx = 0;
        selectedPlayerIdx = 0;
        seasonsModel.clear();
        episodesModel.clear();
        playerSourcesModel.clear();
        detailOpen = true;
        fullscreenVideo = false;
        focusZone = "detail";
        selectSfx.play();
        resolvePreviewTrailerForTitle(item.title, item.dmId || "", item.mediaType === "youtube");
        if (item.mediaType !== "youtube") {
            fetchProviderPlayers(item.id, item.mediaType, item.title, item.sourceProvider || "lamovie");
        } else {
            streamsLoading = false;
        }
    }

    // ES5 Dean Edwards p,a,c,k,e,d unpacker to extract .m3u8 / .mp4 streams natively on Android Pegasus
    function unpackPacker(packedCode) {
        var match = packedCode.match(/eval\(\s*function\(\s*p\s*,\s*a\s*,\s*c\s*,\s*k\s*,\s*e\s*,\s*[dr]\s*\)\s*\{[\s\S]*?\}\(\s*(['"])([\s\S]*?)\1\s*,\s*(\d+)\s*,\s*(\d+)\s*,\s*(['"])([\s\S]*?)\5\.split\(\s*(['"])\|\7\s*\)/i);
        if (!match) return "";
        var p = match[2].replace(/\\'/g, "'").replace(/\\"/g, "\"").replace(/\\\\/g, "\\");
        var a = parseInt(match[3], 10) || 36;
        var c = parseInt(match[4], 10) || 0;
        var k = match[6].split("|");
        var encodeBase = function(num) {
            var prefix = num < a ? "" : encodeBase(Math.floor(num / a));
            var rem = num % a;
            var ch = rem > 35 ? String.fromCharCode(rem + 29) : rem.toString(36);
            return prefix + ch;
        };
        var dict = {};
        while (c--) {
            var key = encodeBase(c);
            dict[key] = k[c] || key;
        }
        return p.replace(/\b\w+\b/g, function(word) {
            return dict[word] !== undefined ? dict[word] : word;
        });
    }

    function extractDirectStream(html) {
        var cands = [String(html || "")];
        var packedRe = /eval\(\s*function\(\s*p\s*,\s*a\s*,\s*c\s*,\s*k\s*,\s*e\s*,\s*[dr]\s*\)[\s\S]*?\.split\([^)]+\)[^)]*\)\s*\)/gi;
        var pm;
        while ((pm = packedRe.exec(cands[0])) !== null) {
            var unp = unpackPacker(pm[0]);
            if (unp !== "") cands.push(unp);
        }
        var i;
        for (i = 0; i < cands.length; i++) {
            var t = cands[i];
            var hm = t.match(/(?:file|src|url|hls)\s*[:=]\s*["'](https?:\/\/[^"'\s]+\.m3u8(?:\?[^"'\s]*)?)["']/i)
                  || t.match(/["'](https?:\/\/[^"'\s<>]+\/master\.m3u8(?:\?[^"'\s<>]*)?)["']/i)
                  || t.match(/["'](https?:\/\/[^"'\s<>]+\.m3u8(?:\?[^"'\s<>]*)?)["']/i);
            if (hm && hm[1]) return { url: hm[1].replace(/\\\//g, "/"), kind: "hls" };
        }
        for (i = 0; i < cands.length; i++) {
            var t2 = cands[i];
            var mm = t2.match(/(?:file|src|url)\s*[:=]\s*["'](https?:\/\/[^"'\s]+\.mp4(?:\?[^"'\s]*)?)["']/i)
                  || t2.match(/["'](https?:\/\/[^"'\s<>]+\.mp4(?:\?[^"'\s<>]*)?)["']/i);
            if (mm && mm[1]) return { url: mm[1].replace(/\\\//g, "/"), kind: "mp4" };
        }
        return null;
    }

    function cleanSandboxHtml(html, baseUrl) {
        var cleaned = String(html || "")
            .replace(/<script\b[^>]*>[\s\S]*?(?:voeSandboxBlocked|SANDBOX DETECTADO)[\s\S]*?<\/script>/gi, "")
            .replace(/<script\b[^>]*disable-devtool[^>]*>[\s\S]*?<\/script>/gi, "")
            .replace(/<script\b[^>]*src=["'][^"']*\/js\/pop\.js[^"']*["'][^>]*>[\s\S]*?<\/script>/gi, "")
            .replace(/<meta[^>]+http-equiv=["']?Content-Security-Policy["']?[^>]*>/gi, "");
        var headInject = '<base href="' + String(baseUrl || "https://vimeos.net/") + '"><style>html,body{margin:0!important;padding:0!important;width:100%!important;height:100%!important;background:#000!important;overflow:hidden!important;}#vplayer,video{width:100%!important;height:100%!important;}</style>';
        if (/<head[^>]*>/i.test(cleaned)) cleaned = cleaned.replace(/<head([^>]*)>/i, "<head$1>" + headInject);
        else cleaned = "<!doctype html><html><head>" + headInject + "</head><body>" + cleaned + "</body></html>";
        return cleaned;
    }

    function fetchAndMountStreamHtml(targetUrl, refererUrl) {
        fullscreenStatusText = tr("Connecting to stream server...");
        var xhrE = new XMLHttpRequest();
        xhrE.onreadystatechange = function() {
            if (xhrE.readyState !== XMLHttpRequest.DONE) return;
            if (!fullscreenVideo) return;
            if (xhrE.status >= 200 && xhrE.status < 400 && xhrE.responseText) {
                var html = xhrE.responseText;
                var fm = html.match(/<iframe[^>]+id=["']frame["'][^>]+src=["']([^"']+)["']/i)
                      || html.match(/<iframe[^>]+src=["']((?:https?:)?\/\/vimeos\.net\/embed-[^"']+)["']/i)
                      || html.match(/<iframe[^>]+src=["']((?:https?:)?\/\/[^"']+)["']/i)
                      || html.match(/window\.location(?:\.href)?\s*=\s*["']((?:https?:)?\/\/[^"']+)["']/i);
                if (fm && fm[1] && targetUrl.indexOf("videoapp.zip") >= 0) {
                    var unwrapped = fm[1].trim();
                    if (unwrapped.indexOf("//") === 0) unwrapped = "https:" + unwrapped;
                    if (unwrapped.indexOf("vimeos.net/embed-") >= 0) unwrapped = unwrapped.split("?")[0];
                    if (unwrapped !== targetUrl) {
                        fetchAndMountStreamHtml(unwrapped, targetUrl);
                        return;
                    }
                }
                var direct = extractDirectStream(html);
                if (direct && direct.url && mountNativeVideo(direct.url)) {
                    return;
                }
                var baseOrigin = "https://vimeos.net/";
                var om = targetUrl.match(/^(https?:\/\/[^\/]+)/i);
                if (om && om[1]) baseOrigin = om[1] + "/";
                mountWebInto(fullscreenHost, targetUrl, false, "full", cleanSandboxHtml(html, baseOrigin), baseOrigin);
                return;
            }
            mountWebInto(fullscreenHost, targetUrl, false, "full", "", "");
        };
        xhrE.open("GET", targetUrl);
        if (refererUrl) {
            try { xhrE.setRequestHeader("Referer", refererUrl); } catch (eR) {}
        }
        xhrE.setRequestHeader("Accept", "text/html,application/xhtml+xml,*/*");
        xhrE.send();
    }

    function mountFullscreenTarget(playTarget) {
        if (!playTarget || playTarget === "") return;
        destroyFullscreenPlayer();
        var clean = String(playTarget).trim();
        if (/\.(mp4|m3u8|webm)(\?|$)/i.test(clean)) {
            if (mountNativeVideo(clean)) return;
        }
        if (clean.indexOf("dailymotion.com/video/") >= 0) {
            var dmM = clean.match(/dailymotion\.com\/video\/([A-Za-z0-9]+)/i);
            if (dmM && dmM[1]) {
                resolveDailymotionHlsForId(dmM[1], detailItem ? detailItem.title : "", true);
                return;
            }
        }
        if (clean.indexOf("videoapp.zip") >= 0 || clean.indexOf("vimeos.net") >= 0 || clean.indexOf("bysedikamoum.com") >= 0 || clean.indexOf("voe.sx") >= 0 || clean.indexOf("filemoon") >= 0) {
            var ref = (detailItem && detailItem.sourceProvider === "fanpelis") ? "https://fanpelis.to/" : "https://lamovie.org/";
            fetchAndMountStreamHtml(clean, ref);
            return;
        }
        fullscreenStatusText = "";
        mountWebInto(fullscreenHost, clean, false, "full", "", "");
    }

    function openFullscreenPlayback() {
        previewPaused = true;
        destroyPreviewPlayer();
        destroyFullscreenPlayer();
        fullscreenVideo = true;
        aspectMode = 0;
        wakePlayerOsd();
        fullscreenStatusText = tr("Loading stream...");
        focusZone = "fullscreenVideo";
        selectSfx.play();
        if (detailItem && detailItem.title) recordContinueWatching(detailItem);

        if (detailPlayUrl !== "") {
            fullscreenPending = false;
            mountFullscreenTarget(detailPlayUrl);
        } else if (streamsLoading && detailItem && detailItem.mediaType !== "youtube") {
            fullscreenPending = true;
        } else {
            var fallbackTarget = (detailItem && detailItem.mediaType === "youtube" && detailPreviewUrl !== "")
                ? detailPreviewUrl
                : (detailItem && detailItem.pageUrl ? detailItem.pageUrl : detailPreviewUrl);
            fullscreenPending = false;
            if (fallbackTarget !== "") mountFullscreenTarget(fallbackTarget);
            else if (detailItem && detailItem.dmId) resolveDailymotionHlsForId(detailItem.dmId, detailItem.title, true);
        }
    }

    function closeFullscreenPlayback() {
        fullscreenVideo = false;
        fullscreenPending = false;
        fullscreenStatusText = "";
        osdHideTimer.stop();
        focusZone = "detail";
        destroyFullscreenPlayer();
        backSfx.play();
        if (detailPreviewUrl !== "" && !previewPaused) startPreviewPlayback(detailPreviewUrl);
    }

    function openSearchKeyboard() {
        browserRoot.editingUrl = true;
        openSwitchKeyboard(activeTab === "youtube" ? tr("Search YouTube / Videos") : tr("Search Movies & Series (LaMovie + Fanpelis)"), browserRoot.searchQuery, false, 120, function(val) {
            browserRoot.editingUrl = false;
            var q = String(val || "").trim();
            browserRoot.searchQuery = q;
            browserRoot.currentPage = 0;
            if (q !== "") {
                fetchMultiSourceSearch(q);
            }
            rebuildFilteredStream();
            browserRoot.forceActiveFocus();
        }, function() {
            browserRoot.editingUrl = false;
            browserRoot.forceActiveFocus();
        });
    }

    function activateSidebar(idx) {
        if (idx < 0 || idx >= sidebarItems.length) return;
        var entry = sidebarItems[idx];
        if (entry.kind === "header") return;
        sidebarFocusIdx = idx;
        detailOpen = false;
        fullscreenVideo = false;
        destroyPreviewPlayer();
        destroyFullscreenPlayer();
        selectSfx.play();
        if (entry.kind === "genre") {
            activeTab = "genre";
            selectedGenre = entry.genre;
        } else {
            activeTab = entry.id;
            selectedGenre = "";
        }
        currentPage = 0;
        gridIndex = 0;
        rebuildFilteredStream();
        if (entry.id === "youtube") {
            if (filteredStreamModel.count < 4) fetchYouTubeDailymotionFeed("Nintendo Switch 2 gameplay trailer");
        } else if (entry.kind === "genre") {
            // Pull live pages directly for chosen genre from both LaMovie & Fanpelis
            hasMoreMovies = true; hasMoreSeries = true; hasMoreFanMovies = true; hasMoreFanSeries = true;
            var lmG = entry.lmIds || "";
            var fpG = entry.fpIds || "";
            if (lmG !== "") {
                fetchLaMovieFeed("listing/movies?page=1&postsPerPage=24&postType=movies&orderBy=latest&order=desc&genres=" + encodeURIComponent(lmG), "movie", null);
                fetchLaMovieFeed("listing/tvshows?page=1&postsPerPage=24&postType=tvshows&orderBy=latest&order=desc&genres=" + encodeURIComponent(lmG), "series", null);
            }
            if (fpG !== "") {
                fetchFanpelisFeed("listing?page=1&postsPerPage=24&postType=movies&genres=" + encodeURIComponent(fpG), "movie", null);
                fetchFanpelisFeed("listing?page=1&postsPerPage=24&postType=series&genres=" + encodeURIComponent(fpG), "series", null);
            }
        }
    }

    function moveSidebar(dir) {
        var next = sidebarFocusIdx;
        for (var i = 0; i < sidebarItems.length; i++) {
            next = (next + dir + sidebarItems.length) % sidebarItems.length;
            if (sidebarItems[next].kind !== "header") break;
        }
        sidebarFocusIdx = next;
    }

    // Align Grid -> Sidebar transition vertically to match current grid row height
    function findSidebarIndexAlignedToGridRow(rowIdx) {
        var rowsVisible = Math.max(1, Math.ceil(pageStreamModel.count / gridCols));
        var frac = rowsVisible > 1 ? Math.min(1, Math.max(0, rowIdx / (rowsVisible - 1))) : 0;
        var visStartY = sidebarListView ? sidebarListView.contentY : 0;
        var visH = (sidebarListView && sidebarListView.height > 0) ? sidebarListView.height : vpx(520);
        var targetY = visStartY + frac * Math.max(0, visH - vpx(56));
        var accumY = 0;
        var bestIdx = sidebarFocusIdx;
        var bestDist = 999999;
        for (var i = 0; i < sidebarItems.length; i++) {
            var rh = (sidebarItems[i].kind === "header" ? vpx(36) : vpx(46)) + vpx(4);
            var mid = accumY + rh * 0.5;
            if (sidebarItems[i].kind !== "header") {
                var d = Math.abs(mid - targetY);
                if (d < bestDist) {
                    bestDist = d;
                    bestIdx = i;
                }
            }
            accumY += rh;
        }
        return bestIdx;
    }

    function goHome() {
        navSound.play();
        detailOpen = false;
        fullscreenVideo = false;
        destroyPreviewPlayer();
        destroyFullscreenPlayer();
        searchQuery = "";
        activeTab = "forme";
        activeLetter = "All";
        selectedGenre = "";
        sidebarFocusIdx = 0;
        currentPage = 0;
        focusZone = "grid";
        rebuildFilteredStream();
    }

    function navigate(rawTarget) {
        var t = String(rawTarget || "").trim();
        if (t === "" || t === "https://lamovie.org" || t === "netflix://") {
            goHome();
            return;
        }
        currentUrl = t;
        activeTab = "external";
        detailOpen = false;
        fullscreenVideo = false;
        destroyPreviewPlayer();
        if (nativeWebView) {
            try { nativeWebView.destroy(); } catch (e) {}
            nativeWebView = null;
        }
        mountWebInto(externalWebHost, t, false, "external", "", "");
    }

    function goBack() {
        if (fullscreenVideo) {
            closeFullscreenPlayback();
        } else if (detailOpen) {
            detailOpen = false;
            previewPaused = false;
            destroyPreviewPlayer();
            focusZone = "grid";
            backSfx.play();
        } else if (activeTab === "external") {
            goHome();
        } else {
            backSfx.play();
            closeInThemeBrowser();
        }
    }

    function loadAllStreamingFeeds(forceRefresh) {
        if (!forceRefresh && typeof api !== "undefined" && api.memory && api.memory.has("STREAM_CACHE_V3")) {
            try {
                var cObj = JSON.parse(String(api.memory.get("STREAM_CACHE_V3")));
                if (cObj && cObj.ts && (Date.now() - cObj.ts) < 900000 && Array.isArray(cObj.items) && cObj.items.length > 8) {
                    allStreamItems = cObj.items;
                    isLoading = false;
                    rebuildFilteredStream();
                    return;
                }
            } catch (eC) {}
        }
        isLoading = true;
        moviesApiPage = 2;
        seriesApiPage = 2;
        fanMoviesApiPage = 2;
        fanSeriesApiPage = 2;
        hasMoreMovies = true;
        hasMoreSeries = true;
        hasMoreFanMovies = true;
        hasMoreFanSeries = true;

        var pending = 8;
        var markDone = function() {
            pending--;
            if (pending <= 0) isLoading = false;
        };

        for (var mp = 1; mp <= 2; mp++) {
            fetchLaMovieFeed("listing/movies?page=" + mp + "&postsPerPage=24&postType=movies&orderBy=latest&order=desc", "movie", function(cnt) {
                if (cnt === 0) hasMoreMovies = false;
                markDone();
            });
            fetchFanpelisFeed("listing?page=" + mp + "&postsPerPage=24&postType=movies", "movie", function(cnt2) {
                if (cnt2 === 0) hasMoreFanMovies = false;
                markDone();
            });
        }
        for (var sp = 1; sp <= 2; sp++) {
            fetchLaMovieFeed("listing/tvshows?page=" + sp + "&postsPerPage=24&postType=tvshows&orderBy=latest&order=desc", "series", function(cnt3) {
                if (cnt3 === 0) hasMoreSeries = false;
                markDone();
            });
            fetchFanpelisFeed("listing?page=" + sp + "&postsPerPage=24&postType=series", "series", function(cnt4) {
                if (cnt4 === 0) hasMoreFanSeries = false;
                markDone();
            });
        }
        fetchYouTubeDailymotionFeed("Nintendo Switch 2 trailer gameplay");
    }

    Component.onCompleted: {
        loadSavedFavorites();
        loadContinueWatching();
        allStreamItems = fallbackCatalog.slice(0);
        rebuildFilteredStream();
    }

    onVisibleChanged: {
        if (visible) {
            loadSavedFavorites();
            loadContinueWatching();
            if (allStreamItems.length <= fallbackCatalog.length) loadAllStreamingFeeds(false);
            browserRoot.forceActiveFocus();
        } else {
            destroyPreviewPlayer();
            destroyFullscreenPlayer();
        }
    }

    Keys.onLeftPressed: {
        if (editingUrl) return;
        if (fullscreenVideo) {
            seekFullscreenRelative(-10000);
            return;
        }
        navSound.play();
        if (detailOpen) {
            if (detailBtnIdx === 0) detailBtnIdx = 3;
            else if (detailBtnIdx === 1) detailBtnIdx = 0;
            else detailBtnIdx -= 1;
            return;
        }
        if (focusZone === "grid") {
            if (gridIndex % gridCols === 0) {
                if (currentPage > 0) {
                    prevPage();
                } else {
                    var currentRow = Math.floor(gridIndex / gridCols);
                    sidebarFocusIdx = findSidebarIndexAlignedToGridRow(currentRow);
                    focusZone = "sidebar";
                }
            } else {
                gridIndex = Math.max(0, gridIndex - 1);
            }
        }
    }
    Keys.onRightPressed: {
        if (editingUrl) return;
        if (fullscreenVideo) {
            seekFullscreenRelative(10000);
            return;
        }
        navSound.play();
        if (detailOpen) {
            detailBtnIdx = (detailBtnIdx + 1) % 4;
            return;
        }
        if (focusZone === "sidebar") {
            activateSidebar(sidebarFocusIdx);
            focusZone = "grid";
        } else if (pageStreamModel.count > 0) {
            var isRowEnd = (gridIndex % gridCols === gridCols - 1) || (gridIndex === pageStreamModel.count - 1);
            if (isRowEnd && (currentPage + 1 < totalPages() || hasAnyMoreFeeds())) {
                nextPage();
            } else {
                gridIndex = Math.min(pageStreamModel.count - 1, gridIndex + 1);
            }
        }
    }
    Keys.onUpPressed: {
        if (editingUrl) return;
        if (fullscreenVideo) { wakePlayerOsd(); return; }
        navSound.play();
        if (detailOpen) {
            detailBtnIdx = 0;
            return;
        }
        if (focusZone === "sidebar") moveSidebar(-1);
        else gridIndex = Math.max(0, gridIndex - gridCols);
    }
    Keys.onDownPressed: {
        if (editingUrl) return;
        if (fullscreenVideo) { wakePlayerOsd(); return; }
        navSound.play();
        if (detailOpen) {
            if (detailBtnIdx === 0) detailBtnIdx = 1;
            return;
        }
        if (focusZone === "sidebar") moveSidebar(1);
        else if (pageStreamModel.count > 0) gridIndex = Math.min(pageStreamModel.count - 1, gridIndex + gridCols);
    }
    Keys.onBackPressed: {
        event.accepted = true;
        if (fullscreenVideo) {
            closeFullscreenPlayback();
            return;
        }
        if (detailOpen) {
            goBack();
            return;
        }
        destroyPreviewPlayer();
        destroyFullscreenPlayer();
        backSfx.play();
        closeInThemeBrowser();
    }
    Keys.onEscapePressed: {
        event.accepted = true;
        goBack();
    }
    Keys.onReleased: {
        if (typeof root !== "undefined" && typeof root.handleGlobalSleepCombo === "function")
            root.handleGlobalSleepCombo(event.key, false, event.isAutoRepeat);
    }
    Keys.onPressed: {
        if (typeof root !== "undefined" && typeof root.handleGlobalSleepCombo === "function" && root.handleGlobalSleepCombo(event.key, true, event.isAutoRepeat)) { event.accepted = true; return; }
        var isB = api.keys.isCancel(event) || event.key === Qt.Key_Escape || event.key === Qt.Key_B || event.key === Qt.Key_Backspace;
        if (fullscreenVideo) {
            if (isB && !event.isAutoRepeat) {
                event.accepted = true;
                closeFullscreenPlayback();
                return;
            }
            if ((api.keys.isAccept(event) || event.key === Qt.Key_Space || event.key === Qt.Key_P) && !event.isAutoRepeat) {
                event.accepted = true;
                toggleFullscreenPlayPause();
                return;
            }
            if (api.keys.isPrevPage(event)) {
                event.accepted = true;
                seekFullscreenRelative(-30000);
                return;
            }
            if (api.keys.isNextPage(event)) {
                event.accepted = true;
                seekFullscreenRelative(30000);
                return;
            }
            if ((api.keys.isDetails(event) || event.key === Qt.Key_Y || event.key === Qt.Key_A) && !event.isAutoRepeat) {
                event.accepted = true;
                cycleAspectMode();
                return;
            }
            wakePlayerOsd();
            return;
        }
        if (detailOpen) {
            if (isB && !event.isAutoRepeat) { event.accepted = true; goBack(); }
            else if (api.keys.isAccept(event) && !event.isAutoRepeat) {
                event.accepted = true;
                if (detailBtnIdx === 0) togglePreviewPlayback();
                else if (detailBtnIdx === 2) toggleFavorite();
                else if (detailBtnIdx === 3) Qt.openUrlExternally(detailPlayUrl !== "" ? detailPlayUrl : (detailItem.pageUrl || "https://lamovie.org"));
                else openFullscreenPlayback();
            } else if ((api.keys.isDetails(event) || event.key === Qt.Key_F) && !event.isAutoRepeat) {
                event.accepted = true;
                toggleFavorite();
            }
            return;
        }
        if (isB && !event.isAutoRepeat) {
            event.accepted = true;
            goBack();
        } else if (api.keys.isAccept(event) && !event.isAutoRepeat) {
            event.accepted = true;
            if (focusZone === "sidebar") {
                activateSidebar(sidebarFocusIdx);
                focusZone = "grid";
            } else {
                openItemDetail(gridIndex);
            }
        } else if (api.keys.isFilters(event) && !event.isAutoRepeat) {
            event.accepted = true;
            openSearchKeyboard();
        } else if ((api.keys.isDetails(event) || event.key === Qt.Key_Y || event.key === Qt.Key_Z) && !event.isAutoRepeat) {
            event.accepted = true;
            cycleGridZoom();
        } else if (event.key === Qt.Key_F && !event.isAutoRepeat) {
            event.accepted = true;
            toggleFavorite();
        } else if (api.keys.isNextPage(event) && !event.isAutoRepeat) {
            event.accepted = true;
            stepAlphabetLetter(1);
        } else if (api.keys.isPrevPage(event) && !event.isAutoRepeat) {
            event.accepted = true;
            stepAlphabetLetter(-1);
        }
    }

    Rectangle { anchors.fill: parent; color: "#0B0B0F" }

    // Top Netflix Header Bar (Zero TextInput -> Zero Blue Box!)
    Rectangle {
        id: browserTopBar
        anchors { top: parent.top; left: parent.left; right: parent.right }
        height: vpx(64)
        color: "#111116"
        z: 30

        Rectangle { anchors.bottom: parent.bottom; width: parent.width; height: 1; color: "#27272A" }

        RowLayout {
            anchors { fill: parent; leftMargin: vpx(16); rightMargin: vpx(16) }
            spacing: vpx(10)

            Rectangle {
                Layout.preferredWidth: vpx(38); Layout.preferredHeight: vpx(40)
                width: vpx(38); height: vpx(40); radius: vpx(10); color: "#1C1C22"
                Text { anchors.centerIn: parent; text: "<"; color: "#FFFFFF"; font.family: titleFont.name; font.bold: true; font.pixelSize: vpx(18) }
                MouseArea { anchors.fill: parent; onClicked: browserRoot.goBack() }
            }

            Text {
                text: "NETFLIX"
                color: "#E50914"
                font.family: titleFont.name
                font.pixelSize: vpx(26)
                font.bold: true
                font.letterSpacing: 1.5
            }

            Rectangle {
                Layout.preferredWidth: vpx(84); Layout.preferredHeight: vpx(40)
                radius: vpx(10); color: browserRoot.activeTab === "forme" ? "#E50914" : "#1C1C22"
                Text { anchors.centerIn: parent; text: tr("For Me"); color: "#FFFFFF"; font.family: titleFont.name; font.pixelSize: vpx(14); font.bold: true }
                MouseArea { anchors.fill: parent; onClicked: browserRoot.goHome() }
            }

            Rectangle {
                Layout.fillWidth: true; Layout.preferredHeight: vpx(40); radius: vpx(10)
                color: "#18181D"
                border.color: browserRoot.editingUrl ? "#E50914" : "#3F3F46"
                border.width: browserRoot.editingUrl ? vpx(2) : vpx(1)

                Text {
                    anchors { fill: parent; leftMargin: vpx(14); rightMargin: vpx(14) }
                    verticalAlignment: Text.AlignVCenter
                    text: browserRoot.searchQuery !== "" ? ("Search: " + browserRoot.searchQuery)
                          : (browserRoot.activeTab === "youtube" ? tr("Search YouTube / Videos (X)...") : tr("Search LaMovie + Fanpelis (X)..."))
                    color: browserRoot.searchQuery !== "" ? "#FFFFFF" : "#A1A1AA"
                    font.family: titleFont.name; font.pixelSize: vpx(14); elide: Text.ElideRight
                }
                MouseArea { anchors.fill: parent; onClicked: browserRoot.openSearchKeyboard() }
            }

            Rectangle {
                visible: browserRoot.searchQuery !== ""
                Layout.preferredWidth: vpx(66); Layout.preferredHeight: vpx(40); radius: vpx(10); color: "#27272A"
                Text { anchors.centerIn: parent; text: tr("Clear"); color: "#FFFFFF"; font.family: titleFont.name; font.pixelSize: vpx(13); font.bold: true }
                MouseArea { anchors.fill: parent; onClicked: { browserRoot.searchQuery = ""; browserRoot.currentPage = 0; browserRoot.rebuildFilteredStream(); } }
            }

            Rectangle {
                Layout.preferredWidth: vpx(88); Layout.preferredHeight: vpx(40); radius: vpx(10); color: "#1C1C22"
                border.width: 1; border.color: "#3F3F46"
                Text {
                    anchors.centerIn: parent
                    text: "Y · " + (browserRoot.gridCols === 4 ? "4×4" : (browserRoot.gridCols === 3 ? "3×3" : "2×1"))
                    color: "#FFFFFF"; font.family: titleFont.name; font.pixelSize: vpx(13); font.bold: true
                }
                MouseArea { anchors.fill: parent; onClicked: browserRoot.cycleGridZoom() }
            }

            Rectangle {
                Layout.preferredWidth: vpx(70); Layout.preferredHeight: vpx(40); radius: vpx(10); color: "#1C1C22"
                Text { anchors.centerIn: parent; text: browserRoot.isLoading ? "..." : tr("Sync"); color: "#FFFFFF"; font.family: titleFont.name; font.pixelSize: vpx(13); font.bold: true }
                MouseArea { anchors.fill: parent; onClicked: browserRoot.loadAllStreamingFeeds(true) }
            }

            Rectangle {
                Layout.preferredWidth: vpx(82); Layout.preferredHeight: vpx(40); radius: vpx(10); color: "#E50914"
                Text { anchors.centerIn: parent; text: tr("B  Close"); color: "#FFFFFF"; font.family: titleFont.name; font.pixelSize: vpx(14); font.bold: true }
                MouseArea { anchors.fill: parent; onClicked: { backSfx.play(); closeInThemeBrowser(); } }
            }
        }
    }

    // Main eShop-Style Netflix Body (Left Category Sidebar + Right Content Pane)
    Item {
        anchors { top: browserTopBar.bottom; bottom: parent.bottom; left: parent.left; right: parent.right }

        Rectangle {
            id: netflixSidebar
            anchors { top: parent.top; bottom: parent.bottom; left: parent.left }
            width: Math.round(parent.width * 0.22)
            color: "#111116"
            visible: browserRoot.activeTab !== "external"

            ListView {
                id: sidebarListView
                anchors { fill: parent; margins: vpx(12) }
                clip: true; spacing: vpx(4)
                boundsBehavior: Flickable.StopAtBounds
                currentIndex: browserRoot.sidebarFocusIdx
                onCurrentIndexChanged: positionViewAtIndex(currentIndex, ListView.Contain)
                model: browserRoot.sidebarItems
                delegate: Item {
                    width: sidebarListView.width
                    height: modelData.kind === "header" ? vpx(36) : vpx(46)
                    property bool isActive: (modelData.kind === "genre" && browserRoot.activeTab === "genre" && browserRoot.selectedGenre === modelData.genre)
                                         || (modelData.kind === "tab" && browserRoot.activeTab === modelData.id)
                    property bool isKb: browserRoot.focusZone === "sidebar" && index === browserRoot.sidebarFocusIdx

                    Rectangle {
                        visible: modelData.kind !== "header"
                        anchors.fill: parent; radius: vpx(8)
                        color: isActive ? "#E50914" : (isKb ? "#23232D" : "transparent")
                        border.width: isKb ? vpx(2.5) : 0; border.color: "#E50914"
                    }
                    Text {
                        anchors { left: parent.left; leftMargin: modelData.kind === "genre" ? vpx(18) : vpx(12); right: parent.right; rightMargin: vpx(8); verticalCenter: parent.verticalCenter }
                        text: modelData.label
                        elide: Text.ElideRight
                        color: modelData.kind === "header" ? "#E50914" : "#FFFFFF"
                        font.family: titleFont.name; font.pixelSize: modelData.kind === "header" ? vpx(14) : vpx(18)
                        font.bold: isActive || isKb || modelData.kind === "header" || modelData.kind === "tab"
                    }
                    MouseArea {
                        anchors.fill: parent; enabled: modelData.kind !== "header"
                        onClicked: { browserRoot.focusZone = "sidebar"; browserRoot.activateSidebar(index); browserRoot.focusZone = "grid"; }
                    }
                }
            }
        }

        // Right Content Pane
        Item {
            anchors { top: parent.top; bottom: parent.bottom; left: browserRoot.activeTab === "external" ? parent.left : netflixSidebar.right; right: parent.right }

            Item {
                visible: browserRoot.activeTab === "external"
                anchors.fill: parent
                Item { id: externalWebHost; anchors { top: parent.top; bottom: extBar.top; left: parent.left; right: parent.right } }
                Rectangle {
                    id: extBar
                    anchors { bottom: parent.bottom; left: parent.left; right: parent.right }
                    height: vpx(46)
                    color: "#14141A"
                    Row {
                        anchors.centerIn: parent; spacing: vpx(16)
                        Text { text: browserRoot.currentUrl; color: "#D4D4D8"; font.pixelSize: vpx(13); elide: Text.ElideRight; width: vpx(420) }
                        Rectangle {
                            width: vpx(130); height: vpx(32); radius: vpx(6); color: "#2563EB"
                            Text { anchors.centerIn: parent; text: tr("Open Chrome"); color: "#FFFFFF"; font.pixelSize: vpx(13); font.bold: true }
                            MouseArea { anchors.fill: parent; onClicked: Qt.openUrlExternally(browserRoot.currentUrl) }
                        }
                        Rectangle {
                            width: vpx(130); height: vpx(32); radius: vpx(6); color: "#E50914"
                            Text { anchors.centerIn: parent; text: tr("Back to Netflix"); color: "#FFFFFF"; font.pixelSize: vpx(13); font.bold: true }
                            MouseArea { anchors.fill: parent; onClicked: browserRoot.goHome() }
                        }
                    }
                }
            }

            // Streaming Cards Grid (4x4 / 3x3 / 2x1 Carousel) + Bottom A-Z Bar & Prev/Next Pagination
            Item {
                visible: browserRoot.activeTab !== "external" && !browserRoot.detailOpen
                anchors { fill: parent; margins: vpx(14) }

                Text {
                    visible: pageStreamModel.count === 0
                    anchors.centerIn: streamGridWrap
                    text: browserRoot.activeTab === "favorites"
                          ? tr("No Favorites matched. Press F inside any movie, series, or video.")
                          : (browserRoot.activeTab === "continue"
                             ? tr("No watched titles yet. Open any movie or series to add it here.")
                             : (browserRoot.isLoading ? tr("Loading streaming catalog...") : tr("No titles matched. Press Next Page or pick another letter.")))
                    color: "#9CA3AF"; font.family: titleFont.name; font.pixelSize: vpx(17)
                }

                Item {
                    id: streamGridWrap
                    anchors { top: parent.top; left: parent.left; right: parent.right; bottom: netflixAzBar.top; bottomMargin: vpx(8) }
                    clip: true

                    GridView {
                        id: streamGrid
                        x: browserRoot.gridAnimOffset
                        y: 0
                        width: parent.width
                        height: parent.height
                        clip: true
                        cellWidth: Math.floor(width / browserRoot.gridCols)
                        cellHeight: browserRoot.gridCols === 2 ? Math.max(vpx(260), Math.floor(height - vpx(8))) : (browserRoot.gridCols === 3 ? Math.max(vpx(190), Math.floor(height / 3)) : Math.max(vpx(155), Math.floor(height / 4)))
                        model: pageStreamModel
                        currentIndex: browserRoot.gridIndex

                        delegate: Item {
                            width: streamGrid.cellWidth; height: streamGrid.cellHeight
                            property bool selected: browserRoot.focusZone === "grid" && index === browserRoot.gridIndex
                            property bool isFav: browserRoot.isFavoriteItem(model.slug)

                            Rectangle {
                                anchors { fill: parent; margins: browserRoot.gridCols === 2 ? vpx(10) : vpx(6) }
                                radius: vpx(12); color: "#18181F"; clip: true
                                scale: selected && browserRoot.gridCols === 2 ? 1.015 : 1.0
                                Behavior on scale { NumberAnimation { duration: 150; easing.type: Easing.OutCubic } }

                                Item {
                                    id: mediaThumbWrap
                                    anchors { top: parent.top; left: parent.left; right: parent.right }
                                    height: browserRoot.gridCols === 2 ? Math.round(parent.height * 0.72) : Math.round(parent.height * 0.62); clip: true
                                    Image { anchors.fill: parent; source: model.backdrop || model.thumb; fillMode: Image.PreserveAspectCrop; asynchronous: true; cache: true }
                                    Rectangle {
                                        anchors { top: parent.top; left: parent.left; margins: vpx(6) }
                                        height: vpx(20); width: srcTxt.implicitWidth + vpx(12); radius: vpx(5)
                                        color: model.mediaType === "youtube" ? "#DC2626" : (model.mediaType === "series" ? "#7C3AED" : "#E50914")
                                        Text { id: srcTxt; anchors.centerIn: parent; text: model.mediaType === "youtube" ? "YOUTUBE" : (model.mediaType === "series" ? "SERIES" : "MOVIE"); color: "#FFFFFF"; font.pixelSize: vpx(10); font.bold: true }
                                    }
                                    Rectangle {
                                        visible: isFav
                                        anchors { top: parent.top; right: parent.right; margins: vpx(6) }
                                        width: vpx(24); height: vpx(24); radius: vpx(12); color: "#E50914"
                                        Text { anchors.centerIn: parent; text: "★"; color: "#FDE047"; font.pixelSize: vpx(13) }
                                    }
                                }

                                Column {
                                    anchors { top: mediaThumbWrap.bottom; bottom: parent.bottom; left: parent.left; right: parent.right; margins: vpx(8) }
                                    spacing: vpx(3)
                                    Text {
                                        width: parent.width; text: model.title; color: "#FFFFFF"
                                        font.family: titleFont.name
                                        font.pixelSize: browserRoot.gridCols === 2 ? vpx(18) : (browserRoot.gridCols === 3 ? vpx(15) : vpx(14))
                                        font.bold: true; elide: Text.ElideRight
                                    }
                                    Text {
                                        width: parent.width
                                        text: (model.source || "LaMovie") + " · " + (model.genre || "")
                                        color: model.sourceProvider === "fanpelis" ? "#38BDF8" : "#E50914"
                                        font.family: titleFont.name; font.pixelSize: browserRoot.gridCols === 2 ? vpx(13) : vpx(11); font.bold: true; elide: Text.ElideRight
                                    }
                                }

                                Rectangle {
                                    anchors.fill: parent; radius: vpx(12); color: "transparent"
                                    border.width: selected ? vpx(4) : 1
                                    border.color: selected ? "#E50914" : "#27272A"
                                    z: 20
                                }
                                MouseArea {
                                    anchors.fill: parent
                                    onClicked: { browserRoot.focusZone = "grid"; browserRoot.gridIndex = index; browserRoot.openItemDetail(index); }
                                }
                            }
                        }
                    }
                }

                Rectangle {
                    id: netflixAzBar
                    anchors { left: parent.left; right: parent.right; bottom: netflixPagerBar.top; bottomMargin: vpx(6) }
                    height: vpx(38)
                    radius: vpx(8)
                    color: "#15151C"
                    border.width: 1
                    border.color: "#27272A"

                    Row {
                        anchors { fill: parent; leftMargin: vpx(8); rightMargin: vpx(8) }
                        spacing: vpx(4)

                        Text {
                            text: "LB"
                            color: "#E50914"
                            font.family: titleFont.name; font.pixelSize: vpx(12); font.bold: true
                            anchors.verticalCenter: parent.verticalCenter
                        }

                        Flickable {
                            width: parent.width - vpx(54)
                            height: parent.height
                            contentWidth: netflixAzRow.implicitWidth
                            clip: true
                            anchors.verticalCenter: parent.verticalCenter

                            Row {
                                id: netflixAzRow
                                height: parent.height
                                spacing: vpx(4)
                                Repeater {
                                    model: browserRoot.alphabetLetters
                                    delegate: Rectangle {
                                        property bool cur: browserRoot.activeLetter === modelData
                                        width: modelData === "All" ? vpx(36) : vpx(26)
                                        height: vpx(26)
                                        radius: vpx(6)
                                        anchors.verticalCenter: parent.verticalCenter
                                        color: cur ? "#E50914" : "transparent"
                                        Text {
                                            anchors.centerIn: parent
                                            text: modelData
                                            color: cur ? "#FFFFFF" : "#D4D4D8"
                                            font.family: titleFont.name; font.pixelSize: vpx(12); font.bold: true
                                        }
                                        MouseArea { anchors.fill: parent; onClicked: browserRoot.selectAlphabetLetter(modelData) }
                                    }
                                }
                            }
                        }

                        Text {
                            text: "RB"
                            color: "#E50914"
                            font.family: titleFont.name; font.pixelSize: vpx(12); font.bold: true
                            anchors.verticalCenter: parent.verticalCenter
                        }
                    }
                }

                Rectangle {
                    id: netflixPagerBar
                    anchors { left: parent.left; right: parent.right; bottom: parent.bottom }
                    height: vpx(38)
                    radius: vpx(8)
                    color: "#111116"
                    border.width: 1
                    border.color: "#27272A"

                    Row {
                        anchors { left: parent.left; leftMargin: vpx(10); verticalCenter: parent.verticalCenter }
                        spacing: vpx(8)
                        Rectangle {
                            width: vpx(82); height: vpx(26); radius: vpx(6)
                            color: browserRoot.currentPage > 0 ? "#27272A" : "#18181D"
                            Text { anchors.centerIn: parent; text: "< Prev"; color: browserRoot.currentPage > 0 ? "#FFFFFF" : "#71717A"; font.family: titleFont.name; font.pixelSize: vpx(12); font.bold: true }
                            MouseArea { anchors.fill: parent; enabled: browserRoot.currentPage > 0; onClicked: browserRoot.prevPage() }
                        }
                        Text {
                            anchors.verticalCenter: parent.verticalCenter
                            text: "Page " + (browserRoot.currentPage + 1) + "/" + browserRoot.totalPages() + (browserRoot.hasAnyMoreFeeds() ? "+" : "") + " (" + filteredStreamModel.count + " titles · Letter: " + browserRoot.activeLetter + ")"
                            color: "#D4D4D8"
                            font.family: titleFont.name; font.pixelSize: vpx(12)
                        }
                        Rectangle {
                            property bool canNext: (browserRoot.currentPage + 1 < browserRoot.totalPages()) || browserRoot.hasAnyMoreFeeds()
                            width: vpx(96); height: vpx(26); radius: vpx(6)
                            color: canNext ? "#E50914" : "#18181D"
                            Text { anchors.centerIn: parent; text: browserRoot.feedBusy ? "Loading..." : "Next Page >"; color: canNext ? "#FFFFFF" : "#71717A"; font.family: titleFont.name; font.pixelSize: vpx(12); font.bold: true }
                            MouseArea { anchors.fill: parent; enabled: parent.canNext; onClicked: browserRoot.nextPage() }
                        }
                    }
                }
            }

            // In-Section Streaming Detail Page (Compact 2-line Season & Episode Bars)
            Rectangle {
                visible: browserRoot.activeTab !== "external" && browserRoot.detailOpen
                anchors.fill: parent; color: "#0B0B0F"; z: 35

                RowLayout {
                    anchors { fill: parent; margins: vpx(22) }
                    spacing: vpx(22)

                    Rectangle {
                        Layout.preferredWidth: Math.round(parent.width * 0.48); Layout.fillHeight: true
                        radius: vpx(14); color: "#050507"; clip: true
                        border.width: browserRoot.detailBtnIdx === 0 ? vpx(4) : 1
                        border.color: browserRoot.detailBtnIdx === 0 ? "#FFFFFF" : "#E50914"

                        Image { anchors.fill: parent; source: browserRoot.detailBackdrop; fillMode: Image.PreserveAspectCrop }
                        Video {
                            id: previewVideoPlayer
                            anchors.fill: parent
                            source: (!browserRoot.previewPaused && !browserRoot.fullscreenVideo) ? browserRoot.detailPreviewDirectUrl : ""
                            fillMode: VideoOutput.PreserveAspectCrop
                            autoPlay: true
                            muted: false
                            volume: 0.7
                            visible: browserRoot.detailPreviewDirectUrl !== "" && !browserRoot.previewPaused && !browserRoot.fullscreenVideo && previewVideoPlayer.hasVideo
                        }
                        Item { id: previewVideoHost; anchors.fill: parent; visible: browserRoot.detailPreviewDirectUrl === "" && !browserRoot.previewPaused && !browserRoot.fullscreenVideo; enabled: false }
                        Rectangle {
                            anchors { bottom: parent.bottom; left: parent.left; right: parent.right }
                            height: vpx(42); color: "#CC000000"
                            Row {
                                anchors.centerIn: parent; spacing: vpx(8)
                                Text { text: browserRoot.previewPaused ? "▶" : "❚❚"; color: "#E50914"; font.pixelSize: vpx(15) }
                                Text {
                                    text: browserRoot.previewPaused
                                          ? tr("Preview Paused · Press A / Tap to Play")
                                          : tr("Preview Playing · Press A / Tap to Pause")
                                    color: "#FFFFFF"; font.family: titleFont.name; font.pixelSize: vpx(13); font.bold: true
                                }
                            }
                        }
                        MouseArea { anchors.fill: parent; onClicked: { browserRoot.detailBtnIdx = 0; browserRoot.togglePreviewPlayback(); } }
                    }

                    ColumnLayout {
                        Layout.fillWidth: true; Layout.fillHeight: true; spacing: vpx(10)
                        Text {
                            Layout.fillWidth: true; text: browserRoot.detailItem.title || ""; color: "#FFFFFF"
                            font.family: titleFont.name; font.pixelSize: Math.round(screenheight * 0.034); font.bold: true; wrapMode: Text.WordWrap; maximumLineCount: 2; elide: Text.ElideRight
                        }
                        Text {
                            text: (browserRoot.detailItem.source || "LaMovie") + " · " + (browserRoot.detailItem.genre || "") + (browserRoot.detailItem.year ? (" · " + browserRoot.detailItem.year) : "")
                            color: browserRoot.detailItem.sourceProvider === "fanpelis" ? "#38BDF8" : "#E50914"
                            font.family: titleFont.name; font.pixelSize: vpx(14); font.bold: true
                        }
                        Flickable {
                            Layout.fillWidth: true; Layout.fillHeight: true; contentWidth: width; contentHeight: detailSynopsisCol.implicitHeight + vpx(8); clip: true
                            Column {
                                id: detailSynopsisCol
                                width: parent.width
                                spacing: vpx(8)
                                Text {
                                    width: parent.width; text: browserRoot.detailSynopsis; color: "#E4E4E7"
                                    font.family: titleFont.name; font.pixelSize: Math.round(screenheight * 0.022); wrapMode: Text.WordWrap; lineHeight: 1.35
                                }
                            }
                        }

                        // Server source pills compact single horizontal strip
                        ListView {
                            visible: playerSourcesModel.count > 0
                            Layout.fillWidth: true; Layout.preferredHeight: vpx(32)
                            orientation: ListView.Horizontal; spacing: vpx(6); clip: true
                            model: playerSourcesModel
                            delegate: Rectangle {
                                width: srvLbl.implicitWidth + vpx(18); height: vpx(30); radius: vpx(6)
                                color: browserRoot.selectedPlayerIdx === index ? "#E50914" : "#1C1C22"
                                Text { id: srvLbl; anchors.centerIn: parent; text: model.label; color: "#FFFFFF"; font.family: titleFont.name; font.pixelSize: vpx(12); font.bold: true }
                                MouseArea { anchors.fill: parent; onClicked: { browserRoot.selectedPlayerIdx = index; browserRoot.detailPlayUrl = model.url; } }
                            }
                        }

                        // Compact Line 1: Horizontal Season Selector
                        ListView {
                            id: seasonsRowView
                            visible: seasonsModel.count > 0 && browserRoot.detailItem.mediaType === "series"
                            Layout.fillWidth: true; Layout.preferredHeight: vpx(34)
                            orientation: ListView.Horizontal; spacing: vpx(6); clip: true
                            model: seasonsModel
                            delegate: Rectangle {
                                width: seasLbl.implicitWidth + vpx(20); height: vpx(32); radius: vpx(6)
                                color: browserRoot.activeSeason === model.seasonNum ? "#E50914" : "#1C1C22"
                                border.width: browserRoot.activeSeason === model.seasonNum ? 0 : 1
                                border.color: "#3F3F46"
                                Text { id: seasLbl; anchors.centerIn: parent; text: "T" + model.seasonNum; color: "#FFFFFF"; font.family: titleFont.name; font.pixelSize: vpx(13); font.bold: true }
                                MouseArea {
                                    anchors.fill: parent
                                    onClicked: {
                                        navSound.play();
                                        browserRoot.loadSeasonEpisodes(browserRoot.detailItem.id, model.seasonNum, browserRoot.detailItem.title);
                                    }
                                }
                            }
                        }

                        // Compact Line 2: Horizontal Episode Selector
                        ListView {
                            id: episodesRowView
                            visible: episodesModel.count > 0
                            Layout.fillWidth: true; Layout.preferredHeight: vpx(36)
                            orientation: ListView.Horizontal; spacing: vpx(6); clip: true
                            model: episodesModel
                            delegate: Rectangle {
                                width: Math.min(vpx(200), epLbl.implicitWidth + vpx(20)); height: vpx(34); radius: vpx(6)
                                color: browserRoot.selectedEpisodeIdx === index ? "#E50914" : "#1C1C22"
                                border.width: browserRoot.selectedEpisodeIdx === index ? 0 : 1
                                border.color: "#3F3F46"
                                Text { id: epLbl; anchors.centerIn: parent; width: parent.width - vpx(12); horizontalAlignment: Text.AlignHCenter; elide: Text.ElideRight; text: (index + 1) + ". " + model.title; color: "#FFFFFF"; font.family: titleFont.name; font.pixelSize: vpx(12); font.bold: true }
                                MouseArea {
                                    anchors.fill: parent
                                    onClicked: {
                                        browserRoot.selectedEpisodeIdx = index;
                                        browserRoot.detailPlayUrl = "";
                                        browserRoot.streamsLoading = true;
                                        browserRoot.loadPlayerSourcesByPostId(model.eid, browserRoot.detailItem.title, true, browserRoot.detailItem.sourceProvider || "lamovie");
                                        browserRoot.openFullscreenPlayback();
                                    }
                                }
                            }
                        }

                        Row {
                            Layout.fillWidth: true; spacing: vpx(10)
                            Rectangle {
                                width: vpx(174); height: vpx(44); radius: vpx(10); color: "#E50914"
                                border.width: browserRoot.detailBtnIdx === 1 ? vpx(3) : 0; border.color: "#FFFFFF"
                                Text { anchors.centerIn: parent; text: tr("▶ Play Fullscreen"); color: "#FFFFFF"; font.family: titleFont.name; font.pixelSize: vpx(14); font.bold: true }
                                MouseArea { anchors.fill: parent; onClicked: { browserRoot.detailBtnIdx = 1; browserRoot.openFullscreenPlayback(); } }
                            }
                            Rectangle {
                                width: vpx(154); height: vpx(44); radius: vpx(10)
                                color: browserRoot.isFavoriteItem(browserRoot.detailItem.slug) ? "#F59E0B" : "#1C1C22"
                                border.width: browserRoot.detailBtnIdx === 2 ? vpx(3) : 1; border.color: browserRoot.detailBtnIdx === 2 ? "#FFFFFF" : "#3F3F46"
                                Text { anchors.centerIn: parent; text: browserRoot.isFavoriteItem(browserRoot.detailItem.slug) ? tr("★ Favorited") : tr("☆ Favorite"); color: "#FFFFFF"; font.family: titleFont.name; font.pixelSize: vpx(14); font.bold: true }
                                MouseArea { anchors.fill: parent; onClicked: { browserRoot.detailBtnIdx = 2; browserRoot.toggleFavorite(); } }
                            }
                            Rectangle {
                                width: vpx(122); height: vpx(44); radius: vpx(10); color: "#1C1C22"
                                border.width: browserRoot.detailBtnIdx === 3 ? vpx(3) : 1; border.color: browserRoot.detailBtnIdx === 3 ? "#E50914" : "#3F3F46"
                                Text { anchors.centerIn: parent; text: tr("Open Ext"); color: "#FFFFFF"; font.family: titleFont.name; font.pixelSize: vpx(13); font.bold: true }
                                MouseArea { anchors.fill: parent; onClicked: Qt.openUrlExternally(browserRoot.detailPlayUrl !== "" ? browserRoot.detailPlayUrl : (browserRoot.detailItem.pageUrl || "https://lamovie.org")) }
                            }
                        }
                    }
                }
            }
        }
    }

    // Fullscreen Streaming Overlay (Ambient Artwork Under ALL Videos + Flat Nintendo Switch Dark-Transparent OSD + No Top Close Button)
    Rectangle {
        visible: browserRoot.fullscreenVideo
        anchors.fill: parent
        color: "#090A0F"
        z: 120

        // Ambient movie artwork backdrop replacing all black bars (16:9, 1:1, ultrawide)
        Image {
            id: ambientBackArt
            anchors.fill: parent
            source: browserRoot.detailBackdrop || browserRoot.detailItem.thumb || ""
            fillMode: Image.PreserveAspectCrop
            smooth: true
            visible: false
        }
        FastBlur {
            anchors.fill: parent
            source: ambientBackArt
            radius: 42
            transparentBorder: false
        }
        // Subtle Switch-style translucent dark matte wash + corner Joy-Con trim decals
        Rectangle {
            anchors.fill: parent
            color: "#66090A10"
        }
        Rectangle {
            anchors { top: parent.top; left: parent.left; margins: vpx(20) }
            width: vpx(6); height: vpx(72); radius: vpx(3); color: "#440AB5E6"
        }
        Rectangle {
            anchors { bottom: parent.bottom; right: parent.right; margins: vpx(20) }
            width: vpx(6); height: vpx(72); radius: vpx(3); color: "#44FF3C28"
        }

        // Aspect Ratio Video Frame (0=Fit/100%, 1=16:9, 2=1:1 Square, 3=Fill)
        Item {
            id: fullscreenHost
            anchors.centerIn: parent
            width: browserRoot.aspectMode === 2
                   ? Math.min(parent.width, parent.height)
                   : (browserRoot.aspectMode === 1 ? Math.min(parent.width, Math.round(parent.height * 16 / 9)) : parent.width)
            height: browserRoot.aspectMode === 1
                    ? Math.min(parent.height, Math.round(parent.width * 9 / 16))
                    : parent.height
            clip: true

            Video {
                id: fullscreenVideoPlayer
                anchors.fill: parent
                source: browserRoot.activeFullscreenStream
                fillMode: (browserRoot.aspectMode === 3 || browserRoot.aspectMode === 2) ? VideoOutput.PreserveAspectCrop : VideoOutput.PreserveAspectFit
                autoPlay: true
                muted: false
                volume: 1.0
                visible: browserRoot.activeFullscreenStream !== ""
            }
        }

        Text {
            visible: browserRoot.fullscreenPending || browserRoot.fullscreenStatusText !== ""
            anchors.centerIn: parent
            text: browserRoot.fullscreenStatusText !== "" ? browserRoot.fullscreenStatusText : tr("Loading stream...")
            color: "#FFFFFF"; font.family: titleFont.name; font.pixelSize: vpx(20); font.bold: true
        }

        MouseArea {
            anchors.fill: parent
            z: 5
            onClicked: browserRoot.wakePlayerOsd()
        }

        // Flat Nintendo Switch Dark-Transparent Bottom Media Controls (Play/Pause, Time Scrubber, Icon-only Aspect Cyclers)
        Rectangle {
            id: switchPlayerOsd
            anchors { left: parent.left; right: parent.right; bottom: parent.bottom; margins: vpx(24) }
            height: vpx(96)
            radius: vpx(16)
            color: "#CC0B0D12"
            border.width: 1
            border.color: "#2EFFFFFF"
            z: 20
            opacity: browserRoot.osdVisible ? 1.0 : 0.0
            visible: opacity > 0.01
            Behavior on opacity { NumberAnimation { duration: 220; easing.type: Easing.OutCubic } }

            Column {
                anchors { fill: parent; leftMargin: vpx(20); rightMargin: vpx(20); topMargin: vpx(12); bottomMargin: vpx(10) }
                spacing: vpx(10)

                // Time Scrubber Above
                RowLayout {
                    width: parent.width
                    spacing: vpx(12)
                    Text {
                        text: browserRoot.formatMsTime(fullscreenVideoPlayer.position)
                        color: "#E4E4E7"; font.family: titleFont.name; font.pixelSize: vpx(12); font.bold: true
                    }
                    Rectangle {
                        Layout.fillWidth: true
                        height: vpx(8)
                        radius: vpx(4)
                        color: "#3AFFFFFF"
                        property real prog: fullscreenVideoPlayer.duration > 0 ? Math.min(1, Math.max(0, fullscreenVideoPlayer.position / fullscreenVideoPlayer.duration)) : 0
                        Rectangle {
                            width: Math.max(vpx(8), parent.width * parent.prog)
                            height: parent.height
                            radius: vpx(4)
                            color: "#FFFFFF"
                        }
                        MouseArea {
                            anchors.fill: parent
                            onClicked: {
                                if (fullscreenVideoPlayer.duration > 0 && fullscreenVideoPlayer.seekable) {
                                    var ratio = Math.min(1, Math.max(0, mouse.x / width));
                                    fullscreenVideoPlayer.seek(ratio * fullscreenVideoPlayer.duration);
                                    browserRoot.wakePlayerOsd();
                                }
                            }
                        }
                    }
                    Text {
                        text: browserRoot.formatMsTime(fullscreenVideoPlayer.duration)
                        color: "#A1A1AA"; font.family: titleFont.name; font.pixelSize: vpx(12); font.bold: true
                    }
                }

                // Centered Flat Switch Buttons (Play/Pause + In-place Aspect Icon ONLY, zero text)
                Row {
                    anchors.horizontalCenter: parent.horizontalCenter
                    spacing: vpx(22)

                    // Play / Pause Button (Icon only)
                    Rectangle {
                        width: vpx(44); height: vpx(40); radius: vpx(10)
                        color: "#22FFFFFF"
                        border.width: 1; border.color: "#44FFFFFF"
                        Text {
                            anchors.centerIn: parent
                            text: fullscreenVideoPlayer.playbackState === MediaPlayer.PlayingState ? "❚❚" : "▶"
                            color: "#FFFFFF"
                            font.pixelSize: vpx(16)
                        }
                        MouseArea { anchors.fill: parent; onClicked: browserRoot.toggleFullscreenPlayPause() }
                    }

                    // Single In-Place Aspect Ratio Icon (Cycles Fit / 16:9 / 1:1 / Fill visually with NO text)
                    Rectangle {
                        width: vpx(48); height: vpx(40); radius: vpx(10)
                        color: "#22FFFFFF"
                        border.width: 1; border.color: "#44FFFFFF"

                        // Inner geometric shape morphs cleanly per aspectMode
                        Rectangle {
                            anchors.centerIn: parent
                            width: browserRoot.aspectMode === 2 ? vpx(18) : (browserRoot.aspectMode === 1 ? vpx(26) : (browserRoot.aspectMode === 3 ? vpx(28) : vpx(22)))
                            height: browserRoot.aspectMode === 2 ? vpx(18) : (browserRoot.aspectMode === 1 ? vpx(15) : (browserRoot.aspectMode === 3 ? vpx(20) : vpx(16)))
                            radius: vpx(3)
                            color: browserRoot.aspectMode === 3 ? "#44FFFFFF" : "transparent"
                            border.width: vpx(2)
                            border.color: "#FFFFFF"
                            Rectangle {
                                visible: browserRoot.aspectMode === 0
                                anchors.centerIn: parent
                                width: vpx(8); height: vpx(6); radius: vpx(1)
                                color: "#FFFFFF"
                            }
                        }
                        MouseArea { anchors.fill: parent; onClicked: browserRoot.cycleAspectMode() }
                    }
                }
            }
        }
    }
}
