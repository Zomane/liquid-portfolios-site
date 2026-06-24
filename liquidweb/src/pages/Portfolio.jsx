import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { FileText, Twitter, Link, CheckCircle, XCircle, Clock, AlertCircle, User, ArrowLeft, ArrowRight, Trash2, Edit3, Image, ExternalLink, Target, MessageSquare, Briefcase, Heart, Eye, Repeat2, Calendar as CalendarIcon, Activity as ActivityIcon, Share2, Copy, Check, BarChart3 } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { GuildSelect, GuildBadge, GUILDS } from '../components/GuildSelect';
import { PortfolioTimeline, PortfolioTweetsStep } from '../components/PortfolioFormSections';
import { TweetCard } from '../components/TweetEmbed';
import { StatsCard } from '../components/StatsCharts';
import { ModalPortal } from '../components/ModalPortal';
import { apiFetch, API_BASE } from '../utils/api';
const XLogo = ({ size = 18 }) => (
    <img
        src="/Xlogo.png"
        alt="X"
        style={{ width: size, height: size, objectFit: 'contain' }}
    />
);
const ROLE_TONES = {
    Droplet: { color: 'var(--tone-neutral)', bg: 'var(--tone-neutral-bg)' },
    Current: { color: 'var(--tone-info)', bg: 'var(--tone-info-bg)' },
    Tide: { color: 'var(--tone-info)', bg: 'var(--tone-info-bg)' },
    Wave: { color: 'var(--tone-promo)', bg: 'var(--tone-promo-bg)' },
    Tsunami: { color: 'var(--tone-success)', bg: 'var(--tone-success-bg)' },
    Allinliquid: { color: 'var(--tone-warning)', bg: 'var(--tone-warning-bg)' },
};
const ROLE_HIERARCHY = ['Droplet', 'Current', 'Tide', 'Wave', 'Tsunami', 'Allinliquid'];
const MAX_OTHER_WORKS = 10;
function parseTweetInput(rawValue) {
    const value = `${rawValue || ''}`.trim();
    if (!value) return null;
    if (/^\d+$/.test(value)) {
        return {
            tweetId: value,
            username: 'i',
            canonicalUrl: `https://x.com/i/status/${value}`,
        };
    }
    const match = value.match(
        /(?:https?:\/\/)?(?:www\.)?(?:mobile\.)?(?:x|twitter)\.com\/([A-Za-z0-9_]{1,15}|i)\/status\/(\d+)/i
    );
    if (!match) return null;
    const username = match[1].toLowerCase() === 'i' ? 'i' : match[1].replace(/^@+/, '');
    const tweetId = match[2];
    return {
        tweetId,
        username,
        canonicalUrl: `https://x.com/${username}/status/${tweetId}`,
    };
}
function extractTweetId(rawValue) {
    return parseTweetInput(rawValue)?.tweetId || null;
}
function normalizeGuildId(rawGuildValue) {
    if (!rawGuildValue) return '';
    const value = String(rawGuildValue).trim();
    if (!value) return '';
    const normalized = value.toLowerCase();
    const direct = GUILDS.find((guild) => guild.id === normalized);
    if (direct) return direct.id;
    const byName = GUILDS.find((guild) => guild.name.toLowerCase() === normalized);
    if (byName) return byName.id;
    const cleaned = normalized.replace(/\s+guild$/i, '').trim();
    const byCleanName = GUILDS.find(
        (guild) => guild.name.toLowerCase().replace(/\s+guild$/i, '').trim() === cleaned
    );
    if (byCleanName) return byCleanName.id;
    return value;
}
function dedupeTweetUrls(tweetUrls = []) {
    const uniqueTweetUrls = [];
    const seenTweetIds = new Set();
    tweetUrls.forEach((rawTweetUrl) => {
        const parsed = parseTweetInput(rawTweetUrl);
        const tweetId = parsed?.tweetId;
        const canonicalUrl = parsed?.canonicalUrl || `${rawTweetUrl || ''}`.trim();
        const uniqueKey = tweetId || canonicalUrl;
        if (!uniqueKey || seenTweetIds.has(uniqueKey)) return;
        seenTweetIds.add(uniqueKey);
        uniqueTweetUrls.push(canonicalUrl);
    });
    return uniqueTweetUrls;
}
function getLinkSummary(rawLink) {
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
}
function normalizeOtherWorksValue(rawValue) {
    if (!rawValue) return [];
    if (Array.isArray(rawValue)) {
        return rawValue.map((item) => `${item || ''}`.trim()).filter(Boolean);
    }
    if (typeof rawValue === 'string') {
        try {
            const parsed = JSON.parse(rawValue);
            if (Array.isArray(parsed)) {
                return parsed.map((item) => `${item || ''}`.trim()).filter(Boolean);
            }
        } catch (err) {
            return rawValue.trim() ? [rawValue.trim()] : [];
        }
    }
    return [];
}
function formatContentHighlightsAsLinks(text) {
    if (!text) return null;
    const urlRegex = /https?:\/\/[^\s]+/g;
    const urls = text.match(urlRegex);
    if (!urls || urls.length === 0) {
        return <p className="portfolio-dashboard-text">{text}</p>;
    }
    return (
        <div className="portfolio-link-grid">
            {urls.map((url, index) => {
                const meta = getLinkSummary(url);
                return (
                    <a
                        key={`${url}-${index}`}
                        href={url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="portfolio-proof-link"
                        style={{ display: 'flex', gap: '8px', alignItems: 'center' }}
                    >
                        <ExternalLink size={14} />
                        <span style={{ fontWeight: '500' }}>{meta.host}</span>
                        <span style={{ opacity: 0.7, fontSize: '0.9em' }}>{meta.path || 'Link'}</span>
                    </a>
                );
            })}
        </div>
    );
}
const Portfolio = () => {
    const navigate = useNavigate();
    const { user, isAuthenticated, loading: authLoading, login } = useAuth();
    const [loading, setLoading] = useState(true);
    const [dashboard, setDashboard] = useState(null);
    const [step, setStep] = useState('guild');
    const [formTab, setFormTab] = useState('tweets');
    const [portfolioTimeline, setPortfolioTimeline] = useState([]);
    const [loadingTimeline, setLoadingTimeline] = useState(false);
    const [formData, setFormData] = useState({
        guild: '',
        twitter_username: '',
        top_content: '',
        other_works: [],
        proof_of_use: '',
        proof_images: [],
        selected_tweets: [],
    });
    const [newOtherWork, setNewOtherWork] = useState('');
    const [availableTweets, setAvailableTweets] = useState([]);
    const [newTweetUrl, setNewTweetUrl] = useState('');
    const [tweetInputError, setTweetInputError] = useState('');
    const [submitting, setSubmitting] = useState(false);
    const [deleting, setDeleting] = useState(false);
    const [error, setError] = useState('');
    const [success, setSuccess] = useState('');
    const [tweetStats, setTweetStats] = useState(null);
    const [linkCopied, setLinkCopied] = useState(false);
    const [isSubmitModalOpen, setIsSubmitModalOpen] = useState(false);
    const [proofOfUsePreview, setProofOfUsePreview] = useState(null);
    const [proofOfUseFilename, setProofOfUseFilename] = useState('');
    const [proofOfUseUpload, setProofOfUseUpload] = useState(null);
    const addOtherWork = useCallback(() => {
        const trimmedLink = `${newOtherWork || ''}`.trim();
        if (!trimmedLink) return;
        setFormData((prev) => {
            const previousLinks = normalizeOtherWorksValue(prev.other_works);
            if (previousLinks.length >= MAX_OTHER_WORKS) {
                return prev;
            }
            if (previousLinks.some((existing) => existing === trimmedLink)) {
                return prev;
            }
            return {
                ...prev,
                other_works: [...previousLinks, trimmedLink].slice(0, MAX_OTHER_WORKS),
            };
        });
        setNewOtherWork('');
    }, [newOtherWork]);
    const discordId = user?.id || user?.discord_id || '';
    const hasGuildAccess = user?.has_guild_access || false;
    const userGuilds = user?.guilds || [];
    const authenticatedFetch = apiFetch;
    const getPortfolioUrl = () => {
        const baseUrl = window.location.origin;
        return `${baseUrl}/portfolios/${discordId}`;
    };
    const copyPortfolioLink = async () => {
        try {
            await navigator.clipboard.writeText(getPortfolioUrl());
            setLinkCopied(true);
            setTimeout(() => setLinkCopied(false), 2000);
        } catch (err) {
            console.error('Failed to copy:', err);
        }
    };
    const fetchDashboard = useCallback(async () => {
        try {
            const res = await fetch(`${API_BASE}/api/user/${discordId}/dashboard`);
            if (res.ok) {
                const data = await res.json();
                setDashboard(data);
                const guildName = normalizeGuildId(data.guild_info?.name || '');
                const tweetsFromDb = data.recent_tweets || [];
                const tweetUrls = tweetsFromDb.map(t => t.tweet_url);
                if (tweetUrls.length > 0) {
                    setAvailableTweets(dedupeTweetUrls(tweetUrls));
                }
                let twitterHandle = '';
                try {
                    const portfolioRes = await fetch(`${API_BASE}/api/portfolio/${discordId}`);
                    if (portfolioRes.status === 404) {
                        setFormData(prev => ({
                            ...prev,
                            guild: guildName || normalizeGuildId(prev.guild),
                        }));
                        setProofOfUsePreview(null);
                        setProofOfUseFilename('');
                        setProofOfUseUpload(null);
                    } else if (portfolioRes.ok) {
                        const portfolioData = await portfolioRes.json();
                        console.log('[Portfolio Fetch] Received portfolio data:', {
                            other_works: portfolioData.other_works,
                            other_works_type: typeof portfolioData.other_works,
                            achievements: portfolioData.achievements,
                            notion_url: portfolioData.notion_url
                        });
                        const editableStatuses = ['draft', 'rejected', 'promoted'];
                        if (portfolioData.status && !editableStatuses.includes(portfolioData.status)) {
                            navigate(`/portfolios/${discordId}`);
                            return;
                        }
                        twitterHandle = portfolioData.twitter_handle || '';
                        setFormData(prev => ({
                            ...prev,
                            guild: normalizeGuildId(portfolioData.target_role) || guildName || normalizeGuildId(prev.guild),
                            twitter_username: twitterHandle || prev.twitter_username,
                            other_works: normalizeOtherWorksValue(portfolioData.other_works || prev.other_works || []).slice(0, MAX_OTHER_WORKS),
                            top_content: portfolioData.achievements || prev.top_content,
                            proof_of_use: portfolioData.notion_url || prev.proof_of_use,
                        }));
                        if (portfolioData.proof_of_use_filename) {
                            setProofOfUsePreview(`${API_BASE}/api/portfolio/${discordId}/proof-image`);
                            setProofOfUseFilename(portfolioData.proof_of_use_filename || '');
                            setProofOfUseUpload(null);
                        } else {
                            setProofOfUsePreview(null);
                            setProofOfUseFilename('');
                            setProofOfUseUpload(null);
                        }
                    } else {
                        setFormData(prev => ({
                            ...prev,
                            guild: guildName || normalizeGuildId(prev.guild),
                        }));
                        setProofOfUsePreview(null);
                        setProofOfUseFilename('');
                        setProofOfUseUpload(null);
                    }
                } catch {
                    console.log('No existing portfolio');
                    setFormData(prev => ({
                        ...prev,
                        guild: guildName || normalizeGuildId(prev.guild),
                    }));
                    setProofOfUsePreview(null);
                    setProofOfUseFilename('');
                    setProofOfUseUpload(null);
                }
                const STATS_CACHE_KEY = `liquid:twitter:stats:${discordId}`;
                const STATS_CACHE_DURATION = 10 * 60 * 1000;
                let statsFromCache = false;
                try {
                    const cached = localStorage.getItem(STATS_CACHE_KEY);
                    if (cached) {
                        const { data, timestamp } = JSON.parse(cached);
                        const age = Date.now() - timestamp;
                        if (age < STATS_CACHE_DURATION) {
                            setTweetStats(data);
                            statsFromCache = true;
                        }
                    }
                } catch (err) {
                }
                if (!statsFromCache) {
                    try {
                        const statsRes = await fetch(`${API_BASE}/api/twitter/portfolio/${discordId}/stats`);
                        if (statsRes.ok) {
                            const statsData = await statsRes.json();
                            setTweetStats(statsData);
                            try {
                                localStorage.setItem(STATS_CACHE_KEY, JSON.stringify({
                                    data: statsData,
                                    timestamp: Date.now()
                                }));
                            } catch (err) {
                            }
                        }
                    } catch (statsError) {
                        console.error('Failed to fetch tweet stats:', statsError);
                    }
                }
                try {
                    setLoadingTimeline(true);
                    const timelineRes = await fetch(`${API_BASE}/api/portfolio/${discordId}/timeline`);
                    if (timelineRes.ok) {
                        const timelineData = await timelineRes.json();
                        setPortfolioTimeline(Array.isArray(timelineData) ? timelineData : []);
                    }
                } catch (timelineError) {
                    console.error('Failed to fetch portfolio timeline:', timelineError);
                } finally {
                    setLoadingTimeline(false);
                }
                const editableStatuses = ['draft', 'rejected', 'promoted'];
                if (data.portfolio_status && !editableStatuses.includes(data.portfolio_status)) {
                    setStep('dashboard');
                } else if (data.portfolio_status === 'rejected' || data.portfolio_status === 'promoted') {
                    setStep('dashboard');
                } else if (data.portfolio_status === 'draft' && data.portfolio?.review_feedback) {
                    setStep('dashboard');
                } else if (guildName) {
                    setStep('form');
                } else {
                    setStep('guild');
                }
            }
        } catch (err) {
            console.error('Failed to fetch dashboard:', err);
        } finally {
            setLoading(false);
        }
    }, [discordId, navigate]);
    useEffect(() => {
        if (discordId && isAuthenticated) {
            fetchDashboard();
        } else if (!authLoading) {
            setLoading(false);
        }
    }, [discordId, isAuthenticated, authLoading, fetchDashboard]);
    useEffect(() => {
        if (!isSubmitModalOpen) return;
        const onKeyDown = (e) => {
            if (e.key === 'Escape') setIsSubmitModalOpen(false);
        };
        window.addEventListener('keydown', onKeyDown);
        return () => window.removeEventListener('keydown', onKeyDown);
    }, [isSubmitModalOpen]);
    useEffect(() => {
        if (!isSubmitModalOpen) return;
        const prev = document.body.style.overflow;
        document.body.style.overflow = 'hidden';
        return () => {
            document.body.style.overflow = prev;
        };
    }, [isSubmitModalOpen]);
    const cleanTwitterUsername = (input) => {
        let username = input.trim();
        if (username.includes('x.com/') || username.includes('twitter.com/')) {
            username = username.split('/').pop()?.split('?')[0] || username;
        }
        return username.replace(/^@+/, '');
    };
    const addTweetUrl = () => {
        const parsedTweet = parseTweetInput(newTweetUrl);
        if (!newTweetUrl.trim()) {
            setTweetInputError('Paste a Tweet URL or Tweet ID first.');
            return;
        }
        if (!parsedTweet) {
            setTweetInputError('Use a valid X/Twitter status link, e.g. https://x.com/user/status/123.');
            return;
        }
        const alreadyAdded = availableTweets.some((url) => extractTweetId(url) === parsedTweet.tweetId);
        if (alreadyAdded) {
            setTweetInputError('This tweet is already added.');
            return;
        }
        setAvailableTweets([...availableTweets, parsedTweet.canonicalUrl]);
        setNewTweetUrl('');
        setTweetInputError('');
    };
    const removeTweet = (url) => {
        setAvailableTweets(availableTweets.filter(t => t !== url));
    };
    const clearAllTweets = () => {
        if (availableTweets.length === 0) return;
        if (!confirm('Remove all added tweets?')) return;
        setAvailableTweets([]);
        setTweetInputError('');
    };
    const handleSubmitPortfolio = () => {
        if (submitting) return;
        if (!formData.twitter_username?.trim()) {
            setError('Please enter your Twitter username');
            setFormTab('tweets');
            return;
        }
        if (availableTweets.length === 0) {
            setError('Please add at least one tweet');
            setFormTab('tweets');
            return;
        }
        if (availableTweets.length < 6) {
            setError(`Please add at least 6 tweets to your portfolio. You currently have ${availableTweets.length} tweet(s).`);
            setFormTab('tweets');
            return;
        }
        if (!proofOfUsePreview) {
            setError('Please upload a proof of use image (screenshot showing Liquid usage)');
            setFormTab('details');
            return;
        }
        setIsSubmitModalOpen(true);
    };
    const submitPortfolioConfirmed = async () => {
        setIsSubmitModalOpen(false);
        setError('');
        setSuccess('');
        setSubmitting(true);
        try {
            const tweetsData = availableTweets
                .map((url) => {
                    const parsed = parseTweetInput(url);
                    if (!parsed) return null;
                    return {
                        tweet_url: parsed.canonicalUrl,
                        tweet_id: parsed.tweetId,
                    };
                })
                .filter(Boolean);
            if (tweetsData.length === 0) {
                setError('Please add at least one valid tweet');
                setFormTab('tweets');
                setSubmitting(false);
                return;
            }
            if (tweetsData.length < 6) {
                setError(`Please add at least 6 tweets to your portfolio. You currently have ${tweetsData.length} valid tweet(s).`);
                setFormTab('tweets');
                setSubmitting(false);
                return;
            }
            const normalizedOtherWorks = normalizeOtherWorksValue(formData.other_works).slice(0, MAX_OTHER_WORKS);
            const dataToSubmit = {
                discord_id: discordId,
                bio: null,
                twitter_handle: formData.twitter_username,
                achievements: formData.top_content || null,
                notion_url: null,
                target_role: normalizedGuild || formData.guild,
                tweets: tweetsData,
                other_works: normalizedOtherWorks,
            };
            if (proofOfUseUpload) {
                dataToSubmit.proof_of_use_image = proofOfUseUpload;
                dataToSubmit.proof_of_use_filename = proofOfUseFilename;
            }
            const res = await authenticatedFetch(`${API_BASE}/api/portfolio/submit`, {
                method: 'POST',
                body: JSON.stringify(dataToSubmit),
            });
            if (res.ok) {
                navigate(`/portfolios/${discordId}`);
            } else {
                const err = await res.json();
                setError(err.detail || 'Failed to submit');
            }
        } catch {
            setError('Failed to submit portfolio');
        } finally {
            setSubmitting(false);
        }
    };
    const handleDelete = async () => {
        if (!confirm('Are you sure you want to delete your portfolio? This cannot be undone.')) return;
        setDeleting(true);
        try {
            const res = await authenticatedFetch(`${API_BASE}/api/portfolio/${discordId}`, {
                method: 'DELETE',
            });
            if (res.ok) {
                setDashboard(null);
                setFormData({
                    guild: '',
                    twitter_username: '',
                    top_content: '',
                    other_works: [],
                    proof_of_use: '',
                    proof_images: [],
                    selected_tweets: [],
                });
                setProofOfUsePreview(null);
                setProofOfUseFilename('');
                setProofOfUseUpload(null);
                setAvailableTweets([]);
                setStep('guild');
                setSuccess('Portfolio deleted');
            }
        } catch {
            setError('Failed to delete portfolio');
        } finally {
            setDeleting(false);
        }
    };
    const cardStyle = {
        background: 'var(--surface-card)',
        borderRadius: '20px',
        padding: '32px',
        border: '1px solid var(--color-badge-border)',
        boxShadow: '0 4px 20px rgba(0,0,0,0.1)',
        backdropFilter: 'blur(20px)',
    };
    const inputStyle = {
        width: '100%',
        minHeight: '50px',
        padding: '12px 16px',
        borderRadius: '12px',
        border: '1px solid var(--color-badge-border)',
        background: 'var(--surface-muted)',
        color: 'var(--color-text)',
        fontSize: '15px',
        lineHeight: 1.45,
        fontFamily: 'inherit',
        transition: 'border-color 0.2s ease, background 0.2s ease, box-shadow 0.2s ease',
    };
    const labelStyle = {
        display: 'block',
        marginBottom: 0,
        fontWeight: 600,
        fontSize: '13px',
        color: 'var(--color-text-secondary)',
        textTransform: 'uppercase',
        letterSpacing: '0.08em',
    };
    const statusColors = {
        draft: { bg: 'var(--tone-neutral-bg)', color: 'var(--tone-neutral)', icon: FileText },
        submitted: { bg: 'var(--tone-info-bg)', color: 'var(--tone-info)', icon: Clock },
        pending_vote: { bg: 'var(--tone-warning-bg)', color: 'var(--tone-warning)', icon: AlertCircle },
        approved: { bg: 'var(--tone-success-bg)', color: 'var(--tone-success)', icon: CheckCircle },
        rejected: { bg: 'var(--tone-danger-bg)', color: 'var(--tone-danger)', icon: XCircle },
        promoted: { bg: 'var(--tone-promo-bg)', color: 'var(--tone-promo)', icon: CheckCircle },
    };
    if (authLoading) {
        return (
            <div className="page-reveal" style={{ minHeight: '100vh', padding: '120px 20px', background: 'transparent', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <div style={{ textAlign: 'center' }}>
                    <div style={{ width: '40px', height: '40px', border: '3px solid var(--color-primary)', borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 1s linear infinite', margin: '0 auto 16px' }} />
                    <p style={{ color: 'var(--color-text-secondary)' }}>Loading...</p>
                </div>
                <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
            </div>
        );
    }
    if (!isAuthenticated) {
        return (
            <div className="page-reveal" style={{ minHeight: '100vh', padding: '120px 20px 40px', background: 'transparent' }}>
                <div className="container" style={{ maxWidth: '600px', margin: '0 auto', textAlign: 'center' }}>
                    <div style={{
                        margin: '0 auto 24px',
                        width: '80px',
                        height: '80px',
                        background: 'linear-gradient(135deg, rgba(237, 237, 255, 0.1) 0%, rgba(224, 223, 239, 0.05) 100%)',
                        borderRadius: '50%',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        border: '1px solid var(--color-badge-border)'
                    }}>
                        <FileText size={40} style={{ color: 'var(--color-primary)' }} />
                    </div>
                    <h1 style={{
                        fontSize: '48px',
                        margin: '0 0 16px',
                        fontWeight: 700,
                        letterSpacing: '-0.02em',
                        background: 'linear-gradient(180deg, #FFFFFF 0%, #949494 100%)',
                        WebkitBackgroundClip: 'text',
                        WebkitTextFillColor: 'transparent',
                    }}>
                        Portfolio
                    </h1>
                    <p style={{ color: 'var(--color-text-secondary)', margin: 0, marginBottom: '32px', fontSize: '18px', maxWidth: '600px', marginInline: 'auto' }}>
                        Connect with Discord to manage your portfolio
                    </p>
                    <button onClick={login} className="btn btn-primary" style={{ display: 'inline-flex', alignItems: 'center', gap: '10px', padding: '14px 28px', fontSize: '15px' }}>
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
                            <path d="M20.317 4.37a19.791 19.791 0 0 0-4.885-1.515.074.074 0 0 0-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 0 0-5.487 0 12.64 12.64 0 0 0-.617-1.25.077.077 0 0 0-.079-.037A19.736 19.736 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 0 0 .031.057 19.9 19.9 0 0 0 5.993 3.03.078.078 0 0 0 .084-.028 14.09 14.09 0 0 0 1.226-1.994.076.076 0 0 0-.041-.106 13.107 13.107 0 0 1-1.872-.892.077.077 0 0 1-.008-.128 10.2 10.2 0 0 0 .372-.292.074.074 0 0 1 .077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 0 1 .078.01c.12.098.246.198.373.292a.077.077 0 0 1-.006.127 12.299 12.299 0 0 1-1.873.892.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028 19.839 19.839 0 0 0 6.002-3.03.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.03zM8.02 15.33c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.956-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.956 2.418-2.157 2.418zm7.975 0c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.955-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.946 2.418-2.157 2.418z" />
                        </svg>
                        Login with Discord
                    </button>
                </div>
            </div>
        );
    }
    if (!loading && !hasGuildAccess) {
        return (
            <div className="page-reveal" style={{ minHeight: '100vh', padding: '120px 20px 40px', background: 'transparent' }}>
                <div className="container" style={{ maxWidth: '600px', margin: '0 auto', textAlign: 'center' }}>
                    <div style={{
                        margin: '0 auto 24px',
                        width: '80px',
                        height: '80px',
                        background: 'linear-gradient(135deg, rgba(237, 237, 255, 0.1) 0%, rgba(224, 223, 239, 0.05) 100%)',
                        borderRadius: '50%',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        border: '1px solid var(--color-badge-border)'
                    }}>
                        <AlertCircle size={40} style={{ color: 'var(--tone-warning)' }} />
                    </div>
                    <h1 style={{
                        fontSize: '48px',
                        margin: '0 0 16px',
                        fontWeight: 700,
                        letterSpacing: '-0.02em',
                        background: 'linear-gradient(180deg, #FFFFFF 0%, #949494 100%)',
                        WebkitBackgroundClip: 'text',
                        WebkitTextFillColor: 'transparent',
                    }}>
                        Guild Membership Required
                    </h1>
                    <p style={{ color: 'var(--color-text-secondary)', margin: 0, marginBottom: '32px', fontSize: '18px', maxWidth: '600px', marginInline: 'auto' }}>
                        You must belong to at least one guild to submit a portfolio. Join a guild on Discord to get started!
                    </p>
                    <button onClick={() => navigate('/dashboard')} className="btn btn-primary" style={{ display: 'inline-flex', alignItems: 'center', gap: '10px', padding: '14px 28px', fontSize: '15px' }}>
                        View Dashboard
                    </button>
                </div>
            </div>
        );
    }
    if (loading) {
        return (
            <div className="page-reveal" style={{ minHeight: '100vh', padding: '120px 20px', background: 'transparent', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <div style={{ color: 'var(--color-text-secondary)' }}>Loading...</div>
            </div>
        );
    }
    const portfolioStatus = dashboard?.portfolio?.status || 'draft';
    const rejectionReason = dashboard?.portfolio?.rejection_reason;
    const reviewFeedback = dashboard?.portfolio?.review_feedback;
    const canResubmit = dashboard?.portfolio?.can_resubmit !== false;
    const daysRemaining = dashboard?.portfolio?.days_remaining || 0;
    const hoursRemaining = dashboard?.portfolio?.hours_remaining || 0;
    const minutesRemaining = dashboard?.portfolio?.minutes_remaining || 0;
    const isInCooldown = portfolioStatus === 'rejected' && !canResubmit;
    const currentRole = dashboard?.roles?.current || 'Droplet';
    const nextRole = dashboard?.roles?.next;
    const StatusIcon = statusColors[portfolioStatus]?.icon || FileText;
    const tabStyle = (active) => ({
        padding: '10px 18px',
        minHeight: '44px',
        background: active ? 'var(--color-primary)' : 'transparent',
        color: active ? 'var(--color-primary-text)' : 'var(--color-text-secondary)',
        border: 'none',
        borderRadius: 'var(--border-radius)',
        cursor: 'pointer',
        fontWeight: 600,
        fontSize: '14px',
        display: 'flex',
        alignItems: 'center',
        gap: '8px',
        transition: 'all 0.2s',
    });
    const isGuildStep = step === 'guild';
    const isFormStep = step === 'form';
    const hasStickyFlowBar = isGuildStep || isFormStep;
    const pageMaxWidth = isGuildStep ? '1320px' : isFormStep ? '980px' : '900px';
    const headerMarginBottom = isGuildStep ? '56px' : '32px';
    const showPageHeader = !isFormStep;
    const pendingTweet = parseTweetInput(newTweetUrl);
    const isPendingTweetDuplicate = Boolean(
        pendingTweet && availableTweets.some((url) => extractTweetId(url) === pendingTweet.tweetId)
    );
    const canAddPendingTweet = Boolean(pendingTweet && !isPendingTweetDuplicate);
    const formReadiness = [
        Boolean(formData.twitter_username?.trim()),
        availableTweets.length >= 6,
        Boolean(proofOfUsePreview),
    ];
    const formReadyCount = formReadiness.filter(Boolean).length;
    const submitChecklistMissing = [
        !formData.twitter_username?.trim() ? 'Twitter username' : null,
        availableTweets.length < 6 ? `at least 6 tweets (${availableTweets.length}/6)` : null,
        !proofOfUsePreview ? 'proof of use image' : null,
    ].filter(Boolean);
    const canSubmitReview = submitChecklistMissing.length === 0 && !isInCooldown;
    const totalOtherWorks = formData.other_works?.length || 0;
    const hasReachedOtherWorksLimit = totalOtherWorks >= MAX_OTHER_WORKS;
    const isDuplicateOtherWork = Boolean(
        newOtherWork.trim() &&
        normalizeOtherWorksValue(formData.other_works).some((existing) => existing === newOtherWork.trim())
    );
    const normalizedGuild = normalizeGuildId(formData.guild);
    const resolvedGuild = GUILDS.find((guild) => guild.id === normalizedGuild);
    const tweetInputHint = tweetInputError
        ? { tone: 'error', text: tweetInputError }
        : newTweetUrl.trim() && !pendingTweet
            ? { tone: 'error', text: 'Expected an X/Twitter status link or a numeric Tweet ID.' }
            : isPendingTweetDuplicate
                ? { tone: 'warning', text: 'This tweet is already in the list.' }
                : pendingTweet
                    ? {
                        tone: 'ok',
                        text: `Ready to add ${pendingTweet.username === 'i' ? 'tweet' : `@${pendingTweet.username}`} • ${pendingTweet.tweetId.slice(-8)}`,
                    }
                    : { tone: 'muted', text: 'Paste tweet URL and press Enter to add quickly.' };
    return (
        <div className={`portfolio-page page-reveal${hasStickyFlowBar ? ' portfolio-page--with-sticky-bar' : ''}`}>
            <div
                className="container"
                style={{
                    maxWidth: pageMaxWidth,
                    margin: '0 auto',
                    '--portfolio-page-max-width': pageMaxWidth,
                }}
            >
                {showPageHeader && (
                    <div style={{ textAlign: 'center', marginBottom: headerMarginBottom }}>
                        <div style={{
                            margin: '0 auto 24px',
                            width: '80px',
                            height: '80px',
                            background: 'linear-gradient(135deg, rgba(237, 237, 255, 0.1) 0%, rgba(224, 223, 239, 0.05) 100%)',
                            borderRadius: '50%',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            border: '1px solid var(--color-badge-border)'
                        }}>
                            <Briefcase size={40} style={{ color: 'var(--color-primary)' }} />
                        </div>
                        <h1 style={{
                            fontSize: '48px',
                            margin: '0 0 16px',
                            fontWeight: 700,
                            letterSpacing: '-0.02em',
                            background: 'linear-gradient(180deg, #FFFFFF 0%, #949494 100%)',
                            WebkitBackgroundClip: 'text',
                            WebkitTextFillColor: 'transparent',
                        }}>
                            {step === 'dashboard' ? 'Your Portfolio' : 'Apply for Promotion'}
                        </h1>
                        <p style={{ color: 'var(--color-text-secondary)', margin: 0, fontSize: '18px', maxWidth: '600px', marginInline: 'auto' }}>
                            Manage your portfolio, showcase your work, and level up in the Liquid ecosystem.
                        </p>
                    </div>
                )}
                {error && step !== 'guild' && (
                    <div style={{
                        padding: '16px',
                        borderRadius: '8px',
                        marginBottom: '24px',
                        background: 'var(--tone-danger-bg)',
                        color: 'var(--tone-danger)',
                        border: '1px solid var(--tone-danger)',
                        display: 'flex',
                        alignItems: 'flex-start',
                        gap: '12px',
                    }}>
                        <AlertCircle size={20} style={{ flexShrink: 0, marginTop: '2px' }} />
                        <div style={{ flex: 1 }}>
                            <div style={{ fontWeight: 600, marginBottom: '4px' }}>
                                {error.includes('submit new tweets') ? '⚠️ Previously Used Tweets' : 'Error'}
                            </div>
                            <p style={{ margin: 0, fontSize: '14px', lineHeight: '1.5' }}>
                                {error}
                            </p>
                        </div>
                    </div>
                )}
                {success && (
                    <div style={{ padding: '12px 16px', borderRadius: '8px', marginBottom: '24px', background: 'var(--tone-success-bg)', color: 'var(--tone-success)' }}>
                        {success}
                    </div>
                )}
                {step === 'guild' && (
                    <div style={{ maxWidth: '1400px', margin: '0 auto' }}>
                        <GuildSelect
                            selected={normalizedGuild}
                            onSelect={(guild) => setFormData({ ...formData, guild: normalizeGuildId(guild) })}
                            userGuilds={userGuilds}
                        />
                        <div className="portfolio-flow-bar portfolio-flow-bar--sticky">
                            <p className="portfolio-flow-note">
                                Select one guild to continue.
                            </p>
                            <button
                                onClick={() => setStep('form')}
                                disabled={!formData.guild}
                                type="button"
                                className="btn btn-primary portfolio-flow-continue-btn"
                            >
                                Continue
                                <ArrowRight size={18} />
                            </button>
                        </div>
                    </div>
                )}
                {step === 'form' && (
                    <div className="portfolio-form-layout">
                        <div className="portfolio-form-topbar">
                            <button
                                type="button"
                                onClick={() => setStep('guild')}
                                className="portfolio-back-btn"
                            >
                                <ArrowLeft size={16} />
                                Back
                            </button>
                            <div className="portfolio-form-context">
                                {resolvedGuild ? (
                                    <GuildBadge guildId={resolvedGuild.id} size="small" />
                                ) : normalizedGuild ? (
                                    <span className="portfolio-guild-pill">{normalizedGuild}</span>
                                ) : null}
                            </div>
                        </div>
                        <div className="portfolio-form-card portfolio-form-surface">
                            <div className="portfolio-form-strip">
                                <div className="portfolio-form-strip-copy">
                                    <span className="portfolio-form-strip-step">
                                        {formTab === 'tweets' ? 'Step 1 of 2' : formTab === 'details' ? 'Step 2 of 2' : ''}
                                    </span>
                                    <h2 className="portfolio-form-strip-title">
                                        {formTab === 'tweets' ? 'Tweets & Activity' : formTab === 'details' ? 'Application Details' : 'Submission History'}
                                    </h2>
                                    <p className="portfolio-form-strip-helper">
                                        {formTab === 'history' ? 'Track your portfolio submission timeline.' : 'Required to submit: Twitter username, 6 tweets, and proof of use image.'}
                                    </p>
                                </div>
                                <div className="portfolio-form-strip-metrics">
                                    <span className="portfolio-form-strip-metric">
                                        Tweets {availableTweets.length}
                                    </span>
                                    {formTab === 'details' && (
                                        <span className={`portfolio-form-strip-metric ${formReadyCount === 3 ? 'is-ready' : ''}`}>
                                            Submit ready {formReadyCount}/3
                                        </span>
                                    )}
                                </div>
                            </div>
                            {formTab === 'tweets' && (
                                <PortfolioTweetsStep
                                    formData={formData}
                                    setFormData={setFormData}
                                    labelStyle={labelStyle}
                                    inputStyle={inputStyle}
                                    cleanTwitterUsername={cleanTwitterUsername}
                                    newTweetUrl={newTweetUrl}
                                    setNewTweetUrl={setNewTweetUrl}
                                    tweetInputError={tweetInputError}
                                    setTweetInputError={setTweetInputError}
                                    addTweetUrl={addTweetUrl}
                                    canAddPendingTweet={canAddPendingTweet}
                                    tweetInputHint={tweetInputHint}
                                    availableTweets={availableTweets}
                                    clearAllTweets={clearAllTweets}
                                    parseTweetInput={parseTweetInput}
                                    removeTweet={removeTweet}
                                />
                            )}
                            {formTab === 'details' && (
                                <div className="portfolio-form-grid portfolio-form-grid--details">
                                    <div className="portfolio-field">
                                        <div className="portfolio-field-header">
                                            <label style={labelStyle}>
                                                <ExternalLink size={14} style={{ marginRight: '6px', verticalAlign: 'middle' }} />
                                                Other Works (optional)
                                            </label>
                                            <span className="portfolio-field-meta">
                                                {`${totalOtherWorks}/${MAX_OTHER_WORKS} links`}
                                            </span>
                                        </div>
                                        <p className="portfolio-muted-copy">
                                            Add links to your other work besides tweets (designs, articles, videos, etc.). You can add up to {MAX_OTHER_WORKS} links.
                                        </p>
                                        <div className="portfolio-input-row">
                                            <input
                                                type="text"
                                                className="portfolio-input"
                                                style={inputStyle}
                                                placeholder={hasReachedOtherWorksLimit ? `Limit reached (${MAX_OTHER_WORKS}/${MAX_OTHER_WORKS})` : 'https://...'}
                                                value={newOtherWork}
                                                onChange={(e) => setNewOtherWork(e.target.value)}
                                                onKeyDown={(e) => {
                                                    if (e.key === 'Enter') {
                                                        e.preventDefault();
                                                        addOtherWork();
                                                    }
                                                }}
                                                disabled={hasReachedOtherWorksLimit}
                                            />
                                            <button
                                                type="button"
                                                className="btn btn-primary portfolio-action-btn portfolio-action-btn--compact"
                                                onClick={addOtherWork}
                                                disabled={!newOtherWork.trim() || hasReachedOtherWorksLimit || isDuplicateOtherWork}
                                            >
                                                Add
                                            </button>
                                        </div>
                                        {hasReachedOtherWorksLimit && (
                                            <p className="portfolio-muted-copy" style={{ color: 'var(--tone-warning)' }}>
                                                Maximum reached: remove one link to add another.
                                            </p>
                                        )}
                                        {!hasReachedOtherWorksLimit && isDuplicateOtherWork && (
                                            <p className="portfolio-muted-copy" style={{ color: 'var(--tone-warning)' }}>
                                                This link is already in the list.
                                            </p>
                                        )}
                                        {formData.other_works && formData.other_works.length > 0 && (
                                            <div className="portfolio-list portfolio-list--tweets">
                                                {formData.other_works.map((link, i) => {
                                                    const meta = getLinkSummary(link);
                                                    return (
                                                        <div key={`${link}-${i}`} className="portfolio-list-item portfolio-list-item--tweet">
                                                            <div className="portfolio-tweet-main">
                                                                <span className="portfolio-tweet-icon" aria-hidden="true">
                                                                    <ExternalLink size={16} style={{ color: 'var(--tone-success)' }} />
                                                                </span>
                                                                <div className="portfolio-tweet-content">
                                                                    <div className="portfolio-tweet-top">
                                                                        <span className="portfolio-tweet-handle">{meta.host}</span>
                                                                        {meta.path && (
                                                                            <span className="portfolio-tweet-id">{meta.path}</span>
                                                                        )}
                                                                    </div>
                                                                    <span className="portfolio-list-item-text portfolio-list-item-text--tweet">{meta.label || link}</span>
                                                                </div>
                                                            </div>
                                                            <div className="portfolio-tweet-actions">
                                                                <a
                                                                    href={link}
                                                                    target="_blank"
                                                                    rel="noopener noreferrer"
                                                                    className="portfolio-icon-btn"
                                                                    aria-label="Open link"
                                                                >
                                                                    <ExternalLink size={14} />
                                                                </a>
                                                                <button
                                                                    type="button"
                                                                    className="portfolio-icon-btn portfolio-icon-btn--danger"
                                                                    onClick={() => setFormData({ ...formData, other_works: formData.other_works.filter((_, idx) => idx !== i) })}
                                                                    aria-label="Remove link"
                                                                >
                                                                    <Trash2 size={14} />
                                                                </button>
                                                            </div>
                                                        </div>
                                                    );
                                                })}
                                            </div>
                                        )}
                                    </div>
                                    <div className="portfolio-field">
                                        <label style={labelStyle}>
                                            <Image size={14} style={{ marginRight: '6px', verticalAlign: 'middle' }} />
                                            Proof of Use
                                            <span className="portfolio-required-tag">Required</span>
                                        </label>
                                        <p className="portfolio-muted-copy">
                                            Upload a screenshot proving active Liquid usage (max 1.1 MB).
                                        </p>
                                        <input
                                            type="file"
                                            accept="image/*"
                                            className="portfolio-input"
                                            onChange={(e) => {
                                                const file = e.target.files?.[0];
                                                if (!file) return;
                                                if (file.size > 1.1 * 1024 * 1024) {
                                                    setError('Image must be 1.1 MB or smaller.');
                                                    e.target.value = '';
                                                    return;
                                                }
                                                const reader = new FileReader();
                                                reader.onload = () => {
                                                    setProofOfUsePreview(reader.result);
                                                    setProofOfUseUpload(reader.result);
                                                    setProofOfUseFilename(file.name);
                                                };
                                                reader.readAsDataURL(file);
                                            }}
                                        />
                                        {proofOfUsePreview && (
                                            <div className="portfolio-proof-preview" style={{ marginTop: '12px' }}>
                                                <img
                                                    src={proofOfUsePreview}
                                                    alt="Proof of use preview"
                                                    style={{ maxWidth: '100%', borderRadius: '12px', border: '1px solid var(--color-badge-border)' }}
                                                />
                                            </div>
                                        )}
                                    </div>
                                </div>
                            )}
                            {formTab === 'history' && (
                                <PortfolioTimeline
                                    loadingTimeline={loadingTimeline}
                                    portfolioTimeline={portfolioTimeline}
                                />
                            )}
                        </div>
                        <div className="portfolio-flow-bar portfolio-flow-bar--sticky">
                            <div className="portfolio-form-tabs-track portfolio-form-tabs-track--actions">
                                <button
                                    type="button"
                                    className="portfolio-tab-btn"
                                    style={{
                                        ...tabStyle(formTab === 'tweets'),
                                        boxShadow: formTab === 'tweets' ? '0 6px 18px rgba(237, 237, 255, 0.22)' : 'none',
                                    }}
                                    onClick={() => setFormTab('tweets')}
                                >
                                    <Twitter size={16} />
                                    Your Tweets
                                </button>
                                <button
                                    type="button"
                                    className="portfolio-tab-btn"
                                    style={{
                                        ...tabStyle(formTab === 'details'),
                                        boxShadow: formTab === 'details' ? '0 6px 18px rgba(237, 237, 255, 0.22)' : 'none',
                                    }}
                                    onClick={() => setFormTab('details')}
                                >
                                    <FileText size={16} />
                                    Application Details
                                </button>
                                <button
                                    type="button"
                                    className="portfolio-tab-btn"
                                    style={{
                                        ...tabStyle(formTab === 'history'),
                                        boxShadow: formTab === 'history' ? '0 6px 18px rgba(237, 237, 255, 0.22)' : 'none',
                                    }}
                                    onClick={() => setFormTab('history')}
                                >
                                    <CalendarIcon size={16} />
                                    History
                                </button>
                            </div>
                            <div className="portfolio-actions">
                                {formTab === 'tweets' ? (
                                    <button
                                        type="button"
                                        className="btn btn-primary portfolio-flow-continue-btn"
                                        onClick={() => setFormTab('details')}
                                    >
                                        Continue
                                        <ArrowRight size={18} />
                                    </button>
                                ) : formTab === 'details' ? (
                                    <>
                                        <button
                                            type="button"
                                            className="btn btn-primary portfolio-action-btn"
                                            onClick={handleSubmitPortfolio}
                                            disabled={submitting || !canSubmitReview || isInCooldown}
                                            style={{ display: 'flex', alignItems: 'center', gap: '8px' }}
                                            title={isInCooldown ? 'Wait for cooldown to expire before resubmitting' : ''}
                                        >
                                            {isInCooldown ? (
                                                <>
                                                    <Clock size={16} />
                                                    {daysRemaining > 0 ? `${daysRemaining}d ${hoursRemaining}h` : `${hoursRemaining}h ${minutesRemaining}m`}
                                                </>
                                            ) : (
                                                <>
                                                    {submitting ? 'Submitting...' : 'Submit for Review'}
                                                    <ArrowRight size={18} />
                                                </>
                                            )}
                                        </button>
                                    </>
                                ) : null}
                            </div>
                        </div>
                    </div>
                )}
                {step === 'dashboard' && (
                    <div>
                        <div style={{ ...cardStyle, marginBottom: '24px' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '20px' }}>
                                {user?.avatar_url ? (
                                    <img src={user.avatar_url} alt="" style={{ width: '80px', height: '80px', borderRadius: '50%', border: '3px solid var(--color-primary)' }} />
                                ) : (
                                    <div style={{ width: '80px', height: '80px', borderRadius: '50%', background: 'linear-gradient(135deg, rgba(237, 237, 255, 0.35) 0%, rgba(224, 223, 239, 0.12) 100%)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '32px', fontWeight: 700, color: 'white' }}>
                                        {(user?.global_name || user?.username || 'U').charAt(0).toUpperCase()}
                                    </div>
                                )}
                                <div style={{ flex: 1 }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '8px' }}>
                                        <h1 style={{ fontSize: '28px', margin: 0, fontWeight: 700 }}>{user?.global_name || user?.username || 'User'}</h1>
                                        {formData.guild && <GuildBadge guildId={formData.guild} size="small" />}
                                    </div>
                                </div>
                                <div style={{
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: '8px',
                                    padding: '8px 16px',
                                    borderRadius: '20px',
                                    background: statusColors[portfolioStatus]?.bg,
                                    color: statusColors[portfolioStatus]?.color,
                                }}>
                                    <StatusIcon size={16} />
                                    <span style={{ fontWeight: 500, fontSize: '13px' }}>{portfolioStatus.replace('_', ' ').toUpperCase()}</span>
                                </div>
                                <button
                                    onClick={copyPortfolioLink}
                                    style={{
                                        display: 'flex',
                                        alignItems: 'center',
                                        gap: '8px',
                                        padding: '8px 16px',
                                        borderRadius: '20px',
                                        background: linkCopied ? 'var(--tone-success-bg)' : 'var(--surface-chip)',
                                        color: linkCopied ? 'var(--tone-success)' : 'var(--color-text)',
                                        border: '1px solid',
                                        borderColor: linkCopied ? 'var(--tone-success-border)' : 'var(--color-badge-border)',
                                        cursor: 'pointer',
                                        transition: 'all 0.2s',
                                        fontWeight: 500,
                                        fontSize: '13px',
                                    }}
                                    title="Copy portfolio link"
                                >
                                    {linkCopied ? <Check size={16} /> : <Share2 size={16} />}
                                    {linkCopied ? 'Copied!' : 'Share'}
                                </button>
                            </div>
                        </div>
                        {portfolioStatus === 'promoted' && (
                            <div style={{ ...cardStyle, marginBottom: '24px', borderColor: 'var(--tone-success-border)', background: 'var(--tone-success-bg)' }}>
                                <h4 style={{ margin: '0 0 12px', color: 'var(--tone-success)', display: 'flex', alignItems: 'center', gap: '8px', fontSize: '18px' }}>
                                    <CheckCircle size={20} />
                                    Promotion has been APPROVED!
                                </h4>
                                <p style={{ margin: 0, color: 'var(--color-text)', fontSize: '15px', lineHeight: '1.6' }}>
                                    Congratulations on your promotion! You can now apply for the next tier after the cooldown period expires.
                                </p>
                            </div>
                        )}
                        {portfolioStatus === 'draft' && reviewFeedback && (
                            <div style={{ ...cardStyle, marginBottom: '24px', borderColor: 'var(--tone-warning-border)', background: 'var(--tone-warning-bg)' }}>
                                <h4 style={{ margin: '0 0 12px', color: 'var(--tone-warning)', display: 'flex', alignItems: 'center', gap: '8px', fontSize: '18px' }}>
                                    <AlertCircle size={20} />
                                    Changes Requested
                                </h4>
                                <div style={{ padding: '16px', borderRadius: '8px', background: 'rgba(0,0,0,0.2)', border: '1px solid var(--color-badge-border)' }}>
                                    <p style={{ margin: 0, color: 'var(--color-text)', fontSize: '15px', lineHeight: '1.6', whiteSpace: 'pre-wrap' }}>
                                        {reviewFeedback}
                                    </p>
                                </div>
                                <p style={{ margin: '16px 0 0', color: 'var(--color-text-secondary)', fontSize: '14px' }}>
                                    Please make the requested changes and resubmit your portfolio.
                                </p>
                            </div>
                        )}
                        {portfolioStatus === 'rejected' && rejectionReason && (
                            <div style={{ ...cardStyle, marginBottom: '24px', borderColor: 'var(--tone-danger-border)', background: 'var(--tone-danger-bg)' }}>
                                <h4 style={{ margin: '0 0 12px', color: 'var(--tone-danger)', display: 'flex', alignItems: 'center', gap: '8px', fontSize: '18px' }}>
                                    <XCircle size={20} />
                                    Portfolio Rejected
                                </h4>
                                <div style={{ padding: '16px', borderRadius: '8px', background: 'rgba(0,0,0,0.2)', border: '1px solid var(--color-badge-border)' }}>
                                    <p style={{ margin: 0, color: 'var(--color-text)', fontSize: '15px', lineHeight: '1.6', whiteSpace: 'pre-wrap' }}>
                                        {rejectionReason}
                                    </p>
                                </div>
                            </div>
                        )}
                        {((portfolioStatus === 'rejected' && !canResubmit) || (portfolioStatus === 'promoted' && !canResubmit)) && (
                            <div style={{ ...cardStyle, marginBottom: '24px', borderColor: 'var(--tone-warning-border)', background: 'var(--tone-warning-bg)' }}>
                                <h4 style={{ margin: '0 0 8px', color: 'var(--tone-warning)', display: 'flex', alignItems: 'center', gap: '8px' }}>
                                    <Clock size={18} />
                                    {portfolioStatus === 'promoted' ? 'Promotion Cooldown' : 'Resubmission Cooldown'}
                                </h4>
                                <p style={{ margin: 0, color: 'var(--color-text-secondary)', fontSize: '15px' }}>
                                    {portfolioStatus === 'promoted' ? (
                                        <>
                                            You must wait before applying for the next tier. You can resubmit in{' '}
                                            <strong style={{ color: 'var(--tone-warning)' }}>{daysRemaining > 0 ? `${daysRemaining} day${daysRemaining !== 1 ? 's' : ''}` : `${hoursRemaining} hour${hoursRemaining !== 1 ? 's' : ''}`}</strong>
                                            {daysRemaining > 0 && <> and <strong style={{ color: 'var(--tone-warning)' }}>{hoursRemaining} hour{hoursRemaining !== 1 ? 's' : ''}</strong></>}
                                        </>
                                    ) : (
                                        <>
                                            You can resubmit your portfolio in <strong style={{ color: 'var(--tone-warning)' }}>{daysRemaining > 0 ? `${daysRemaining} day${daysRemaining !== 1 ? 's' : ''}` : `${hoursRemaining} hour${hoursRemaining !== 1 ? 's' : ''}`}</strong>
                                            {daysRemaining > 0 && <> and <strong style={{ color: 'var(--tone-warning)' }}>{hoursRemaining} hour{hoursRemaining !== 1 ? 's' : ''}</strong></>}
                                        </>
                                    )}
                                </p>
                            </div>
                        )}
                        {dashboard?.discord && (
                            <div style={{ marginBottom: '48px' }}>
                                <h3 style={{ margin: '0 0 24px', fontSize: '20px', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '10px' }}>
                                    <MessageSquare size={20} style={{ color: 'var(--color-primary)' }} />
                                    Discord Activity
                                </h3>
                                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '24px' }}>
                                    <StatsCard
                                        label="Total Messages"
                                        value={dashboard.discord.message_count?.toLocaleString()}
                                        icon={MessageSquare}
                                    />
                                    <StatsCard
                                        label="Days Active"
                                        value={dashboard.discord.days_active?.toString()}
                                        icon={ActivityIcon}
                                    />
                                    <StatsCard
                                        label="Joined Date"
                                        value={dashboard.discord.first_message_date}
                                        icon={CalendarIcon}
                                    />
                                </div>
                            </div>
                        )}
                        {tweetStats && tweetStats.tweet_count > 0 && (
                            <div style={{ marginBottom: '48px' }}>
                                <h3 style={{ margin: '0 0 24px', fontSize: '20px', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '10px' }}>
                                    <Twitter size={20} style={{ color: 'var(--tone-twitter)' }} />
                                    Twitter Engagement
                                </h3>
                                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '16px', marginBottom: '32px' }}>
                                    <StatsCard
                                        label="Total Likes"
                                        value={(tweetStats.total_likes || 0).toLocaleString()}
                                        icon={Heart}
                                    />
                                    <StatsCard
                                        label="Retweets"
                                        value={(tweetStats.total_retweets || 0).toLocaleString()}
                                        icon={Repeat2}
                                    />
                                    <StatsCard
                                        label="Views"
                                        value={(tweetStats.total_views || 0).toLocaleString()}
                                        icon={Eye}
                                    />
                                    <StatsCard
                                        label="Tracked Tweets"
                                        value={tweetStats.tweet_count || 0}
                                        icon={Twitter}
                                    />
                                </div>
                                {tweetStats.tweets && tweetStats.tweets.length > 0 && (
                                    <div style={{ ...cardStyle, marginTop: '24px' }}>
                                        <h4 style={{ margin: '0 0 20px', fontSize: '16px', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '8px' }}>
                                            <XLogo size={16} />
                                            Your Tweets
                                        </h4>
                                        <div className="portfolio-dashboard-tweets">
                                            {tweetStats.tweets.slice(0, 6).map((tweet, i) => (
                                                <TweetCard key={i} tweetUrl={tweet.url || `https://x.com/i/status/${tweet.tweet_id}`} useEmbed={true} />
                                            ))}
                                        </div>
                                    </div>
                                )}
                            </div>
                        )}
                        {dashboard?.portfolio?.data && (() => {
                            const portfolioData = dashboard.portfolio.data || {};
                            console.log('[Portfolio Dashboard] Raw other_works:', portfolioData.other_works);
                            const otherWorks = normalizeOtherWorksValue(portfolioData.other_works);
                            console.log('[Portfolio Dashboard] Normalized other_works:', otherWorks);
                            const selectedTweets = Array.isArray(portfolioData.selected_tweets)
                                ? portfolioData.selected_tweets
                                : [];
                            const topContent = `${portfolioData.top_content || portfolioData.achievements || ''}`.trim();
                            const proofOfUseImageUrl = portfolioData.proof_of_use_filename
                                ? `${API_BASE}/api/portfolio/${discordId}/proof-image`
                                : '';
                            return (
                                <div className="portfolio-dashboard-grid">
                                    {topContent && (
                                        <div style={{ ...cardStyle }} className="portfolio-dashboard-card">
                                            <h3 className="portfolio-dashboard-title">
                                                <BarChart3 size={18} />
                                                Top Content Highlights
                                            </h3>
                                            <div className="portfolio-dashboard-text">{formatContentHighlightsAsLinks(topContent)}</div>
                                        </div>
                                    )}
                                    <div style={{ ...cardStyle }} className="portfolio-dashboard-card">
                                        <h3 className="portfolio-dashboard-title">
                                            <ExternalLink size={18} />
                                            Other Works
                                        </h3>
                                        {otherWorks.length > 0 ? (
                                            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                                                {otherWorks.map((link, i) => {
                                                    const meta = getLinkSummary(link);
                                                    return (
                                                        <a
                                                            key={`${link}-${i}`}
                                                            href={link}
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
                                                                    {meta.label || link}
                                                                </div>
                                                            </div>
                                                            <ExternalLink size={14} style={{ color: '#8b5cf6', flexShrink: 0, opacity: 0.6 }} />
                                                        </a>
                                                    );
                                                })}
                                            </div>
                                        ) : (
                                            <p className="portfolio-dashboard-empty">No other works added yet.</p>
                                        )}
                                    </div>
                                    <div style={{ ...cardStyle }} className="portfolio-dashboard-card">
                                        <h3 className="portfolio-dashboard-title">
                                            <Eye size={18} />
                                            Proof Of Use
                                        </h3>
                                        {proofOfUseImageUrl ? (
                                            <img
                                                src={proofOfUseImageUrl}
                                                alt="Proof of use"
                                                style={{ width: '100%', borderRadius: '12px', border: '1px solid var(--color-badge-border)' }}
                                            />
                                        ) : (
                                            <p className="portfolio-dashboard-empty">No proof image uploaded yet.</p>
                                        )}
                                    </div>
                                </div>
                            );
                        })()}
                        {(portfolioStatus === 'submitted' || portfolioStatus === 'pending_vote') && (
                            <div style={{
                                ...cardStyle,
                                marginBottom: '24px',
                                borderColor: portfolioStatus === 'pending_vote' ? 'var(--tone-warning-border)' : 'var(--tone-info-border)',
                                background: portfolioStatus === 'pending_vote' ? 'var(--tone-warning-bg)' : 'var(--tone-info-bg)'
                            }}>
                                <h4 style={{ margin: '0 0 8px', color: portfolioStatus === 'pending_vote' ? 'var(--tone-warning)' : 'var(--tone-info)' }}>
                                    {portfolioStatus === 'pending_vote' ? 'Finalizing approval' : '📋 Under Review'}
                                </h4>
                                <p style={{ margin: 0, color: 'var(--color-text-secondary)' }}>
                                    {portfolioStatus === 'pending_vote'
                                        ? 'Your portfolio has been approved and is being finalized. You cannot make changes during this short step.'
                                        : 'Your portfolio is being reviewed by a Guild Leader. You will be notified when a decision is made.'}
                                </p>
                            </div>
                        )}
                        {(portfolioStatus === 'draft' || portfolioStatus === 'rejected' || portfolioStatus === 'promoted') && (
                            <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
                                <button
                                    className="btn"
                                    onClick={() => setStep('guild')}
                                    style={{ display: 'flex', alignItems: 'center', gap: '8px' }}
                                >
                                    <Edit3 size={16} /> Edit Portfolio
                                </button>
                                <button
                                    className="btn btn-primary"
                                    onClick={handleSubmitPortfolio}
                                    disabled={submitting || !canResubmit}
                                    style={{
                                        display: 'flex',
                                        alignItems: 'center',
                                        gap: '8px',
                                        position: 'relative'
                                    }}
                                    title={!canResubmit ? `Wait for cooldown to expire before resubmitting` : ''}
                                >
                                    {!canResubmit ? (
                                        <>
                                            <Clock size={16} />
                                            {daysRemaining > 0 ? `Submit in ${daysRemaining}d ${hoursRemaining}h` : `Submit in ${hoursRemaining}h ${minutesRemaining}m`}
                                        </>
                                    ) : (
                                        <>
                                            Submit for Review <ArrowRight size={18} />
                                        </>
                                    )}
                                </button>
                            </div>
                        )}
                        {portfolioStatus !== 'draft' && portfolioStatus !== 'rejected' && portfolioStatus !== 'promoted' && (
                            <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
                                <button
                                    className="btn btn-primary"
                                    onClick={() => navigate(`/portfolios/${discordId}`)}
                                    style={{ display: 'flex', alignItems: 'center', gap: '8px' }}
                                >
                                    <ExternalLink size={16} /> View Your Portfolio
                                </button>
                            </div>
                        )}
                    </div>
                )}
            </div>
            {isSubmitModalOpen && (
                <ModalPortal>
                    <div
                        onClick={() => setIsSubmitModalOpen(false)}
                        style={{
                            position: 'fixed',
                            inset: 0,
                            background: 'var(--modal-overlay-bg)',
                            backdropFilter: 'blur(8px)',
                            zIndex: 1000,
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            padding: '20px',
                        }}
                    >
                        <div
                            onClick={(e) => e.stopPropagation()}
                            style={{
                                width: '100%',
                                maxWidth: '700px',
                                background: 'var(--modal-surface-bg)',
                                border: '1px solid var(--color-badge-border)',
                                borderRadius: '24px',
                                padding: '28px',
                                boxShadow: '0 24px 64px rgba(0,0,0,0.46)',
                                backdropFilter: 'blur(20px)',
                                boxSizing: 'border-box',
                            }}
                        >
                            <div style={{ display: 'flex', alignItems: 'flex-start', gap: '16px', marginBottom: '16px' }}>
                                <div
                                    style={{
                                        width: 56,
                                        height: 56,
                                        borderRadius: 18,
                                        background: 'var(--tone-warning-bg)',
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'center',
                                        border: '1px solid var(--color-badge-border)',
                                        flexShrink: 0,
                                    }}
                                >
                                    <AlertCircle size={26} style={{ color: 'var(--tone-warning)' }} />
                                </div>
                                <div style={{ minWidth: 0, flex: 1 }}>
                                    <div style={{ fontWeight: 700, fontSize: '20px', lineHeight: 1.28, color: 'var(--color-text)' }}>
                                        Submit portfolio for review?
                                    </div>
                                    <div style={{ fontSize: '16px', lineHeight: 1.35, color: 'var(--color-text-secondary)', marginTop: 6 }}>
                                        You won't be able to edit it while it's under review
                                    </div>
                                </div>
                            </div>
                            <div
                                style={{
                                    padding: '18px 20px',
                                    borderRadius: 16,
                                    background: 'var(--modal-muted-bg)',
                                    border: '1px solid var(--color-badge-border)',
                                    color: 'var(--color-text-secondary)',
                                    fontSize: '15px',
                                    lineHeight: 1.35,
                                    marginBottom: '24px',
                                    overflow: 'hidden',
                                    wordBreak: 'break-word',
                                }}
                            >
                                Make sure your Twitter username and tweets are correct. After submitting, edits are locked until a reviewer makes a decision.<br /><br />If your portfolio is rejected, you get a personal message explaining exactly why and what to work on.
                            </div>
                            <div style={{ display: 'flex', gap: 12, justifyContent: 'flex-end', flexWrap: 'wrap', flexDirection: 'row-reverse' }}>
                                <button
                                    className="btn btn-primary"
                                    onClick={submitPortfolioConfirmed}
                                    disabled={submitting}
                                    style={{
                                        minHeight: 30,
                                        padding: '10px 20px',
                                        borderRadius: 999,
                                        fontSize: '16px',
                                        display: 'flex',
                                        alignItems: 'center',
                                        gap: 12,
                                        flex: '0 1 auto',
                                    }}
                                >
                                    {submitting ? 'Submitting...' : 'Yes, submit'}
                                    <ArrowRight size={22} />
                                </button>
                                <button
                                    className="btn"
                                    onClick={() => setIsSubmitModalOpen(false)}
                                    style={{
                                        minHeight: 30,
                                        padding: '10px 20px',
                                        borderRadius: 999,
                                        fontSize: '16px',
                                        background: 'transparent',
                                        border: '1px solid var(--color-badge-border)',
                                        color: 'var(--color-text-secondary)',
                                        flex: '0 1 auto',
                                    }}
                                >
                                    Cancel
                                </button>
                            </div>
                        </div>
                    </div>
                </ModalPortal>
            )}
        </div>
    );
};
export default Portfolio;
