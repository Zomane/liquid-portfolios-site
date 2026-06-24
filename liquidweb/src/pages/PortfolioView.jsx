import React, { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import {
    AlertCircle,
    ArrowLeft,
    BarChart3,
    Calendar,
    Check,
    CheckCircle2,
    Circle,
    ExternalLink,
    Eye,
    Heart,
    MessageSquare,
    Repeat2,
    Share2,
    Users,
    X,
} from 'lucide-react';
import { GUILDS } from '../components/GuildSelect';
import { TweetCard } from '../components/TweetEmbed';
import { useAuth } from '../contexts/AuthContext';
const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:8000';
const STATUS_CONFIG = {
    draft: {
        label: 'Draft',
        color: '#94a3b8',
        bg: 'rgba(148, 163, 184, 0.16)',
        border: 'rgba(148, 163, 184, 0.45)',
    },
    submitted: {
        label: 'Submitted',
        color: '#60a5fa',
        bg: 'rgba(96, 165, 250, 0.16)',
        border: 'rgba(96, 165, 250, 0.45)',
    },
    pending_vote: {
        label: 'Finalizing',
        color: '#facc15',
        bg: 'rgba(250, 204, 21, 0.16)',
        border: 'rgba(250, 204, 21, 0.45)',
    },
    approved: {
        label: 'Approved',
        color: '#4ade80',
        bg: 'rgba(74, 222, 128, 0.16)',
        border: 'rgba(74, 222, 128, 0.45)',
    },
    rejected: {
        label: 'Rejected',
        color: '#f87171',
        bg: 'rgba(248, 113, 113, 0.16)',
        border: 'rgba(248, 113, 113, 0.45)',
    },
    promoted: {
        label: 'Promoted',
        color: '#a78bfa',
        bg: 'rgba(167, 139, 250, 0.16)',
        border: 'rgba(167, 139, 250, 0.45)',
    },
};
const XLogo = ({ size = 18 }) => (
    <img
        src="/Xlogo.png"
        alt="X"
        style={{ width: size, height: size, objectFit: 'contain' }}
    />
);
const StatusBadge = ({ status }) => {
    const config = STATUS_CONFIG[status] || STATUS_CONFIG.draft;
    return (
        <span
            className="pv-status-badge"
            style={{
                '--pv-status-color': config.color,
                '--pv-status-bg': config.bg,
                '--pv-status-border': config.border,
            }}
        >
            <span className="pv-status-dot" aria-hidden="true" />
            {config.label}
        </span>
    );
};
const MetricCard = ({ icon, label, value, tone = 'neutral' }) => (
    <article className={`pv-metric pv-metric--${tone}`}>
        <div className="pv-metric-top">
            <div className="pv-metric-icon" aria-hidden="true">
                {icon}
            </div>
            <span className="pv-metric-label">{label}</span>
        </div>
        <span className="pv-metric-value">{value}</span>
    </article>
);
const normalizeTwitterHandle = (handle = '') => `${handle}`.trim().replace(/^@+/, '');
const normalizeOtherWorks = (rawValue) => {
    let parsed = rawValue;
    if (!parsed) return [];
    if (typeof parsed === 'string') {
        try {
            parsed = JSON.parse(parsed);
        } catch {
            parsed = parsed.trim() ? [parsed] : [];
        }
    }
    if (!Array.isArray(parsed)) return [];
    return parsed
        .map((item) => {
            if (typeof item === 'string') {
                return {
                    title: 'Work link',
                    url: item.trim(),
                    description: '',
                };
            }
            if (item && typeof item === 'object') {
                return {
                    title: `${item.title || 'Work link'}`.trim() || 'Work link',
                    url: `${item.url || ''}`.trim(),
                    description: `${item.description || ''}`.trim(),
                };
            }
            return null;
        })
        .filter((item) => item && item.url);
};
const getLinkSummary = (rawLink) => {
    const trimmed = `${rawLink || ''}`.trim();
    if (!trimmed) {
        return { host: 'Link', path: '', label: '' };
    }
    try {
        const url = new URL(trimmed);
        const host = url.host.replace(/^www\./, '') || 'Link';
        const path = url.pathname && url.pathname !== '/' ? url.pathname : '';
        return { host, path, label: trimmed };
    } catch (err) {
        return { host: 'Link', path: '', label: trimmed };
    }
};
function formatContentHighlightsAsLinks(text) {
    if (!text) return null;
    const urlRegex = /https?:\/\/[^\s]+/g;
    const urls = text.match(urlRegex);
    if (!urls || urls.length === 0) {
        return <p className="pv-section-copy">{text}</p>;
    }
    return (
        <div className="pv-link-grid">
            {urls.map((url, index) => {
                const meta = getLinkSummary(url);
                return (
                    <a
                        key={`${url}-${index}`}
                        href={url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="pv-proof-link"
                    >
                        <ExternalLink size={14} />
                        <span className="pv-proof-link-main">{meta.host}</span>
                        <span className="pv-proof-link-path">{meta.path || 'Link'}</span>
                    </a>
                );
            })}
        </div>
    );
}
const upscaleTwitterImage = (url = '') => {
    if (!url) return '';
    let normalized = `${url}`.trim();
    normalized = normalized.replace(/_normal(?=\.[a-zA-Z0-9]+(?:\?|$))/, '_400x400');
    normalized = normalized.replace(/([?&])name=normal\b/, '$1name=400x400');
    normalized = normalized.replace(/([?&])name=200x200\b/, '$1name=400x400');
    return normalized;
};
const buildInitials = (value = 'User') => {
    const cleaned = `${value}`.trim();
    if (!cleaned) return 'U';
    return cleaned.charAt(0).toUpperCase();
};
const formatDisplayDate = (dateValue) => {
    if (!dateValue) return 'Unknown';
    const parsedDate = new Date(dateValue);
    if (Number.isNaN(parsedDate.getTime())) return 'Unknown';
    return parsedDate.toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
    });
};
const toOptionalNumber = (value) => {
    if (value === null || value === undefined || value === '') return null;
    const normalizedValue = Number(value);
    return Number.isFinite(normalizedValue) ? normalizedValue : null;
};
const formatCompactNumber = (value) => {
    const normalizedValue = toOptionalNumber(value);
    if (normalizedValue === null) return '—';
    return new Intl.NumberFormat('en-US', {
        notation: 'compact',
        compactDisplay: 'short',
        maximumFractionDigits: 1,
    }).format(normalizedValue);
};
const extractTweetAuthorAvatar = (tweets = []) => {
    if (!Array.isArray(tweets) || tweets.length === 0) return '';
    for (const tweet of tweets) {
        const candidate =
            tweet?.author_profile_picture ||
            tweet?.authorProfilePicture ||
            tweet?.profile_picture ||
            tweet?.profilePicture ||
            tweet?.author_avatar ||
            tweet?.authorAvatar ||
            '';
        if (`${candidate}`.trim()) {
            return `${candidate}`.trim();
        }
    }
    return '';
};
function getTimelineActionLabel(entry) {
    if (entry?.action === 'create') return 'Created';
    if (entry?.action === 'submit') return 'Submitted for Review';
    if (entry?.action === 'reverted_to_draft') return 'Reverted to Draft';
    if (entry?.action === 'approve') return 'Approved by Reviewer';
    if (entry?.action === 'reject') return 'Rejected by Reviewer';
    if (entry?.action === 'request_changes') return 'Changes Requested';
    if (entry?.action === 'promoted') return 'Promotion Approved';
    if (entry?.action === 'promotion_rejected') return 'Promotion Rejected';
    return 'Updated';
}
function parseReviewFeedback(text) {
    if (!text || typeof text !== 'string') return null;
    const approvedBlock = text.match(/- \*\*approved\*\*\n([\s\S]*?)(?=\n- \*\*rejected\*\*|$)/);
    const rejectedBlock = text.match(/- \*\*rejected\*\*\n([\s\S]*?)$/);
    const extractLines = (match) => {
        if (!match) return [];
        const lines = match[1].trim().split('\n');
        const items = [];
        let currentItem = '';
        for (const line of lines) {
            const isBullet = /^\s*-\s/.test(line);
            const isIndented = /^\s+/.test(line) && !isBullet;
            if (isBullet) {
                if (currentItem) items.push(currentItem);
                currentItem = line.replace(/^\s*-\s*/, '').trim();
            } else if (isIndented && currentItem) {
                currentItem += '\n' + line.trim();
            }
        }
        if (currentItem) items.push(currentItem);
        return items.filter((entry) => entry && entry !== 'none');
    };
    const approved = extractLines(approvedBlock);
    const rejected = extractLines(rejectedBlock);
    if (!approved.length && !rejected.length) return null;
    return { approved, rejected };
}
function getTimelineSubsection(entry) {
    if (entry?.action === 'promoted') {
        const promotedRole = `${entry?.notes || ''}`.replace(/^Promoted role:\s*/i, '').trim();
        return {
            title: 'Promoted Role',
            content: promotedRole || entry?.target_role || 'Promotion approved',
        };
    }
    if (entry?.action === 'promotion_rejected') {
        const notes = entry?.notes || '';
        const parsed = parseReviewFeedback(notes);
        return {
            title: 'Reviewer Feedback',
            parsed,
            content: notes || 'No feedback provided.',
        };
    }
    return null;
}
function formatTimelineDate(dateValue) {
    if (!dateValue) return 'Unknown';
    const parsedDate = new Date(dateValue);
    if (Number.isNaN(parsedDate.getTime())) return 'Unknown';
    return parsedDate.toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
    });
}
const resolveGuildId = (targetRole = '') => {
    const normalized = `${targetRole}`.trim().toLowerCase();
    if (!normalized) return null;
    const byId = GUILDS.find((guild) => guild.id === normalized);
    if (byId) return byId.id;
    const byName = GUILDS.find((guild) => {
        const fullName = guild.name.toLowerCase();
        const shortName = fullName.replace(/\s+guild$/, '').trim();
        return normalized === fullName || normalized === shortName;
    });
    if (byName) return byName.id;
    if (normalized.includes('artist') || normalized.includes('designer')) return 'designers';
    if (normalized.includes('educator') || normalized.includes('trendmaker')) return 'content';
    if (normalized.includes('creator') || normalized.includes('content')) return 'content';
    if (normalized.includes('trader') || normalized.includes('trade')) return 'traders';
    return null;
};
const PortfolioView = () => {
    const { userId } = useParams();
    const { user: authUser } = useAuth();
    const [portfolio, setPortfolio] = useState(null);
    const [portfolioTimeline, setPortfolioTimeline] = useState([]);
    const [loadingTimeline, setLoadingTimeline] = useState(false);
    const [twitterProfile, setTwitterProfile] = useState(null);
    const [tweetStats, setTweetStats] = useState(null);
    const [discordStats, setDiscordStats] = useState(null);
    const [dashboardUser, setDashboardUser] = useState(null);
    const [avatarSourceIndex, setAvatarSourceIndex] = useState(0);
    const [bannerFailed, setBannerFailed] = useState(false);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [linkCopied, setLinkCopied] = useState(false);
    const [isInsightsOpen, setIsInsightsOpen] = useState(false);
    const copyPortfolioLink = async () => {
        try {
            await navigator.clipboard.writeText(window.location.href);
            setLinkCopied(true);
            setTimeout(() => setLinkCopied(false), 2000);
        } catch (copyError) {
            console.error('Failed to copy portfolio URL:', copyError);
        }
    };
    useEffect(() => {
        const fetchPortfolio = async () => {
            if (!userId) {
                setError('Portfolio not found');
                setLoading(false);
                return;
            }
            setLoading(true);
            setError('');
            setPortfolio(null);
            setPortfolioTimeline([]);
            setTwitterProfile(null);
            setTweetStats(null);
            setDiscordStats(null);
            setDashboardUser(null);
            setAvatarSourceIndex(0);
            setBannerFailed(false);
            try {
                const portfolioRes = await fetch(`${API_BASE}/api/portfolio/${userId}?include_promoted=true`);
                if (!portfolioRes.ok) {
                    throw new Error('Portfolio not found');
                }
                const portfolioData = await portfolioRes.json();
                const normalizedPortfolio = {
                    ...portfolioData,
                    twitter_handle: normalizeTwitterHandle(portfolioData.twitter_handle || ''),
                    other_works: normalizeOtherWorks(portfolioData.other_works),
                };
                setPortfolio(normalizedPortfolio);
                const requests = [
                    (async () => {
                        const STATS_CACHE_KEY = `liquid:twitter:stats:${userId}`;
                        const STATS_CACHE_DURATION = 10 * 60 * 1000;
                        try {
                            const cached = localStorage.getItem(STATS_CACHE_KEY);
                            if (cached) {
                                const { data, timestamp } = JSON.parse(cached);
                                const age = Date.now() - timestamp;
                                if (age < STATS_CACHE_DURATION) {
                                    setTweetStats(data);
                                    return;
                                }
                            }
                        } catch (err) {
                        }
                        try {
                            const statsRes = await fetch(`${API_BASE}/api/twitter/portfolio/${userId}/stats`);
                            if (!statsRes.ok) return;
                            const statsData = await statsRes.json();
                            setTweetStats(statsData);
                            try {
                                localStorage.setItem(STATS_CACHE_KEY, JSON.stringify({
                                    data: statsData,
                                    timestamp: Date.now()
                                }));
                            } catch (err) {
                            }
                        } catch (statsError) {
                            console.error('Failed to fetch tweet stats:', statsError);
                        }
                    })(),
                    (async () => {
                        try {
                            const discordRes = await fetch(`${API_BASE}/api/user/${userId}/discord-stats`);
                            if (!discordRes.ok) return;
                            const discordData = await discordRes.json();
                            setDiscordStats(discordData);
                        } catch (discordError) {
                            console.error('Failed to fetch Discord stats:', discordError);
                        }
                    })(),
                    (async () => {
                        try {
                            const userRes = await fetch(`${API_BASE}/api/user/${userId}/dashboard`);
                            if (!userRes.ok) return;
                            const dashboardData = await userRes.json();
                            setDashboardUser(dashboardData?.user || null);
                        } catch (userError) {
                            console.error('Failed to fetch dashboard user:', userError);
                        }
                    })(),
                    (async () => {
                        try {
                            setLoadingTimeline(true);
                            const timelineRes = await fetch(`${API_BASE}/api/portfolio/${userId}/timeline`);
                            if (!timelineRes.ok) {
                                setPortfolioTimeline([]);
                                return;
                            }
                            const timelineData = await timelineRes.json();
                            setPortfolioTimeline(Array.isArray(timelineData) ? timelineData : []);
                        } catch (timelineError) {
                            console.error('Failed to fetch portfolio timeline:', timelineError);
                            setPortfolioTimeline([]);
                        } finally {
                            setLoadingTimeline(false);
                        }
                    })(),
                ];
                if (normalizedPortfolio.twitter_handle) {
                    requests.push(
                        (async () => {
                            const TWITTER_CACHE_KEY = 'liquid:twitter:profiles:cache';
                            const TWITTER_CACHE_DURATION = 30 * 60 * 1000;
                            const handleKey = normalizedPortfolio.twitter_handle.toLowerCase().replace(/^@+/, '');
                            try {
                                const cached = localStorage.getItem(TWITTER_CACHE_KEY);
                                if (cached) {
                                    const { data: cachedProfiles, timestamp } = JSON.parse(cached);
                                    const age = Date.now() - timestamp;
                                    if (age < TWITTER_CACHE_DURATION && cachedProfiles[handleKey]) {
                                        setTwitterProfile(cachedProfiles[handleKey]);
                                        return;
                                    }
                                }
                            } catch (err) {
                            }
                            try {
                                const twitterRes = await fetch(
                                    `${API_BASE}/api/twitter/profile/${encodeURIComponent(normalizedPortfolio.twitter_handle)}`
                                );
                                if (!twitterRes.ok) return;
                                const twitterData = await twitterRes.json();
                                setTwitterProfile(twitterData);
                                try {
                                    const cached = localStorage.getItem(TWITTER_CACHE_KEY);
                                    let cachedProfiles = {};
                                    if (cached) {
                                        const parsed = JSON.parse(cached);
                                        cachedProfiles = parsed.data || {};
                                    }
                                    cachedProfiles[handleKey] = twitterData;
                                    localStorage.setItem(TWITTER_CACHE_KEY, JSON.stringify({
                                        data: cachedProfiles,
                                        timestamp: Date.now()
                                    }));
                                } catch (err) {
                                }
                            } catch (twitterError) {
                                console.error('Failed to fetch Twitter profile:', twitterError);
                            }
                        })()
                    );
                }
                await Promise.allSettled(requests);
            } catch (fetchError) {
                setError(fetchError.message || 'Portfolio not found');
            } finally {
                setLoading(false);
            }
        };
        fetchPortfolio();
    }, [userId]);
    const tweetAvatarCandidate = upscaleTwitterImage(
        extractTweetAuthorAvatar(tweetStats?.tweets)
    );
    const twitterAvatarCandidate = upscaleTwitterImage(
        twitterProfile?.profile_picture || twitterProfile?.profilePicture || twitterProfile?.profile_image_url_https || ''
    );
    const authDiscordId = `${authUser?.id || authUser?.discord_id || ''}`.trim();
    const authAvatarCandidate =
        authDiscordId && authDiscordId === `${userId}` ? `${authUser?.avatar_url || ''}`.trim() : '';
    const discordAvatarCandidate = dashboardUser?.avatar_url || '';
    const avatarCandidates = Array.from(
        new Set([tweetAvatarCandidate, twitterAvatarCandidate, authAvatarCandidate, discordAvatarCandidate].filter(Boolean))
    );
    useEffect(() => {
        setAvatarSourceIndex(0);
    }, [tweetAvatarCandidate, twitterAvatarCandidate, authAvatarCandidate, discordAvatarCandidate, userId]);
    useEffect(() => {
        if (!isInsightsOpen) return;
        const onKeyDown = (event) => {
            if (event.key === 'Escape') {
                setIsInsightsOpen(false);
            }
        };
        window.addEventListener('keydown', onKeyDown);
        return () => window.removeEventListener('keydown', onKeyDown);
    }, [isInsightsOpen]);
    useEffect(() => {
        if (!isInsightsOpen) return;
        const previousOverflow = document.body.style.overflow;
        document.body.style.overflow = 'hidden';
        return () => {
            document.body.style.overflow = previousOverflow;
        };
    }, [isInsightsOpen]);
    if (loading) {
        return (
            <div className="page-reveal" style={{ minHeight: '100vh', padding: '120px 20px', background: 'transparent', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <div style={{ textAlign: 'center' }}>
                    <div style={{ width: '40px', height: '40px', border: '3px solid var(--color-primary)', borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 1s linear infinite', margin: '0 auto 16px' }} />
                    <p style={{ color: 'var(--color-text-secondary)' }}>Loading portfolio...</p>
                </div>
                <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
            </div>
        );
    }
    if (error || !portfolio) {
        return (
            <div className="page-reveal" style={{ minHeight: '100vh', padding: '120px 20px', background: 'transparent' }}>
                <div style={{ maxWidth: '600px', margin: '0 auto', textAlign: 'center' }}>
                    <div style={{ fontSize: '64px', marginBottom: '16px' }}>😕</div>
                    <h1 style={{ fontSize: '28px', marginBottom: '12px', color: 'var(--color-text)' }}>Portfolio Not Found</h1>
                    <p style={{ color: 'var(--color-text-secondary)', marginBottom: '24px' }}>
                        This portfolio does not exist or has been removed.
                    </p>
                    <Link to="/portfolios" style={{ color: 'var(--color-primary)', textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: '8px' }}>
                        <ArrowLeft size={18} /> Back to Portfolios
                    </Link>
                </div>
            </div>
        );
    }
    const profileStatus = portfolio.status || 'draft';
    const displayHandle = normalizeTwitterHandle(portfolio.twitter_handle || '');
    const displayName = twitterProfile?.name || (displayHandle ? `@${displayHandle}` : `User ${userId}`);
    const guildId = resolveGuildId(portfolio.target_role);
    const guildMeta = guildId ? GUILDS.find((guild) => guild.id === guildId) : null;
    const GuildIcon = guildMeta?.icon || Users;
    const guildLabel = guildMeta?.name || portfolio.target_role || 'Guild not set';
    const avatarUrl = avatarCandidates[avatarSourceIndex] || '';
    const bannerUrl = bannerFailed ? '' : twitterProfile?.banner_url || '';
    const portfolioTweets = (portfolio.tweets || [])
        .map((tweet) => (typeof tweet === 'string' ? tweet : tweet?.tweet_url))
        .filter((tweetUrl) => typeof tweetUrl === 'string' && tweetUrl.trim().length > 0);
    const otherWorks = normalizeOtherWorks(portfolio.other_works);
    const joinedDateLabel = formatDisplayDate(portfolio.created_at);
    const followerLabel = formatCompactNumber(twitterProfile?.followers);
    const analyticsMetrics = [
        {
            key: 'likes',
            label: 'Likes',
            value: formatCompactNumber(tweetStats?.total_likes),
            icon: <Heart size={14} />,
            tone: 'likes',
        },
        {
            key: 'retweets',
            label: 'Retweets',
            value: formatCompactNumber(tweetStats?.total_retweets),
            icon: <Repeat2 size={14} />,
            tone: 'retweets',
        },
        {
            key: 'views',
            label: 'Views',
            value: formatCompactNumber(tweetStats?.total_views),
            icon: <Eye size={14} />,
            tone: 'views',
        },
        {
            key: 'tweets',
            label: 'Tweets',
            value: formatCompactNumber(tweetStats?.tweet_count ?? portfolioTweets.length),
            icon: <XLogo size={14} />,
            tone: 'tweets',
        },
    ];
    const discordMetrics = [
        {
            key: 'messages',
            label: 'Messages',
            value: formatCompactNumber(discordStats?.message_count),
            icon: <MessageSquare size={14} />,
            tone: 'discord',
        },
        {
            key: 'channels',
            label: 'Channels',
            value: formatCompactNumber(discordStats?.channels_active),
            icon: <Users size={14} />,
            tone: 'discord',
        },
    ];
    return (
        <div className="pv-page">
            <div className="page-reveal">
                <div className="pv-shell">
                    <div className="pv-grid">
                        <main className="pv-main">
                            <section className="pv-card pv-hero">
                                <div className="pv-hero-banner">
                                    {bannerUrl ? (
                                        <img
                                            src={bannerUrl}
                                            alt=""
                                            className="pv-hero-banner-image"
                                            onError={() => setBannerFailed(true)}
                                        />
                                    ) : (
                                        <div className="pv-hero-banner-fallback" />
                                    )}
                                    <button
                                        type="button"
                                        onClick={copyPortfolioLink}
                                        className={`pv-banner-share-btn${linkCopied ? ' is-copied' : ''}`}
                                        title={linkCopied ? 'Copied' : 'Copy portfolio link'}
                                        aria-label={linkCopied ? 'Portfolio link copied' : 'Copy portfolio link'}
                                    >
                                        {linkCopied ? <Check size={14} /> : <Share2 size={14} />}
                                    </button>
                                </div>
                                <div className="pv-hero-body">
                                    <div className="pv-hero-head">
                                        <div className="pv-avatar-shell">
                                            {avatarUrl ? (
                                                <img
                                                    src={avatarUrl}
                                                    alt={`${displayName} avatar`}
                                                    className="pv-avatar-image"
                                                    loading="lazy"
                                                    referrerPolicy="no-referrer"
                                                    onError={() => {
                                                        setAvatarSourceIndex((currentIndex) => {
                                                            if (currentIndex + 1 < avatarCandidates.length) {
                                                                return currentIndex + 1;
                                                            }
                                                            return avatarCandidates.length;
                                                        });
                                                    }}
                                                />
                                            ) : (
                                                <div className="pv-avatar-fallback">
                                                    {buildInitials(displayName || displayHandle || 'User')}
                                                </div>
                                            )}
                                        </div>
                                        <div className="pv-hero-actions">
                                            <StatusBadge status={profileStatus} />
                                            <button
                                                type="button"
                                                className="pv-insights-btn"
                                                onClick={() => setIsInsightsOpen(true)}
                                                title="Open insights"
                                            >
                                                <BarChart3 size={16} />
                                                Insights
                                            </button>
                                        </div>
                                    </div>
                                    <div className="pv-hero-main">
                                        <div className="pv-identity">
                                            <h1>{displayName}</h1>
                                            <div className="pv-identity-subline">
                                                {displayHandle && (
                                                    <a
                                                        className="pv-handle-link"
                                                        href={`https://x.com/${displayHandle}`}
                                                        target="_blank"
                                                        rel="noopener noreferrer"
                                                    >
                                                        <XLogo size={15} />
                                                        @{displayHandle}
                                                    </a>
                                                )}
                                                <div className="pv-guild-inline">
                                                    <span className="pv-guild-inline-icon" aria-hidden="true">
                                                        <GuildIcon size={14} />
                                                    </span>
                                                    <span className="pv-guild-inline-label">{guildLabel}</span>
                                                </div>
                                            </div>
                                        </div>
                                        <div className="pv-hero-meta" aria-label="Profile metadata">
                                            <p className="pv-hero-meta-line">
                                                <Calendar size={14} />
                                                <span>Joined {joinedDateLabel}</span>
                                            </p>
                                            <p className="pv-hero-meta-line">
                                                <Users size={14} />
                                                <span><strong>{followerLabel}</strong> Followers</span>
                                            </p>
                                        </div>
                                    </div>
                                </div>
                            </section>
                            <section className="pv-sections">
                                <article className="pv-card pv-section" aria-label="Tweets submitted">
                                    <div className="pv-section-title">
                                        <XLogo size={16} />
                                        Tweets Submitted
                                    </div>
                                    {portfolioTweets.length > 0 ? (
                                        <div className="pv-tweets-grid">
                                            {portfolioTweets.map((tweetUrl, index) => (
                                                <div key={`${tweetUrl}-${index}`} className="pv-post-item">
                                                    <TweetCard
                                                        tweetUrl={tweetUrl}
                                                        useEmbed={true}
                                                    />
                                                </div>
                                            ))}
                                        </div>
                                    ) : (
                                        <p className="pv-section-empty">No tweets were added to this portfolio yet.</p>
                                    )}
                                </article>
                                <article className="pv-card pv-section" aria-label="Top content highlights">
                                    <div className="pv-section-title">
                                        <BarChart3 size={16} />
                                        Top Content Highlights
                                    </div>
                                    {portfolio.top_content || portfolio.achievements ? (
                                        <div className="pv-section-copy">{formatContentHighlightsAsLinks(portfolio.top_content || portfolio.achievements)}</div>
                                    ) : (
                                        <p className="pv-section-empty">No top content highlights provided.</p>
                                    )}
                                </article>
                                <article className="pv-card pv-section" aria-label="Other works">
                                    <div className="pv-section-title">
                                        <ExternalLink size={16} />
                                        Other Works
                                    </div>
                                    {otherWorks.length > 0 ? (
                                        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                                            {otherWorks.map((work, index) => {
                                                const meta = getLinkSummary(work.url);
                                                return (
                                                    <a
                                                        key={`${work.url}-${index}`}
                                                        href={work.url}
                                                        target="_blank"
                                                        rel="noopener noreferrer"
                                                        style={{
                                                            display: 'flex',
                                                            alignItems: 'center',
                                                            gap: '12px',
                                                            padding: '12px 16px',
                                                            background: 'rgba(0, 0, 0, 0.4)',
                                                            border: '1px solid rgba(51, 65, 85, 0.5)',
                                                            borderRadius: '8px',
                                                            textDecoration: 'none',
                                                            color: 'inherit',
                                                            transition: 'all 0.2s ease',
                                                            cursor: 'pointer',
                                                        }}
                                                        onMouseEnter={(e) => {
                                                            e.currentTarget.style.background = 'rgba(0, 0, 0, 0.6)';
                                                            e.currentTarget.style.borderColor = 'rgba(139, 92, 246, 0.4)';
                                                            e.currentTarget.style.transform = 'translateX(4px)';
                                                        }}
                                                        onMouseLeave={(e) => {
                                                            e.currentTarget.style.background = 'rgba(0, 0, 0, 0.4)';
                                                            e.currentTarget.style.borderColor = 'rgba(51, 65, 85, 0.5)';
                                                            e.currentTarget.style.transform = 'translateX(0)';
                                                        }}
                                                    >
                                                        <ExternalLink size={16} style={{ color: '#8b5cf6', flexShrink: 0 }} />
                                                        <div style={{ flex: 1, minWidth: 0 }}>
                                                            <div style={{
                                                                fontWeight: 500,
                                                                fontSize: '14px',
                                                                color: '#e2e8f0',
                                                                marginBottom: '2px'
                                                            }}>
                                                                {meta.host}
                                                            </div>
                                                            <div style={{
                                                                fontSize: '12px',
                                                                color: '#94a3b8',
                                                                overflow: 'hidden',
                                                                textOverflow: 'ellipsis',
                                                                whiteSpace: 'nowrap'
                                                            }}>
                                                                {meta.label || work.url}
                                                            </div>
                                                        </div>
                                                        <ExternalLink size={14} style={{ color: '#8b5cf6', flexShrink: 0, opacity: 0.6 }} />
                                                    </a>
                                                );
                                            })}
                                        </div>
                                    ) : (
                                        <p className="pv-section-empty">No other works linked yet.</p>
                                    )}
                                </article>
                                <article className="pv-card pv-section" aria-label="Proof of use">
                                    <div className="pv-section-title">
                                        <Eye size={16} />
                                        Proof Of Use
                                    </div>
                                    {portfolio.proof_of_use_filename ? (
                                        <img
                                            src={`${API_BASE}/api/portfolio/${portfolio.discord_id}/proof-image`}
                                            alt="Proof of use"
                                            style={{ width: '100%', borderRadius: '12px', border: '1px solid var(--color-badge-border)' }}
                                        />
                                    ) : (
                                        <p className="pv-section-empty">No proof of use provided.</p>
                                    )}
                                </article>
                                {(loadingTimeline || portfolioTimeline.length > 0) && (
                                    <article className="pv-card pv-section" aria-label="Portfolio timeline">
                                        <div className="pv-section-title">
                                            <Calendar size={16} />
                                            Portfolio Timeline
                                        </div>
                                        {loadingTimeline ? (
                                            <div style={{ textAlign: 'center', padding: '28px 20px', color: 'var(--color-text-secondary)' }}>
                                                Loading timeline...
                                            </div>
                                        ) : (
                                            <div style={{
                                                display: 'flex',
                                                flexDirection: 'column',
                                                gap: '16px',
                                            }}>
                                                {portfolioTimeline.map((entry, index) => {
                                                    const subsection = getTimelineSubsection(entry);
                                                    const shouldShowNotes = entry.notes && !subsection;
                                                    return (
                                                        <div
                                                            key={`${entry.id || index}-${entry.changed_at}`}
                                                            style={{
                                                                display: 'flex',
                                                                gap: '12px',
                                                                paddingBottom: index < portfolioTimeline.length - 1 ? '16px' : '0',
                                                                borderBottom: index < portfolioTimeline.length - 1 ? '1px solid rgba(51, 65, 85, 0.3)' : 'none',
                                                            }}
                                                        >
                                                            <div style={{
                                                                minWidth: '32px',
                                                                height: '32px',
                                                                borderRadius: '50%',
                                                                background: entry.action === 'promoted' ? 'rgba(167, 139, 250, 0.2)' :
                                                                    entry.action === 'promotion_rejected' ? 'rgba(248, 113, 113, 0.2)' :
                                                                        entry.action === 'approve' || entry.action === 'submit' ? 'rgba(96, 165, 250, 0.2)' :
                                                                            entry.action === 'reject' || entry.action === 'request_changes' ? 'rgba(248, 113, 113, 0.2)' :
                                                                                'rgba(148, 163, 184, 0.2)',
                                                                border: entry.action === 'promoted' ? '1px solid rgba(167, 139, 250, 0.5)' :
                                                                    entry.action === 'promotion_rejected' ? '1px solid rgba(248, 113, 113, 0.5)' :
                                                                        entry.action === 'approve' || entry.action === 'submit' ? '1px solid rgba(96, 165, 250, 0.5)' :
                                                                            entry.action === 'reject' || entry.action === 'request_changes' ? '1px solid rgba(248, 113, 113, 0.5)' :
                                                                                '1px solid rgba(148, 163, 184, 0.5)',
                                                                display: 'flex',
                                                                alignItems: 'center',
                                                                justifyContent: 'center',
                                                                flexShrink: 0,
                                                            }}>
                                                                {entry.action === 'promoted' && <CheckCircle2 size={16} />}
                                                                {entry.action === 'approve' && <CheckCircle2 size={16} />}
                                                                {entry.action === 'submit' && <Circle size={14} />}
                                                                {entry.action === 'reject' || entry.action === 'request_changes' ? <AlertCircle size={16} /> : null}
                                                                {entry.action === 'promotion_rejected' && <AlertCircle size={16} />}
                                                            </div>
                                                            <div style={{ flex: 1, minWidth: 0 }}>
                                                                <div style={{ fontWeight: 600, marginBottom: '4px', fontSize: '14px' }}>
                                                                    {getTimelineActionLabel(entry)}
                                                                </div>
                                                                <div style={{
                                                                    fontSize: '12px',
                                                                    color: 'var(--color-text-secondary)',
                                                                    marginBottom: subsection || shouldShowNotes ? '8px' : '0',
                                                                }}>
                                                                    {formatTimelineDate(entry.changed_at)}
                                                                </div>
                                                                {subsection && (
                                                                    <div style={{
                                                                        fontSize: '13px',
                                                                        color: 'var(--color-text-secondary)',
                                                                        padding: '8px 12px',
                                                                        background: 'rgba(51, 65, 85, 0.3)',
                                                                        borderRadius: '6px',
                                                                        borderLeft: '2px solid var(--color-primary)',
                                                                        display: 'grid',
                                                                        gap: '8px',
                                                                    }}>
                                                                        <strong style={{ color: 'var(--color-text)' }}>{subsection.title}</strong>
                                                                        {subsection.parsed ? (
                                                                            <div style={{ display: 'grid', gap: '8px' }}>
                                                                                <div>
                                                                                    <div style={{ fontWeight: 600, marginBottom: '4px' }}>Approved</div>
                                                                                    <ul style={{ margin: 0, paddingLeft: '18px' }}>
                                                                                        {subsection.parsed.approved.length > 0
                                                                                            ? subsection.parsed.approved.map((line, i) => <li key={`approved-${i}`}>{line}</li>)
                                                                                            : <li>none</li>}
                                                                                    </ul>
                                                                                </div>
                                                                                <div>
                                                                                    <div style={{ fontWeight: 600, marginBottom: '4px' }}>Rejected</div>
                                                                                    <ul style={{ margin: 0, paddingLeft: '18px' }}>
                                                                                        {subsection.parsed.rejected.length > 0
                                                                                            ? subsection.parsed.rejected.map((line, i) => <li key={`rejected-${i}`}>{line}</li>)
                                                                                            : <li>none</li>}
                                                                                    </ul>
                                                                                </div>
                                                                            </div>
                                                                        ) : (
                                                                            <div>{subsection.content}</div>
                                                                        )}
                                                                    </div>
                                                                )}
                                                                {shouldShowNotes && (
                                                                    <div style={{
                                                                        fontSize: '13px',
                                                                        color: 'var(--color-text-secondary)',
                                                                        padding: '8px 12px',
                                                                        background: 'rgba(51, 65, 85, 0.3)',
                                                                        borderRadius: '6px',
                                                                        borderLeft: '2px solid var(--color-primary)',
                                                                    }}>
                                                                        {entry.notes}
                                                                    </div>
                                                                )}
                                                            </div>
                                                        </div>
                                                    );
                                                })}
                                            </div>
                                        )}
                                    </article>
                                )}
                            </section>
                        </main>
                    </div>
                </div>
            </div>
            {isInsightsOpen && (
                <div className="pv-insights-modal-overlay" onClick={() => setIsInsightsOpen(false)}>
                    <section
                        className="pv-insights-modal"
                        role="dialog"
                        aria-modal="true"
                        aria-labelledby="pv-insights-title"
                        onClick={(event) => event.stopPropagation()}
                    >
                        <header className="pv-insights-modal-head">
                            <div className="pv-panel-head">
                                <BarChart3 size={16} />
                                <h3 id="pv-insights-title">Insights</h3>
                            </div>
                            <button
                                type="button"
                                className="pv-insights-modal-close"
                                aria-label="Close insights"
                                onClick={() => setIsInsightsOpen(false)}
                            >
                                <X size={16} />
                            </button>
                        </header>
                        <div className="pv-insights-modal-body">
                            <section className="pv-insights-group">
                                <div className="pv-insights-group-head">
                                    <BarChart3 size={16} />
                                    <h4>Twitter Analytics</h4>
                                </div>
                                <div className="pv-metrics-grid pv-insights-metrics-grid">
                                    {analyticsMetrics.map((metric) => (
                                        <MetricCard
                                            key={metric.key}
                                            icon={metric.icon}
                                            label={metric.label}
                                            value={metric.value}
                                            tone={metric.tone}
                                        />
                                    ))}
                                </div>
                            </section>
                            {}
                            {otherWorks.length > 0 && (
                                <section className="pv-insights-group pv-insights-group--works">
                                    <div className="pv-insights-group-head">
                                        <ExternalLink size={16} />
                                        <h4>Portfolio Links</h4>
                                    </div>
                                    <div className="pv-works-list">
                                        {otherWorks.map((work, index) => (
                                            <a
                                                key={`${work.url}-${index}`}
                                                href={work.url}
                                                target="_blank"
                                                rel="noopener noreferrer"
                                                className="pv-work-link"
                                            >
                                                <div className="pv-work-topline">
                                                    <span className="pv-work-title">{work.title}</span>
                                                    <ExternalLink size={14} />
                                                </div>
                                                {work.description && (
                                                    <p className="pv-work-description">{work.description}</p>
                                                )}
                                            </a>
                                        ))}
                                    </div>
                                </section>
                            )}
                        </div>
                    </section>
                </div>
            )}
        </div>
    );
};
export default PortfolioView;
