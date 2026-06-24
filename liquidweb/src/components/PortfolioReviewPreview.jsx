import React, { useState } from 'react';
import {
    AlertCircle,
    Check,
    ChevronDown,
    Copy,
    ExternalLink,
    FileText,
    PanelRightClose,
    Save,
    X,
} from 'lucide-react';
import { GUILDS } from './GuildSelect';
import { TweetCard } from './TweetEmbed';
const STATUS_META = {
    draft: {
        label: 'Draft',
        color: 'var(--tone-neutral)',
        bg: 'var(--tone-neutral-bg)',
        border: 'var(--tone-neutral-border)',
    },
    submitted: {
        label: 'Pending Review',
        color: 'var(--tone-info)',
        bg: 'var(--tone-info-bg)',
        border: 'var(--tone-info-border)',
    },
    pending_vote: {
        label: 'Finalizing',
        color: 'var(--tone-warning)',
        bg: 'var(--tone-warning-bg)',
        border: 'var(--tone-warning-border)',
    },
    approved: {
        label: 'Approved',
        color: 'var(--tone-success)',
        bg: 'var(--tone-success-bg)',
        border: 'var(--tone-success-border)',
    },
    rejected: {
        label: 'Rejected',
        color: 'var(--tone-danger)',
        bg: 'var(--tone-danger-bg)',
        border: 'var(--tone-danger-border)',
    },
    promoted: {
        label: 'Promoted',
        color: 'var(--tone-promo)',
        bg: 'var(--tone-promo-bg)',
        border: 'var(--tone-promo-border)',
    },
};
const XLogo = ({ size = 18 }) => (
    <img
        src="/Xlogo.png"
        alt="X"
        style={{ width: size, height: size, objectFit: 'contain' }}
    />
);
function normalizeTwitterHandle(handle = '') {
    return `${handle || ''}`.trim().replace(/^@+/, '');
}
function toHandleKey(handle = '') {
    const normalized = normalizeTwitterHandle(handle);
    if (!normalized) return '';
    return normalized.toLowerCase();
}
function resolveGuildId(targetRole = '') {
    const normalized = `${targetRole || ''}`.trim().toLowerCase();
    if (!normalized) return null;
    const byId = GUILDS.find((guild) => guild.id === normalized);
    if (byId) return byId.id;
    const byName = GUILDS.find((guild) => {
        const fullName = guild.name.toLowerCase();
        const shortName = fullName.replace(/\s+guild$/, '').trim();
        return normalized === fullName || normalized === shortName;
    });
    return byName ? byName.id : null;
}
function formatDisplayDate(dateValue) {
    if (!dateValue) return 'вЂ”';
    const parsedDate = new Date(dateValue);
    if (Number.isNaN(parsedDate.getTime())) return 'вЂ”';
    return parsedDate.toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
    });
}
function getTimelineActionLabel(entry) {
    if (entry?.action === 'create') return 'Portfolio Created';
    if (entry?.action === 'submit') return 'Submitted for Review';
    if (entry?.action === 'approve') return 'Approved by Reviewer';
    if (entry?.action === 'reject') return 'Rejected by Reviewer';
    if (entry?.action === 'request_changes') return 'Changes Requested';
    if (entry?.action === 'promoted') return 'Promotion Approved';
    if (entry?.action === 'promotion_rejected') return 'Promotion Rejected';
    return 'Updated';
}
function parseReviewFeedback(text) {
    if (!text || typeof text !== 'string') return null;
    const approvedBlock = text.match(/- \*\*approved\*\*\n([\s\S]*?)(?=\n- \*\*rejected\*\*|$)/i);
    const rejectedBlock = text.match(/- \*\*rejected\*\*\n([\s\S]*?)$/i);
    const extractItems = (match) => {
        if (!match || !match[1]) return [];
        const lines = match[1].split('\n');
        const items = [];
        let current = '';
        for (const line of lines) {
            const isBullet = /^\s*-\s+/.test(line);
            const isIndented = /^\s+/.test(line) && !isBullet;
            if (isBullet) {
                if (current) items.push(current);
                current = line.replace(/^\s*-\s+/, '').trim();
            } else if (isIndented && current) {
                current += `\n${line.trim()}`;
            }
        }
        if (current) items.push(current);
        return items.filter((item) => item && item.toLowerCase() !== 'none');
    };
    const approved = extractItems(approvedBlock);
    const rejected = extractItems(rejectedBlock);
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
        const parsed = parseReviewFeedback(entry?.notes || '');
        return {
            title: 'Reviewer Feedback',
            content: entry?.notes || 'No feedback provided.',
            parsed,
        };
    }
    return null;
}
function toOptionalNumber(value) {
    if (value === null || value === undefined || value === '') return null;
    const normalizedValue = Number(value);
    return Number.isFinite(normalizedValue) ? normalizedValue : null;
}
function formatCompactNumber(value) {
    const normalizedValue = toOptionalNumber(value);
    if (normalizedValue === null) return '—';
    return new Intl.NumberFormat('en-US', {
        notation: 'compact',
        compactDisplay: 'short',
        maximumFractionDigits: 1,
    }).format(normalizedValue);
}
function buildInitials(value = 'User') {
    const cleaned = `${value || ''}`.trim();
    if (!cleaned) return 'U';
    return cleaned.charAt(0).toUpperCase();
}
function StatusBadge({ status }) {
    const meta = STATUS_META[status] || STATUS_META.draft;
    return (
        <span
            className="pr-badge pr-status"
            style={{
                '--_c': meta.color,
                '--_bg': meta.bg,
                '--_b': meta.border,
            }}
            title={meta.label}
        >
            <span className="pr-badge-dot" aria-hidden="true" />
            {meta.label}
        </span>
    );
}
function GuildLabel({ guildId }) {
    const guild = GUILDS.find((g) => g.id === guildId);
    if (!guild) return <span className="pr-dim">Unknown guild</span>;
    const Icon = guild.icon;
    return (
        <span className="pr-guildLabel" title={guild.name}>
            {Icon ? <Icon size={14} aria-hidden="true" /> : null}
            <span>{guild.name}</span>
        </span>
    );
}
function Avatar({ src, label }) {
    return (
        <div className="pr-avatar" aria-hidden="true">
            {src ? (
                <img src={src} alt="" loading="lazy" />
            ) : (
                <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--color-text-secondary)' }}>
                    {buildInitials(label)}
                </span>
            )}
        </div>
    );
}
export default function PortfolioReviewPreview({
    portfolio,
    twitterProfile,
    tweetStats,
    loadingStats,
    portfolioTimeline,
    loadingTimeline,
    canReview,
    reviewing,
    reviewNote,
    onChangeNote,
    onSaveNote,
    onClearNote,
    closeVariant = 'hide',
    onClose,
    onReview,
    onDeletePortfolio,
    onDeleteUser,
    onOpenRejectModal,
}) {
    const [copied, setCopied] = useState(false);
    const [tweetsOpen, setTweetsOpen] = useState(false);
    const [noteSavedFlash, setNoteSavedFlash] = useState(false);
    const guildId = resolveGuildId(portfolio?.target_role);
    const profileImage =
        twitterProfile?.profile_picture?.replace('_normal', '_400x400') || portfolio?.avatar_url || '';
    const displayName = twitterProfile?.name || portfolio?.username || portfolio?.twitter_handle || 'User';
    const portfolioUrl = portfolio ? `${window.location.origin}/portfolios/${portfolio.discord_id}` : '';
    const xUsername = normalizeTwitterHandle(portfolio?.twitter_handle || twitterProfile?.username || '');
    const tweetsCount = tweetStats?.tweets?.length || portfolio?.tweets?.length || 0;
    const canTakeReviewAction = canReview && portfolio?.status === 'submitted';
    const handleCopyLink = async () => {
        if (!portfolioUrl) return;
        try {
            await navigator.clipboard.writeText(portfolioUrl);
            setCopied(true);
            window.setTimeout(() => setCopied(false), 2000);
        } catch {
        }
    };
    const workflowCopy = (() => {
        const status = portfolio?.status;
        if (status === 'submitted') {
            return {
                tone: 'info',
                title: 'Review flow',
                text: 'Approve finalizes the portfolio immediately. Reject or Request Changes sends feedback to the creator.',
            };
        }
        if (status === 'pending_vote') {
            return {
                tone: 'info',
                title: 'Finalizing',
                text: 'The portfolio is being finalized by the backend. This should resolve automatically.',
            };
        }
        return {
            tone: 'muted',
            title: 'Status',
            text: 'This portfolio is no longer in the review queue.',
        };
    })();
    const handleSaveNote = () => {
        if (!portfolio?.discord_id) return;
        onSaveNote?.(portfolio.discord_id, reviewNote);
        setNoteSavedFlash(true);
        window.setTimeout(() => setNoteSavedFlash(false), 1600);
    };
    const handleClearNote = () => {
        if (!portfolio?.discord_id) return;
        onClearNote?.(portfolio.discord_id);
    };
    if (!portfolio) {
        return (
            <div className="pr-preview-empty">
                <div className="pr-preview-empty-icon" aria-hidden="true">
                    <FileText size={22} />
                </div>
                <h3 className="pr-preview-empty-title">Select a portfolio</h3>
                <p className="pr-preview-empty-subtitle">
                    Click a row to open a fast preview with tweets and review actions.
                </p>
            </div>
        );
    }
    return (
        <div className="pr-preview">
            <div className="pr-preview-head">
                <div className="pr-preview-head-left">
                    <Avatar src={profileImage} label={displayName} />
                    <div className="pr-preview-identity">
                        <div className="pr-preview-name-row">
                            <div className="pr-preview-name">{displayName}</div>
                            <StatusBadge status={portfolio.status} />
                        </div>
                        <div className="pr-preview-subline">
                            {xUsername ? (
                                <a
                                    className="pr-preview-handle"
                                    href={`https://x.com/${xUsername}`}
                                    target="_blank"
                                    rel="noreferrer"
                                    title="Open X profile"
                                >
                                    <XLogo size={14} />
                                    @{xUsername}
                                    <ExternalLink size={14} />
                                </a>
                            ) : (
                                <span className="pr-preview-handle pr-preview-handle--muted">
                                    <XLogo size={14} />
                                    No X handle
                                </span>
                            )}
                        </div>
                    </div>
                </div>
                <div className="pr-preview-head-actions">
                    <button
                        className={`pr-icon-btn ${copied ? 'is-on' : ''}`}
                        type="button"
                        onClick={handleCopyLink}
                        title={copied ? 'Copied!' : 'Copy portfolio link'}
                    >
                        {copied ? <Check size={16} /> : <Copy size={16} />}
                    </button>
                    <a
                        className="pr-icon-btn"
                        href={portfolioUrl}
                        target="_blank"
                        rel="noreferrer"
                        title="Open full portfolio page"
                    >
                        <ExternalLink size={16} />
                    </a>
                    <button
                        className="pr-icon-btn"
                        type="button"
                        onClick={onClose}
                        title={closeVariant === 'close' ? 'Close' : 'Hide preview'}
                        aria-label={closeVariant === 'close' ? 'Close' : 'Hide preview'}
                    >
                        {closeVariant === 'close' ? <X size={16} /> : <PanelRightClose size={16} />}
                    </button>
                </div>
            </div>
            <div className="pr-preview-meta">
                <div className="pr-preview-meta-item">
                    <div className="pr-preview-meta-label">Guild</div>
                    <div className="pr-preview-meta-value">
                        {guildId ? <GuildLabel guildId={guildId} /> : <span className="pr-dim">Unknown</span>}
                    </div>
                </div>
                <div className="pr-preview-meta-item">
                    <div className="pr-preview-meta-label">Followers</div>
                    <div className="pr-preview-meta-value">{formatCompactNumber(twitterProfile?.followers)}</div>
                </div>
                <div className="pr-preview-meta-item">
                    <div className="pr-preview-meta-label">Tweets</div>
                    <div className="pr-preview-meta-value">{portfolio.tweets?.length || 0}</div>
                </div>
                <div className="pr-preview-meta-item">
                    <div className="pr-preview-meta-label">Submitted</div>
                    <div className="pr-preview-meta-value">{formatDisplayDate(portfolio.submitted_at)}</div>
                </div>
            </div>
            {portfolioTimeline && portfolioTimeline.length > 0 ? (
                <div className="pr-timeline">
                    <div className="pr-timeline-title">Portfolio History</div>
                    {portfolioTimeline[0]?.target_role ? (
                        <div className="pr-timeline-header">Applied for {portfolioTimeline[0].target_role}</div>
                    ) : null}
                    <div className="pr-timeline-list">
                        {portfolioTimeline.map((entry, idx) => {
                            const subsection = getTimelineSubsection(entry);
                            const showNotes = entry.notes && !subsection;
                            return (
                                <div key={entry.id} className="pr-timeline-item">
                                    <div className="pr-timeline-marker" />
                                    <div className="pr-timeline-content">
                                        <div className="pr-timeline-date">
                                            {formatDisplayDate(entry.changed_at)}
                                        </div>
                                        <div className="pr-timeline-action">
                                            <span className="pr-timeline-action-label">
                                                {getTimelineActionLabel(entry)}
                                            </span>
                                        </div>
                                        {subsection ? (
                                            <div className="pr-timeline-subsection">
                                                <div className="pr-timeline-subsection-title">{subsection.title}</div>
                                                {subsection.parsed ? (
                                                    <div className="pr-review-feedback">
                                                        <div className="pr-review-feedback-section">
                                                            <strong className="pr-review-feedback-heading">Approved</strong>
                                                            <ul className="pr-review-feedback-list">
                                                                {subsection.parsed.approved.length > 0
                                                                    ? subsection.parsed.approved.map((line, index) => <li key={`a-${index}`}>{line}</li>)
                                                                    : <li className="pr-review-feedback-empty">none</li>
                                                                }
                                                            </ul>
                                                        </div>
                                                        <div className="pr-review-feedback-section">
                                                            <strong className="pr-review-feedback-heading">Rejected</strong>
                                                            <ul className="pr-review-feedback-list">
                                                                {subsection.parsed.rejected.length > 0
                                                                    ? subsection.parsed.rejected.map((line, index) => <li key={`r-${index}`}>{line}</li>)
                                                                    : <li className="pr-review-feedback-empty">none</li>
                                                                }
                                                            </ul>
                                                        </div>
                                                    </div>
                                                ) : (
                                                    <div className="pr-timeline-subsection-content">{subsection.content}</div>
                                                )}
                                            </div>
                                        ) : null}
                                        {showNotes ? (
                                            <div className="pr-timeline-notes">{entry.notes}</div>
                                        ) : null}
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </div>
            ) : loadingTimeline ? (
                <div className="pr-timeline-loading">Loading timeline...</div>
            ) : null}
            <div className={`pr-callout pr-callout--${workflowCopy.tone}`}>
                <div className="pr-callout-icon" aria-hidden="true">
                    <AlertCircle size={16} />
                </div>
                <div className="pr-callout-copy">
                    <div className="pr-callout-title">{workflowCopy.title}</div>
                    <div className="pr-callout-text">{workflowCopy.text}</div>
                </div>
            </div>
            {canTakeReviewAction ? (
                <div className="pr-preview-note">
                    <div className="pr-note-head">
                        <label className="pr-preview-note-label" htmlFor="pr-review-note">
                            Note to creator (optional)
                        </label>
                        <div className="pr-note-actions">
                            <button
                                className={`pr-note-btn ${noteSavedFlash ? 'is-saved' : ''}`}
                                type="button"
                                onClick={handleSaveNote}
                                title="Save note draft"
                            >
                                {noteSavedFlash ? <Check size={14} /> : <Save size={14} />}
                                {noteSavedFlash ? 'Saved' : 'Save'}
                            </button>
                            <button className="pr-note-btn pr-note-btn--ghost" type="button" onClick={handleClearNote} title="Clear note">
                                <X size={14} />
                                Clear
                            </button>
                        </div>
                    </div>
                    <div className="pr-note-hint">
                        Drafts are saved locally. The note is sent when you click Approve / Reject / Request Changes.
                    </div>
                    <textarea
                        id="pr-review-note"
                        className="pr-textarea"
                        value={reviewNote}
                        onChange={(e) => onChangeNote(e.target.value)}
                        placeholder="Leave context for approve / request changes / reject..."
                        rows={2}
                    />
                </div>
            ) : null}
            {tweetStats && tweetStats.tweet_count > 0 && (
                <div className="pr-preview-metrics">
                    <div className="pr-metric">
                        <div className="pr-metric-label">Likes</div>
                        <div className="pr-metric-value">{formatCompactNumber(tweetStats.total_likes || 0)}</div>
                    </div>
                    <div className="pr-metric">
                        <div className="pr-metric-label">Retweets</div>
                        <div className="pr-metric-value">{formatCompactNumber(tweetStats.total_retweets || 0)}</div>
                    </div>
                    <div className="pr-metric">
                        <div className="pr-metric-label">Replies</div>
                        <div className="pr-metric-value">{formatCompactNumber(tweetStats.total_replies || 0)}</div>
                    </div>
                    <div className="pr-metric">
                        <div className="pr-metric-label">Views</div>
                        <div className="pr-metric-value">{formatCompactNumber(tweetStats.total_views || 0)}</div>
                    </div>
                </div>
            )}
            {loadingStats && <div className="pr-preview-loading">Loading X stats...</div>}
            {tweetsCount > 0 ? (
                <section className="pr-fold" aria-label="Tweets">
                    <button
                        className="pr-fold-summary"
                        type="button"
                        aria-expanded={tweetsOpen ? 'true' : 'false'}
                        onClick={() => setTweetsOpen((v) => !v)}
                    >
                        <span className="pr-fold-title">Tweets</span>
                        <span className="pr-fold-meta">{tweetsCount} shared</span>
                        <ChevronDown className={`pr-fold-chevron ${tweetsOpen ? 'is-open' : ''}`} size={18} aria-hidden="true" />
                    </button>
                    {tweetsOpen ? (
                        <div className="pr-fold-body">
                            {tweetStats?.tweets?.length > 0 ? (
                                <div className="pr-preview-tweet-grid">
                                    {tweetStats.tweets.slice(0, 4).map((tweet) => (
                                        <TweetCard key={tweet.url} tweetUrl={tweet.url} useEmbed={true} />
                                    ))}
                                </div>
                            ) : (
                                <div className="pr-preview-tweet-grid">
                                    {(portfolio?.tweets || []).slice(0, 4).map((tweet) => (
                                        <TweetCard key={tweet.tweet_url} tweetUrl={tweet.tweet_url} useEmbed={true} />
                                    ))}
                                </div>
                            )}
                        </div>
                    ) : null}
                </section>
            ) : null}
            {canTakeReviewAction ? (
                <div className="pr-preview-actions">
                    <button
                        className="pr-btn"
                        type="button"
                        disabled={reviewing}
                        onClick={() => onReview('request_changes', portfolio.discord_id, reviewNote)}
                    >
                        <AlertCircle size={16} />
                        {reviewing ? 'Sending...' : 'Request Changes'}
                    </button>
                    <button
                        className="pr-btn pr-btn--danger"
                        type="button"
                        disabled={reviewing}
                        onClick={() => onOpenRejectModal?.(portfolio.discord_id, reviewNote)}
                    >
                        <X size={16} />
                        Reject
                    </button>
                    <button
                        className="pr-btn pr-btn--primary"
                        type="button"
                        disabled={reviewing}
                        onClick={() => onReview('approve', portfolio.discord_id, reviewNote)}
                    >
                        <Check size={16} />
                        {reviewing ? 'Sending...' : 'Approve'}
                    </button>
                </div>
            ) : (
                <div className="pr-preview-actions-note">
                    {canReview ? 'Review actions are available only for Pending Review items.' : 'You do not have reviewer permissions.'}
                </div>
            )}
            {canReview && (
                <div style={{ marginTop: '16px', paddingTop: '16px', borderTop: '1px solid var(--color-badge-border)', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    <button
                        className="pr-btn pr-btn--danger"
                        type="button"
                        disabled={reviewing}
                        onClick={() => onDeletePortfolio?.(portfolio.discord_id)}
                        title="Delete this portfolio only"
                        style={{ width: '100%', fontSize: '13px' }}
                    >
                        <X size={16} />
                        Delete Portfolio
                    </button>
                    <button
                        className="pr-btn"
                        type="button"
                        disabled={reviewing}
                        onClick={() => onDeleteUser?.(portfolio.discord_id)}
                        title="Delete user and ALL associated data (portfolios, history, guild membership, etc.)"
                        style={{
                            width: '100%',
                            fontSize: '13px',
                            backgroundColor: '#991b1b',
                            color: 'white',
                            border: '1px solid #7f1d1d'
                        }}
                    >
                        <X size={16} />
                        Delete User (Permanent)
                    </button>
                </div>
            )}
        </div>
    );
}
export {
    StatusBadge,
    GuildLabel,
    Avatar,
    normalizeTwitterHandle,
    toHandleKey,
    resolveGuildId,
    formatDisplayDate,
    formatCompactNumber,
};
