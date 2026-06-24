import React, { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import {
    AlertCircle,
    Check,
    ChevronDown,
    ExternalLink,
    Eye,
    FileText,
    LayoutGrid,
    RefreshCw,
    Search,
    Table,
    X,
} from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { GUILDS } from '../components/GuildSelect';
import PortfolioReviewPreview, {
    Avatar,
    GuildLabel,
    StatusBadge,
    formatCompactNumber,
    formatDisplayDate,
    normalizeTwitterHandle,
    resolveGuildId,
    toHandleKey,
} from '../components/PortfolioReviewPreview';
import { apiFetch, API_BASE } from '../utils/api';
import { usePortfolioWebSocket } from '../hooks/usePortfolioWebSocket';
const REVIEWER_ROLES = [
    "1519094379141398558",
    "1519094454265450506",
];
function useMediaQuery(query) {
    const subscribe = useCallback(
        (onStoreChange) => {
            if (typeof window === 'undefined') return () => { };
            const mediaQueryList = window.matchMedia(query);
            const handler = () => onStoreChange();
            if (mediaQueryList.addEventListener) {
                mediaQueryList.addEventListener('change', handler);
            } else {
                mediaQueryList.addListener(handler);
            }
            return () => {
                if (mediaQueryList.removeEventListener) {
                    mediaQueryList.removeEventListener('change', handler);
                } else {
                    mediaQueryList.removeListener(handler);
                }
            };
        },
        [query]
    );
    const getSnapshot = useCallback(() => {
        if (typeof window === 'undefined') return false;
        return window.matchMedia(query).matches;
    }, [query]);
    return useSyncExternalStore(subscribe, getSnapshot, () => false);
}
async function mapWithConcurrency(items, limit, mapper) {
    const results = new Array(items.length);
    let nextIndex = 0;
    async function worker() {
        while (true) {
            const currentIndex = nextIndex;
            if (currentIndex >= items.length) return;
            nextIndex += 1;
            results[currentIndex] = await mapper(items[currentIndex], currentIndex);
        }
    }
    const workers = Array.from({ length: Math.min(limit, items.length) }, () => worker());
    await Promise.all(workers);
    return results;
}
export default function Portfolios() {
    const { user, isAuthenticated, loading: authLoading, login } = useAuth();
    const [loading, setLoading] = useState(true);
    const [allPortfolios, setAllPortfolios] = useState([]);
    const [twitterProfiles, setTwitterProfiles] = useState({});
    const twitterProfilesRef = useRef(twitterProfiles);
    const [queue, setQueue] = useState('all');
    const [guild, setGuild] = useState('all');
    const [query, setQuery] = useState('');
    const [view, setView] = useState('table');
    const [sorting, setSorting] = useState({ id: 'submitted_at', desc: true });
    const [pageSize, setPageSize] = useState(25);
    const [pageIndex, setPageIndex] = useState(0);
    const [selectedDiscordId, setSelectedDiscordId] = useState(null);
    const [isPreviewOpen, setIsPreviewOpen] = useState(false);
    const [reviewNote, setReviewNote] = useState('');
    const noteAutosaveTimerRef = useRef(null);
    const selectedDiscordIdRef = useRef(selectedDiscordId);
    const reviewNoteRef = useRef(reviewNote);
    const [tweetStats, setTweetStats] = useState(null);
    const [loadingStats, setLoadingStats] = useState(false);
    const [portfolioTimeline, setPortfolioTimeline] = useState([]);
    const [loadingTimeline, setLoadingTimeline] = useState(false);
    const [reviewing, setReviewing] = useState(false);
    const [reviewMessage, setReviewMessage] = useState(null);
    const [isRejectModalOpen, setIsRejectModalOpen] = useState(false);
    const [rejectReason, setRejectReason] = useState('');
    const [rejectDiscordId, setRejectDiscordId] = useState(null);
    const [isDeletePortfolioModalOpen, setIsDeletePortfolioModalOpen] = useState(false);
    const [deletePortfolioDiscordId, setDeletePortfolioDiscordId] = useState(null);
    const [isDeleteUserModalOpen, setIsDeleteUserModalOpen] = useState(false);
    const [deleteUserDiscordId, setDeleteUserDiscordId] = useState(null);
    const [error, setError] = useState('');
    const isWide = useMediaQuery('(min-width: 1100px)');
    useEffect(() => {
        twitterProfilesRef.current = twitterProfiles;
    }, [twitterProfiles]);
    useEffect(() => {
        selectedDiscordIdRef.current = selectedDiscordId;
    }, [selectedDiscordId]);
    useEffect(() => {
        reviewNoteRef.current = reviewNote;
    }, [reviewNote]);
    const roleIds = user?.roles || [];
    const userId = user?.discord_id || "";
    const canReview = Array.isArray(roleIds)
        ? roleIds.some((r) => REVIEWER_ROLES.includes(String(r))) || REVIEWER_ROLES.includes(userId)
        : REVIEWER_ROLES.includes(userId);
    const getNoteStorageKey = useCallback(
        (discordId) => {
            const reviewerKey = user?.id || user?.discord_id || 'reviewer';
            return `liquid:portfolio-review-note:${reviewerKey}:${discordId}`;
        },
        [user?.id, user?.discord_id]
    );
    const loadNoteDraft = useCallback(
        (discordId) => {
            if (!discordId) return '';
            try {
                return localStorage.getItem(getNoteStorageKey(discordId)) || '';
            } catch {
                return '';
            }
        },
        [getNoteStorageKey]
    );
    const saveNoteDraft = useCallback(
        (discordId, note) => {
            if (!discordId) return;
            try {
                localStorage.setItem(getNoteStorageKey(discordId), note || '');
            } catch {
            }
        },
        [getNoteStorageKey]
    );
    const clearNoteDraft = useCallback(
        (discordId) => {
            if (!discordId) return;
            try {
                localStorage.removeItem(getNoteStorageKey(discordId));
            } catch {
            }
        },
        [getNoteStorageKey]
    );
    const handleChangeNote = useCallback(
        (nextNote) => {
            setReviewNote(nextNote);
            if (!selectedDiscordId) return;
            if (noteAutosaveTimerRef.current) {
                window.clearTimeout(noteAutosaveTimerRef.current);
            }
            noteAutosaveTimerRef.current = window.setTimeout(() => {
                saveNoteDraft(selectedDiscordId, nextNote);
            }, 450);
        },
        [selectedDiscordId, saveNoteDraft]
    );
    const handleSaveNote = useCallback(
        (discordId, note) => {
            saveNoteDraft(discordId, note);
        },
        [saveNoteDraft]
    );
    const handleClearNote = useCallback(
        (discordId) => {
            clearNoteDraft(discordId);
            if (selectedDiscordId === discordId) setReviewNote('');
        },
        [clearNoteDraft, selectedDiscordId]
    );
    const prefetchTwitterProfiles = useCallback(async (portfolioList) => {
        const rawHandles = portfolioList.map((p) => toHandleKey(p.twitter_handle)).filter(Boolean);
        const uniqueHandles = Array.from(new Set(rawHandles));
        const TWITTER_CACHE_KEY = 'liquid:twitter:profiles:cache';
        const TWITTER_CACHE_DURATION = 30 * 60 * 1000;
        try {
            const cached = localStorage.getItem(TWITTER_CACHE_KEY);
            if (cached) {
                const { data: cachedProfiles, timestamp } = JSON.parse(cached);
                const age = Date.now() - timestamp;
                if (age < TWITTER_CACHE_DURATION) {
                    setTwitterProfiles((prev) => {
                        const next = { ...prev };
                        Object.entries(cachedProfiles).forEach(([username, profile]) => {
                            if (!(username in next)) {
                                next[username] = profile;
                            }
                        });
                        return next;
                    });
                }
            }
        } catch (err) {
        }
        const missingHandles = uniqueHandles.filter((handle) => !(handle in twitterProfilesRef.current));
        if (missingHandles.length === 0) return;
        try {
            const res = await fetch(`${API_BASE}/api/twitter/profiles/batch`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(missingHandles),
            });
            if (!res.ok) {
                console.warn('Failed to fetch Twitter profiles batch');
                return;
            }
            const data = await res.json();
            setTwitterProfiles((prev) => {
                const next = { ...prev };
                data.forEach(({ username, profile }) => {
                    if (profile) {
                        next[username] = profile;
                    }
                });
                try {
                    localStorage.setItem(TWITTER_CACHE_KEY, JSON.stringify({
                        data: next,
                        timestamp: Date.now()
                    }));
                } catch (err) {
                }
                return next;
            });
        } catch (err) {
            console.warn('Error fetching Twitter profiles batch:', err);
        }
    }, []);
    const fetchAllPortfolios = useCallback(
        async ({ silent = false, useCache = true } = {}) => {
            if (!silent) setLoading(true);
            setError('');
            const CACHE_KEY = 'liquid:portfolios:cache';
            const CACHE_DURATION = 5 * 60 * 1000;
            if (useCache) {
                try {
                    const cached = localStorage.getItem(CACHE_KEY);
                    if (cached) {
                        const { data, timestamp } = JSON.parse(cached);
                        const age = Date.now() - timestamp;
                        if (age < CACHE_DURATION) {
                            setAllPortfolios(data);
                            prefetchTwitterProfiles(data);
                            if (!silent) setLoading(false);
                            if (age > 60 * 1000) {
                                fetchAllPortfolios({ silent: true, useCache: false });
                            }
                            return;
                        }
                    }
                } catch (err) {
                }
            }
            const maxRetries = 3;
            let lastError = null;
            for (let attempt = 0; attempt < maxRetries; attempt++) {
                try {
                    const res = await apiFetch(`${API_BASE}/api/portfolio/list/all`);
                    if (!res.ok) {
                        if (res.status === 504 && attempt < maxRetries - 1) {
                            const delay = Math.min(1000 * Math.pow(2, attempt), 5000);
                            await new Promise(resolve => setTimeout(resolve, delay));
                            continue;
                        }
                        throw new Error('Failed to fetch portfolios');
                    }
                    const data = await res.json();
                    const nextPortfolios = Array.isArray(data) ? data : [];
                    setAllPortfolios(nextPortfolios);
                    try {
                        localStorage.setItem(CACHE_KEY, JSON.stringify({
                            data: nextPortfolios,
                            timestamp: Date.now()
                        }));
                    } catch (err) {
                    }
                    prefetchTwitterProfiles(nextPortfolios);
                    if (!silent) setLoading(false);
                    return;
                } catch (err) {
                    lastError = err;
                    if (attempt < maxRetries - 1) {
                        const delay = Math.min(1000 * Math.pow(2, attempt), 5000);
                        await new Promise(resolve => setTimeout(resolve, delay));
                    }
                }
            }
            if (import.meta.env.DEV) console.error('Failed to fetch portfolios after retries:', lastError);
            setError('Failed to load portfolios. Please refresh the page.');
            if (!silent) setLoading(false);
        },
        [prefetchTwitterProfiles]
    );
    useEffect(() => {
        if (!authLoading && isAuthenticated) {
            fetchAllPortfolios();
        } else if (!authLoading && !isAuthenticated) {
            setLoading(false);
        }
    }, [authLoading, isAuthenticated, fetchAllPortfolios]);
    const handleWebSocketUpdate = useCallback((message) => {
        console.log('[Portfolios] WebSocket update:', message);
        const CACHE_KEY = 'liquid:portfolios:cache';
        const TWITTER_CACHE_KEY = 'liquid:twitter:profiles:cache';
        try {
            localStorage.removeItem(CACHE_KEY);
            localStorage.removeItem(TWITTER_CACHE_KEY);
            if (message.discord_id) {
                const STATS_CACHE_KEY = `liquid:twitter:stats:${message.discord_id}`;
                localStorage.removeItem(STATS_CACHE_KEY);
            }
        } catch (err) {
        }
        fetchAllPortfolios({ silent: true, useCache: false });
    }, [fetchAllPortfolios]);
    const { connected: wsConnected } = usePortfolioWebSocket(
        handleWebSocketUpdate,
        isAuthenticated && canReview
    );
    useEffect(() => {
        setPageIndex(0);
    }, [queue, guild, query, pageSize]);
    useEffect(() => {
        if (isWide) {
            setIsPreviewOpen(false);
        }
    }, [isWide]);
    const selectedPortfolio = useMemo(() => {
        if (!selectedDiscordId) return null;
        return allPortfolios.find((p) => p.discord_id === selectedDiscordId) || null;
    }, [allPortfolios, selectedDiscordId]);
    const selectedTwitterProfile = useMemo(() => {
        const handleKey = toHandleKey(selectedPortfolio?.twitter_handle);
        if (!handleKey) return null;
        return twitterProfiles[handleKey] || null;
    }, [selectedPortfolio?.twitter_handle, twitterProfiles]);
    const fetchTweetStats = useCallback(async (discordId) => {
        setLoadingStats(true);
        setTweetStats(null);
        const STATS_CACHE_KEY = `liquid:twitter:stats:${discordId}`;
        const STATS_CACHE_DURATION = 10 * 60 * 1000;
        try {
            const cached = localStorage.getItem(STATS_CACHE_KEY);
            if (cached) {
                const { data, timestamp } = JSON.parse(cached);
                const age = Date.now() - timestamp;
                if (age < STATS_CACHE_DURATION) {
                    setTweetStats(data);
                    setLoadingStats(false);
                    return;
                }
            }
        } catch (err) {
        }
        try {
            const res = await fetch(`${API_BASE}/api/twitter/portfolio/${discordId}/stats`);
            if (res.ok) {
                const data = await res.json();
                setTweetStats(data);
                try {
                    localStorage.setItem(STATS_CACHE_KEY, JSON.stringify({
                        data,
                        timestamp: Date.now()
                    }));
                } catch (err) {
                }
            }
        } catch (err) {
            if (import.meta.env.DEV) console.error('Failed to fetch tweet stats:', err);
        } finally {
            setLoadingStats(false);
        }
    }, []);
    const fetchPortfolioTimeline = useCallback(async (discordId) => {
        setLoadingTimeline(true);
        setPortfolioTimeline([]);
        try {
            const res = await fetch(`${API_BASE}/api/portfolio/${discordId}/timeline`);
            if (res.ok) {
                const data = await res.json();
                setPortfolioTimeline(Array.isArray(data) ? data : []);
            }
        } catch (err) {
            if (import.meta.env.DEV) console.error('Failed to fetch portfolio timeline:', err);
        } finally {
            setLoadingTimeline(false);
        }
    }, []);
    const openPreview = useCallback(
        (portfolio) => {
            if (!portfolio) return;
            if (selectedDiscordIdRef.current) {
                saveNoteDraft(selectedDiscordIdRef.current, reviewNoteRef.current);
            }
            if (noteAutosaveTimerRef.current) {
                window.clearTimeout(noteAutosaveTimerRef.current);
            }
            setSelectedDiscordId(portfolio.discord_id);
            setReviewMessage(null);
            setReviewNote(loadNoteDraft(portfolio.discord_id));
            fetchTweetStats(portfolio.discord_id);
            fetchPortfolioTimeline(portfolio.discord_id);
            if (!isWide) setIsPreviewOpen(true);
        },
        [fetchTweetStats, fetchPortfolioTimeline, isWide, loadNoteDraft, saveNoteDraft]
    );
    const closePreview = useCallback(() => {
        if (selectedDiscordIdRef.current) {
            saveNoteDraft(selectedDiscordIdRef.current, reviewNoteRef.current);
        }
        if (noteAutosaveTimerRef.current) {
            window.clearTimeout(noteAutosaveTimerRef.current);
        }
        setSelectedDiscordId(null);
        setIsPreviewOpen(false);
        setTweetStats(null);
        setPortfolioTimeline([]);
        setReviewMessage(null);
        setReviewNote('');
    }, [saveNoteDraft]);
    const handleReview = useCallback(
        async (action, discordId, feedbackOverride) => {
            if (!discordId) return;
            setReviewing(true);
            setReviewMessage(null);
            const newStatus = action === 'approve' ? 'promoted' : action === 'request_changes' ? 'draft' : 'rejected';
            setAllPortfolios(prev =>
                prev.map(p =>
                    p.discord_id === discordId
                        ? { ...p, status: newStatus }
                        : p
                )
            );
            try {
                const res = await apiFetch(`${API_BASE}/api/portfolio/review`, {
                    method: 'POST',
                    body: JSON.stringify({
                        discord_id: discordId,
                        action,
                        reviewer_id: user?.id || 'Unknown',
                        feedback: typeof feedbackOverride === 'string' ? feedbackOverride : reviewNote || '',
                    }),
                });
                const data = await res.json().catch(() => ({}));
                if (!res.ok || !data?.success) {
                    await fetchAllPortfolios({ silent: true, useCache: false });
                    setReviewMessage({ type: 'error', text: data?.detail || 'Failed to submit review' });
                    return;
                }
                clearNoteDraft(discordId);
                setReviewNote('');
                setReviewMessage({
                    type: 'success',
                    text:
                        action === 'approve'
                            ? 'Portfolio has been APPROVED by reviewer.'
                            : action === 'reject'
                                ? 'Portfolio has been REJECTED and user has been notified'
                                : 'Portfolio has been sent back to user for CHANGES',
                });
                await fetchAllPortfolios({ silent: true, useCache: false });
                window.setTimeout(() => {
                    setReviewMessage(null);
                    if (!isWide) closePreview();
                }, 2200);
            } catch (err) {
                await fetchAllPortfolios({ silent: true, useCache: false });
                if (import.meta.env.DEV) console.error('Failed to submit review:', err);
                setReviewMessage({ type: 'error', text: 'Failed to submit review' });
            } finally {
                setReviewing(false);
            }
        },
        [user?.id, reviewNote, fetchAllPortfolios, isWide, closePreview, clearNoteDraft]
    );
    const handleDeletePortfolio = useCallback(
        async (discordId) => {
            if (!discordId) return;
            setReviewing(true);
            setReviewMessage(null);
            const previousPortfolios = allPortfolios;
            setAllPortfolios(prev => prev.filter(p => p.discord_id !== discordId));
            try {
                const res = await apiFetch(`${API_BASE}/api/portfolio/${discordId}`, {
                    method: 'DELETE',
                });
                const data = await res.json().catch(() => ({}));
                if (!res.ok || !data?.success) {
                    setAllPortfolios(previousPortfolios);
                    setReviewMessage({ type: 'error', text: data?.detail || 'Failed to delete portfolio' });
                    return;
                }
                setReviewMessage({
                    type: 'success',
                    text: 'Portfolio has been DELETED successfully.',
                });
                await fetchAllPortfolios({ silent: true, useCache: false });
                window.setTimeout(() => {
                    setReviewMessage(null);
                    if (!isWide) closePreview();
                }, 2200);
            } catch (err) {
                setAllPortfolios(previousPortfolios);
                if (import.meta.env.DEV) console.error('Failed to delete portfolio:', err);
                setReviewMessage({ type: 'error', text: 'Failed to delete portfolio' });
            } finally {
                setReviewing(false);
            }
        },
        [allPortfolios, fetchAllPortfolios, isWide, closePreview]
    );
    const handleDeleteUser = useCallback(
        async (discordId) => {
            if (!discordId) return;
            setReviewing(true);
            setReviewMessage(null);
            try {
                const res = await apiFetch(`${API_BASE}/api/portfolio/admin/user/${discordId}`, {
                    method: 'DELETE',
                });
                const data = await res.json().catch(() => ({}));
                if (!res.ok || !data?.success) {
                    setReviewMessage({ type: 'error', text: data?.detail || 'Failed to delete user' });
                    return;
                }
                setReviewMessage({
                    type: 'success',
                    text: `User ${discordId} and ALL associated data have been PERMANENTLY DELETED.`,
                });
                await fetchAllPortfolios({ silent: true });
                window.setTimeout(() => {
                    setReviewMessage(null);
                    if (!isWide) closePreview();
                }, 2200);
            } catch (err) {
                if (import.meta.env.DEV) console.error('Failed to delete user:', err);
                setReviewMessage({ type: 'error', text: 'Failed to delete user' });
            } finally {
                setReviewing(false);
            }
        },
        [fetchAllPortfolios, isWide, closePreview]
    );
    const statusCounts = useMemo(() => {
        const counts = { total: 0, submitted: 0, promoted: 0 };
        counts.total = allPortfolios.length;
        allPortfolios.forEach((p) => {
            if (p.status === 'submitted') counts.submitted += 1;
            if (p.status === 'promoted') counts.promoted += 1;
        });
        return counts;
    }, [allPortfolios]);
    const queueFiltered = useMemo(() => {
        if (queue === 'all') return allPortfolios;
        return allPortfolios.filter((p) => p.status === queue);
    }, [allPortfolios, queue]);
    const normalizedQuery = query.trim().toLowerCase();
    const filtered = useMemo(() => {
        return queueFiltered.filter((p) => {
            const guildId = resolveGuildId(p.target_role);
            if (guild !== 'all') {
                if (guild === 'unknown') {
                    if (guildId) return false;
                } else if (guildId !== guild) {
                    return false;
                }
            }
            if (!normalizedQuery) return true;
            const handleKey = toHandleKey(p.twitter_handle);
            const profileName = twitterProfiles[handleKey]?.name || '';
            const haystack = [
                p.username,
                p.discord_id,
                p.twitter_handle,
                p.target_role,
                profileName,
            ]
                .filter(Boolean)
                .join(' ')
                .toLowerCase();
            return haystack.includes(normalizedQuery);
        });
    }, [queueFiltered, guild, normalizedQuery, twitterProfiles]);
    const getDisplayName = useCallback(
        (p) => {
            const handleKey = toHandleKey(p.twitter_handle);
            return twitterProfiles[handleKey]?.name || p.username || p.twitter_handle || 'User';
        },
        [twitterProfiles]
    );
    const sorted = useMemo(() => {
        const copy = [...filtered];
        const compareStrings = (a, b) => `${a || ''}`.localeCompare(`${b || ''}`, undefined, { sensitivity: 'base' });
        const compareNumbers = (a, b) => (a || 0) - (b || 0);
        const direction = sorting.desc ? -1 : 1;
        copy.sort((a, b) => {
            if (sorting.id === 'name') {
                return compareStrings(getDisplayName(a), getDisplayName(b)) * direction;
            }
            if (sorting.id === 'guild') {
                return compareStrings(resolveGuildId(a.target_role) || '', resolveGuildId(b.target_role) || '') * direction;
            }
            if (sorting.id === 'tweets') {
                return compareNumbers(a.tweets?.length || 0, b.tweets?.length || 0) * direction;
            }
            if (sorting.id === 'followers') {
                const aKey = toHandleKey(a.twitter_handle);
                const bKey = toHandleKey(b.twitter_handle);
                const aFollowers = twitterProfiles[aKey]?.followers ?? -1;
                const bFollowers = twitterProfiles[bKey]?.followers ?? -1;
                return compareNumbers(aFollowers, bFollowers) * direction;
            }
            if (sorting.id === 'status') {
                return compareStrings(a.status || '', b.status || '') * direction;
            }
            const aDate = new Date(a.submitted_at || a.created_at || 0).getTime() || 0;
            const bDate = new Date(b.submitted_at || b.created_at || 0).getTime() || 0;
            return compareNumbers(aDate, bDate) * direction;
        });
        return copy;
    }, [filtered, sorting, getDisplayName, twitterProfiles]);
    const totalRows = sorted.length;
    const pageCount = Math.max(1, Math.ceil(totalRows / pageSize));
    const safePageIndex = Math.min(pageIndex, pageCount - 1);
    const pageStart = safePageIndex * pageSize;
    const pageEnd = Math.min(totalRows, pageStart + pageSize);
    const pagedRows = sorted.slice(pageStart, pageEnd);
    const setSortBy = (id) => {
        setSorting((prev) => {
            if (prev.id === id) return { ...prev, desc: !prev.desc };
            return { id, desc: id === 'submitted_at' };
        });
    };
    const columns = useMemo(
        () => [
            {
                id: 'creator',
                header: 'Creator',
                sortId: 'name',
                className: '',
                cell: (p) => {
                    const handleKey = toHandleKey(p.twitter_handle);
                    const profile = twitterProfiles[handleKey] || null;
                    const guildId = resolveGuildId(p.target_role);
                    const avatarSrc = p.avatar_url || '';
                    const name = profile?.name || p.username || p.twitter_handle || 'User';
                    return (
                        <div className="pr-usercell">
                            <Avatar src={avatarSrc} label={name} />
                            <div className="pr-user-meta">
                                <div className="pr-user-name">{name}</div>
                                <div className="pr-user-sub">
                                    {guildId ? (
                                        <GuildLabel guildId={guildId} />
                                    ) : (
                                        <span className="pr-dim">Unknown guild</span>
                                    )}
                                </div>
                            </div>
                        </div>
                    );
                },
            },
            {
                id: 'tweets',
                header: 'Tweets',
                sortId: 'tweets',
                className: 'pr-td-num pr-td-center',
                cell: (p) => <span style={{ fontVariantNumeric: 'tabular-nums' }}>{p.tweets?.length || 0}</span>,
            },
            {
                id: 'messages',
                header: 'Messages',
                sortId: null,
                className: 'pr-td-num pr-td-center',
                cell: (p) => <span style={{ fontVariantNumeric: 'tabular-nums' }}>{formatCompactNumber(p.message_count)}</span>,
            },
            {
                id: 'roles',
                header: 'Roles',
                sortId: null,
                className: 'pr-td-num pr-td-center',
                cell: (p) => <span style={{ fontVariantNumeric: 'tabular-nums', fontSize: '13px' }}>{p.role_progression || 'Droplet'}</span>,
            },
            {
                id: 'followers',
                header: 'Followers',
                sortId: 'followers',
                className: 'pr-td-num pr-td-center pr-hide-sm',
                cell: (p) => {
                    const handleKey = toHandleKey(p.twitter_handle);
                    return <span style={{ fontVariantNumeric: 'tabular-nums' }}>{formatCompactNumber(twitterProfiles[handleKey]?.followers)}</span>;
                },
            },
            {
                id: 'submitted',
                header: 'Submitted',
                sortId: 'submitted_at',
                className: 'pr-hide-md',
                cell: (p) => (
                    <span style={{ fontVariantNumeric: 'tabular-nums', color: 'var(--color-text-secondary)' }}>
                        {formatDisplayDate(p.submitted_at || p.created_at)}
                    </span>
                ),
            },
            {
                id: 'status',
                header: 'Status',
                sortId: 'status',
                className: '',
                cell: (p) => <StatusBadge status={p.status} />,
            },
            {
                id: 'actions',
                header: '',
                sortId: null,
                className: 'pr-td-actions',
                cell: (p) => (
                    <div
                        className={`pr-row-actions ${canReview && p.status === 'submitted' ? 'is-always-on' : ''}`}
                        onClick={(e) => e.stopPropagation()}
                    >
                        <button
                            className="pr-action-btn"
                            type="button"
                            onClick={() => openPreview(p)}
                            title="Preview"
                        >
                            <Eye size={16} />
                        </button>
                        <a
                            className="pr-action-btn"
                            href={`/portfolios/${p.discord_id}`}
                            target="_blank"
                            rel="noreferrer"
                            title="Open portfolio page"
                        >
                            <ExternalLink size={16} />
                        </a>
                        {canReview && p.status === 'submitted' && (
                            <>
                                <button
                                    className="pr-action-btn pr-action-approve"
                                    type="button"
                                    disabled={reviewing}
                                    onClick={() => handleReview('approve', p.discord_id, '')}
                                    title="Approve"
                                >
                                    <Check size={16} />
                                </button>
                                <button
                                    className="pr-action-btn pr-action-request"
                                    type="button"
                                    disabled={reviewing}
                                    onClick={() => handleReview('request_changes', p.discord_id, '')}
                                    title="Request Changes"
                                >
                                    <AlertCircle size={16} />
                                </button>
                                <button
                                    className="pr-action-btn pr-action-reject"
                                    type="button"
                                    disabled={reviewing}
                                    onClick={() => {
                                        setRejectDiscordId(p.discord_id);
                                        setRejectReason('');
                                        setIsRejectModalOpen(true);
                                    }}
                                    title="Reject"
                                >
                                    <X size={16} />
                                </button>
                            </>
                        )}
                    </div>
                ),
            },
        ],
        [twitterProfiles, openPreview, canReview, reviewing, handleReview]
    );
    if (loading || authLoading) {
        return (
            <main className="pr-page">
                <div className="pr-shell" style={{ display: 'flex', justifyContent: 'center', padding: '72px 0' }}>
                    <div style={{ textAlign: 'center' }}>
                        <div className="pr-spinner" aria-hidden="true" />
                        <p className="pr-dim" style={{ margin: 0, marginTop: 12 }}>
                            Loading portfolios...
                        </p>
                    </div>
                </div>
            </main>
        );
    }
    if (!isAuthenticated) {
        return (
            <main className="pr-page">
                <div className="pr-shell">
                    <div className="pr-auth">
                        <div className="pr-auth-icon" aria-hidden="true">
                            <FileText size={28} />
                        </div>
                        <h1 className="pr-title" style={{ textAlign: 'center' }}>
                            Portfolio Review
                        </h1>
                        <p className="pr-subtitle" style={{ textAlign: 'center', marginInline: 'auto' }}>
                            Sign in to review portfolios.
                        </p>
                        <button className="pr-btn pr-btn--primary" type="button" onClick={login}>
                            Sign in with Discord
                        </button>
                    </div>
                </div>
            </main>
        );
    }
    return (
        <main className="pr-page">
            <div className="pr-shell">
                <header className="pr-header">
                    <div>
                        <div className="pr-title-row">
                            <span className="pr-title-icon" aria-hidden="true">
                                <FileText size={28} />
                            </span>
                            <h1 className="pr-title">Portfolio Review</h1>
                        </div>
                        <p className="pr-subtitle">Review submitted portfolios and decide their final status</p>
                    </div>
                    <div className="pr-kpis" aria-label="Portfolio counts">
                        <span className="pr-kpi">
                            <strong>{statusCounts.total}</strong> total
                        </span>
                        <span className="pr-kpi">
                            <strong>{statusCounts.submitted}</strong> pending
                        </span>
                        <span className="pr-kpi">
                            <strong>{statusCounts.promoted}</strong> approved
                        </span>
                    </div>
                </header>
                <section className="pr-toolbar" aria-label="Filters and controls">
                    <div className="pr-toolbar-row">
                        <div className="pr-toolbar-left">
                            <div className="pr-search" role="search">
                                <Search size={18} />
                                <input
                                    type="search"
                                    value={query}
                                    onChange={(e) => setQuery(e.target.value)}
                                    placeholder="Search name, @handle, Discord ID..."
                                    aria-label="Search portfolios"
                                />
                                {query ? (
                                    <button className="pr-icon-btn" type="button" onClick={() => setQuery('')} title="Clear search">
                                        <X size={16} />
                                    </button>
                                ) : null}
                            </div>
                            <div className="pr-select" title="Queue">
                                <select value={queue} onChange={(e) => setQueue(e.target.value)} aria-label="Status queue">
                                    <option value="submitted">Pending Review</option>
                                    <option value="pending_vote">Finalizing</option>
                                    <option value="all">All</option>
                                </select>
                                <ChevronDown size={16} aria-hidden="true" />
                            </div>
                            <div className="pr-select" title="Guild">
                                <select value={guild} onChange={(e) => setGuild(e.target.value)} aria-label="Guild filter">
                                    <option value="all">All guilds</option>
                                    {GUILDS.map((g) => (
                                        <option key={g.id} value={g.id}>
                                            {g.name}
                                        </option>
                                    ))}
                                    <option value="unknown">Unknown</option>
                                </select>
                                <ChevronDown size={16} aria-hidden="true" />
                            </div>
                        </div>
                        <div className="pr-toolbar-right">
                            <button
                                className={`pr-icon-btn ${view === 'table' ? 'is-on' : ''}`}
                                type="button"
                                onClick={() => setView('table')}
                                title="Table view"
                            >
                                <Table size={16} />
                            </button>
                            <button
                                className={`pr-icon-btn ${view === 'grid' ? 'is-on' : ''}`}
                                type="button"
                                onClick={() => setView('grid')}
                                title="Grid view"
                            >
                                <LayoutGrid size={16} />
                            </button>
                            <button
                                className="pr-icon-btn"
                                type="button"
                                onClick={() => fetchAllPortfolios({ useCache: false })}
                                title="Refresh (bypass cache)"
                            >
                                <RefreshCw size={16} />
                            </button>
                        </div>
                    </div>
                    <div className="pr-toolbar-sub">
                        <span className="pr-dim">
                            Showing <strong style={{ color: 'var(--color-text)' }}>{totalRows}</strong> results
                        </span>
                        <span className="pr-dim">
                            Sorted by <strong style={{ color: 'var(--color-text)' }}>{sorting.id.replace('_', ' ')}</strong>{' '}
                            <strong style={{ color: 'var(--color-text)' }}>{sorting.desc ? 'в†“' : 'в†‘'}</strong>
                        </span>
                    </div>
                </section>
                {error ? (
                    <div className="pr-alert pr-alert--error" role="status">
                        {error}
                    </div>
                ) : null}
                {reviewMessage ? (
                    <div className={`pr-alert ${reviewMessage.type === 'success' ? 'pr-alert--success' : 'pr-alert--error'}`} role="status">
                        {reviewMessage.text}
                    </div>
                ) : null}
                <div className="pr-layout">
                    <section className="pr-surface pr-list-surface" aria-label="Portfolio list">
                        <div className="pr-list-body">
                            {totalRows === 0 ? (
                                <div className="pr-empty">
                                    <FileText size={44} style={{ color: 'var(--color-text-secondary)' }} />
                                    <p className="pr-dim" style={{ margin: 0 }}>
                                        No portfolios found.
                                    </p>
                                </div>
                            ) : view === 'grid' ? (
                                <div className="pr-grid">
                                    {pagedRows.map((p) => {
                                        const handleKey = toHandleKey(p.twitter_handle);
                                        const profile = twitterProfiles[handleKey] || null;
                                        const avatarSrc =
                                            profile?.profile_picture?.replace('_normal', '_400x400') || p.avatar_url || '';
                                        const name = profile?.name || p.username || p.twitter_handle || 'User';
                                        const guildId = resolveGuildId(p.target_role);
                                        const xHandle = normalizeTwitterHandle(p.twitter_handle);
                                        return (
                                            <article
                                                key={p.id}
                                                className="pr-card"
                                                role="button"
                                                tabIndex={0}
                                                aria-label={`Open preview for ${name}`}
                                                onClick={() => openPreview(p)}
                                                onKeyDown={(e) => {
                                                    if (e.key === 'Enter' || e.key === ' ') openPreview(p);
                                                }}
                                            >
                                                <div className="pr-card-top">
                                                    <div className="pr-card-user">
                                                        <Avatar src={avatarSrc} label={name} />
                                                        <div className="pr-card-user-meta">
                                                            <div className="pr-card-name">{name}</div>
                                                            <div className="pr-card-sub">
                                                                {xHandle ? <span className="pr-handle">@{xHandle}</span> : <span className="pr-dim">No handle</span>}
                                                            </div>
                                                        </div>
                                                    </div>
                                                    <StatusBadge status={p.status} />
                                                </div>
                                                <div className="pr-card-mid">
                                                    {guildId ? <GuildLabel guildId={guildId} /> : <span className="pr-dim">Unknown guild</span>}
                                                    <span className="pr-dim">{p.tweets?.length || 0} tweets</span>
                                                    <span className="pr-dim">{formatDisplayDate(p.submitted_at || p.created_at)}</span>
                                                </div>
                                                <div className="pr-card-actions" onClick={(e) => e.stopPropagation()}>
                                                    <button className="pr-action-btn" type="button" onClick={() => openPreview(p)} title="Preview">
                                                        <Eye size={16} />
                                                    </button>
                                                    <a
                                                        className="pr-action-btn"
                                                        href={`/portfolios/${p.discord_id}`}
                                                        target="_blank"
                                                        rel="noreferrer"
                                                        title="Open portfolio page"
                                                    >
                                                        <ExternalLink size={16} />
                                                    </a>
                                                    {canReview && p.status === 'submitted' ? (
                                                        <>
                                                            <button
                                                                className="pr-action-btn pr-action-approve"
                                                                type="button"
                                                                disabled={reviewing}
                                                                onClick={() => handleReview('approve', p.discord_id, '')}
                                                                title="Approve"
                                                            >
                                                                <Check size={16} />
                                                            </button>
                                                            <button
                                                                className="pr-action-btn pr-action-request"
                                                                type="button"
                                                                disabled={reviewing}
                                                                onClick={() => handleReview('request_changes', p.discord_id, '')}
                                                                title="Request Changes"
                                                            >
                                                                <AlertCircle size={16} />
                                                            </button>
                                                            <button
                                                                className="pr-action-btn pr-action-reject"
                                                                type="button"
                                                                disabled={reviewing}
                                                                onClick={() => {
                                                                    setRejectDiscordId(p.discord_id);
                                                                    setRejectReason('');
                                                                    setIsRejectModalOpen(true);
                                                                }}
                                                                title="Reject"
                                                            >
                                                                <X size={16} />
                                                            </button>
                                                        </>
                                                    ) : null}
                                                </div>
                                            </article>
                                        );
                                    })}
                                </div>
                            ) : (
                                <div className="pr-table-wrap">
                                    <table className="pr-table">
                                        <thead>
                                            <tr>
                                                {columns.map((col) => (
                                                    <th key={col.id} className={col.className}>
                                                        {col.sortId ? (
                                                            <button
                                                                type="button"
                                                                onClick={() => setSortBy(col.sortId)}
                                                                aria-label={`Sort by ${col.header}`}
                                                            >
                                                                {col.header}
                                                                <span className="pr-sort-indicator" aria-hidden="true">
                                                                    {sorting.id === col.sortId ? (sorting.desc ? 'в†“' : 'в†‘') : ''}
                                                                </span>
                                                            </button>
                                                        ) : (
                                                            col.header
                                                        )}
                                                    </th>
                                                ))}
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {pagedRows.map((p) => (
                                                <tr
                                                    key={p.id}
                                                    className="pr-row"
                                                    tabIndex={0}
                                                    aria-selected={selectedDiscordId === p.discord_id ? 'true' : 'false'}
                                                    onClick={() => openPreview(p)}
                                                    onKeyDown={(e) => {
                                                        if (e.key === 'Enter' || e.key === ' ') openPreview(p);
                                                    }}
                                                >
                                                    {columns.map((col) => (
                                                        <td key={col.id} className={col.className}>
                                                            {col.cell(p)}
                                                        </td>
                                                    ))}
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            )}
                        </div>
                        <div className="pr-pagination" aria-label="Pagination">
                            <div className="pr-page-info">
                                <strong>{totalRows === 0 ? 0 : pageStart + 1}</strong>вЂ“<strong>{pageEnd}</strong> of <strong>{totalRows}</strong>
                            </div>
                            <div className="pr-page-controls">
                                <div className="pr-select pr-select--compact" title="Rows per page">
                                    <select value={pageSize} onChange={(e) => setPageSize(Number(e.target.value))} aria-label="Rows per page">
                                        {[25, 50, 100].map((size) => (
                                            <option key={size} value={size}>
                                                {size}/page
                                            </option>
                                        ))}
                                    </select>
                                    <ChevronDown size={16} aria-hidden="true" />
                                </div>
                                <button
                                    className="pr-page-btn"
                                    type="button"
                                    disabled={safePageIndex === 0}
                                    onClick={() => setPageIndex((v) => Math.max(0, v - 1))}
                                >
                                    Prev
                                </button>
                                <button
                                    className="pr-page-btn"
                                    type="button"
                                    disabled={safePageIndex >= pageCount - 1}
                                    onClick={() => setPageIndex((v) => Math.min(pageCount - 1, v + 1))}
                                >
                                    Next
                                </button>
                            </div>
                        </div>
                    </section>
                    {isWide ? (
                        <aside className="pr-surface pr-preview-surface" aria-label="Portfolio preview">
                            <PortfolioReviewPreview
                                key={selectedPortfolio?.discord_id || 'empty'}
                                portfolio={selectedPortfolio}
                                twitterProfile={selectedTwitterProfile}
                                tweetStats={tweetStats}
                                loadingStats={loadingStats}
                                portfolioTimeline={portfolioTimeline}
                                loadingTimeline={loadingTimeline}
                                canReview={canReview}
                                reviewing={reviewing}
                                reviewNote={reviewNote}
                                onChangeNote={handleChangeNote}
                                onSaveNote={handleSaveNote}
                                onClearNote={handleClearNote}
                                closeVariant="hide"
                                onClose={closePreview}
                                onReview={handleReview}
                                onDeletePortfolio={(discordId) => {
                                    setDeletePortfolioDiscordId(discordId);
                                    setIsDeletePortfolioModalOpen(true);
                                }}
                                onDeleteUser={(discordId) => {
                                    setDeleteUserDiscordId(discordId);
                                    setIsDeleteUserModalOpen(true);
                                }}
                                onOpenRejectModal={(discordId, note) => {
                                    setRejectDiscordId(discordId);
                                    setRejectReason(note || '');
                                    setIsRejectModalOpen(true);
                                }}
                            />
                        </aside>
                    ) : null}
                </div>
                {!isWide && isPreviewOpen && selectedPortfolio ? (
                    <div className="pr-modal" role="dialog" aria-modal="true" onClick={closePreview}>
                        <div className="pr-modal-panel pr-surface" onClick={(e) => e.stopPropagation()}>
                            <PortfolioReviewPreview
                                key={selectedPortfolio?.discord_id || 'modal'}
                                portfolio={selectedPortfolio}
                                twitterProfile={selectedTwitterProfile}
                                tweetStats={tweetStats}
                                loadingStats={loadingStats}
                                portfolioTimeline={portfolioTimeline}
                                loadingTimeline={loadingTimeline}
                                canReview={canReview}
                                reviewing={reviewing}
                                reviewNote={reviewNote}
                                onChangeNote={handleChangeNote}
                                onSaveNote={handleSaveNote}
                                onClearNote={handleClearNote}
                                closeVariant="close"
                                onClose={closePreview}
                                onReview={handleReview}
                                onDeletePortfolio={(discordId) => {
                                    setDeletePortfolioDiscordId(discordId);
                                    setIsDeletePortfolioModalOpen(true);
                                }}
                                onDeleteUser={(discordId) => {
                                    setDeleteUserDiscordId(discordId);
                                    setIsDeleteUserModalOpen(true);
                                }}
                                onOpenRejectModal={(discordId, note) => {
                                    setRejectDiscordId(discordId);
                                    setRejectReason(note || '');
                                    setIsRejectModalOpen(true);
                                }}
                            />
                        </div>
                    </div>
                ) : null}
            </div>
            {isRejectModalOpen && (
                <div className="pr-modal-overlay" onClick={() => setIsRejectModalOpen(false)}>
                    <div className="pr-reject-modal" onClick={(e) => e.stopPropagation()}>
                        <div className="pr-modal-header">
                            <h2 className="pr-modal-title">reject portfolio</h2>
                            <button
                                className="pr-modal-close"
                                onClick={() => setIsRejectModalOpen(false)}
                                aria-label="Close"
                            >
                                <X size={20} />
                            </button>
                        </div>
                        <div className="pr-modal-body">
                            <p style={{ marginBottom: '16px', color: 'var(--color-text-secondary)', fontSize: '14px' }}>
                                provide a reason for rejection. this will be sent to the user via DM.
                            </p>
                            <textarea
                                className="pr-textarea"
                                value={rejectReason}
                                onChange={(e) => setRejectReason(e.target.value)}
                                placeholder="explain why the portfolio is being rejected..."
                                rows={4}
                                autoFocus
                                style={{ width: '100%', marginBottom: '16px' }}
                            />
                            {!rejectReason.trim() && (
                                <p style={{ color: 'var(--color-danger)', fontSize: '13px', marginBottom: '16px' }}>
                                    reason is required
                                </p>
                            )}
                        </div>
                        <div className="pr-modal-footer">
                            <button
                                className="pr-btn pr-btn--muted"
                                onClick={() => setIsRejectModalOpen(false)}
                                disabled={reviewing}
                            >
                                cancel
                            </button>
                            <button
                                className="pr-btn pr-btn--danger"
                                onClick={() => {
                                    if (!rejectReason.trim()) return;
                                    setIsRejectModalOpen(false);
                                    handleReview('reject', rejectDiscordId, rejectReason);
                                }}
                                disabled={reviewing || !rejectReason.trim()}
                            >
                                <X size={16} />
                                reject portfolio
                            </button>
                        </div>
                    </div>
                </div>
            )}
            {isDeletePortfolioModalOpen && (
                <div className="pr-modal-overlay" onClick={() => setIsDeletePortfolioModalOpen(false)}>
                    <div className="pr-reject-modal" onClick={(e) => e.stopPropagation()}>
                        <div className="pr-modal-header">
                            <h2 className="pr-modal-title">вљ пёЏ delete portfolio</h2>
                            <button
                                className="pr-modal-close"
                                onClick={() => setIsDeletePortfolioModalOpen(false)}
                                aria-label="Close"
                            >
                                <X size={20} />
                            </button>
                        </div>
                        <div className="pr-modal-body">
                            <p style={{ marginBottom: '16px', color: 'var(--color-danger)', fontSize: '14px', fontWeight: 600 }}>
                                Are you sure you want to DELETE this portfolio?
                            </p>
                            <p style={{ marginBottom: '16px', color: 'var(--color-text-secondary)', fontSize: '14px' }}>
                                This action cannot be undone.
                            </p>
                        </div>
                        <div className="pr-modal-footer">
                            <button
                                className="pr-btn pr-btn--muted"
                                onClick={() => setIsDeletePortfolioModalOpen(false)}
                                disabled={reviewing}
                            >
                                cancel
                            </button>
                            <button
                                className="pr-btn pr-btn--danger"
                                onClick={() => {
                                    setIsDeletePortfolioModalOpen(false);
                                    handleDeletePortfolio(deletePortfolioDiscordId);
                                }}
                                disabled={reviewing}
                            >
                                <X size={16} />
                                delete portfolio
                            </button>
                        </div>
                    </div>
                </div>
            )}
            {isDeleteUserModalOpen && (
                <div className="pr-modal-overlay" onClick={() => setIsDeleteUserModalOpen(false)}>
                    <div className="pr-reject-modal" onClick={(e) => e.stopPropagation()}>
                        <div className="pr-modal-header">
                            <h2 className="pr-modal-title">вљ пёЏ delete user permanently</h2>
                            <button
                                className="pr-modal-close"
                                onClick={() => setIsDeleteUserModalOpen(false)}
                                aria-label="Close"
                            >
                                <X size={20} />
                            </button>
                        </div>
                        <div className="pr-modal-body">
                            <p style={{ marginBottom: '16px', color: 'var(--color-danger)', fontSize: '14px', fontWeight: 600 }}>
                                WARNING: This will DELETE ALL data for this user including portfolios, history, and guild membership.
                            </p>
                            <p style={{ marginBottom: '16px', color: 'var(--color-text-secondary)', fontSize: '14px' }}>
                                This action CANNOT be undone!
                            </p>
                        </div>
                        <div className="pr-modal-footer">
                            <button
                                className="pr-btn pr-btn--muted"
                                onClick={() => setIsDeleteUserModalOpen(false)}
                                disabled={reviewing}
                            >
                                cancel
                            </button>
                            <button
                                className="pr-btn pr-btn--danger"
                                onClick={() => {
                                    setIsDeleteUserModalOpen(false);
                                    handleDeleteUser(deleteUserDiscordId);
                                }}
                                disabled={reviewing}
                            >
                                <X size={16} />
                                delete user permanently
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </main>
    );
}
