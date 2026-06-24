import React from 'react';
import { ExternalLink, Trash2, Trophy, Twitter } from 'lucide-react';
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
function PortfolioTweetsStep({
    formData,
    setFormData,
    labelStyle,
    inputStyle,
    cleanTwitterUsername,
    newTweetUrl,
    setNewTweetUrl,
    tweetInputError,
    setTweetInputError,
    addTweetUrl,
    canAddPendingTweet,
    tweetInputHint,
    availableTweets,
    clearAllTweets,
    parseTweetInput,
    removeTweet,
}) {
    return (
        <div className="portfolio-form-grid">
            <div className="portfolio-field portfolio-field--full">
                <label style={labelStyle}>
                    <Twitter size={14} style={{ marginRight: '6px', verticalAlign: 'middle' }} />
                    Twitter/X Username
                    <span className="portfolio-required-tag">Required</span>
                </label>
                <input
                    type="text"
                    className="portfolio-input"
                    style={inputStyle}
                    placeholder="username (without @)"
                    value={formData.twitter_username}
                    onChange={(event) => setFormData({ ...formData, twitter_username: cleanTwitterUsername(event.target.value) })}
                />
            </div>
            <div className="portfolio-field portfolio-field--full">
                <label style={labelStyle}>Add Tweet URL</label>
                <div className="portfolio-input-row">
                    <input
                        type="text"
                        className="portfolio-input"
                        style={inputStyle}
                        placeholder="https://x.com/user/status/123456789"
                        value={newTweetUrl}
                        onChange={(event) => {
                            setNewTweetUrl(event.target.value);
                            if (tweetInputError) {
                                setTweetInputError('');
                            }
                        }}
                        onKeyDown={(event) => event.key === 'Enter' && addTweetUrl()}
                    />
                    <button
                        type="button"
                        className="btn btn-primary portfolio-action-btn portfolio-action-btn--compact"
                        onClick={addTweetUrl}
                        disabled={!canAddPendingTweet}
                    >
                        Add
                    </button>
                </div>
                <p className={`portfolio-input-helper portfolio-input-helper--${tweetInputHint.tone}`}>
                    {tweetInputHint.text}
                </p>
            </div>
            <div className="portfolio-field">
                <div className="portfolio-field-header">
                    <label style={labelStyle}>
                        Selected Tweets ({availableTweets.length}/6 minimum)
                        <span className="portfolio-required-tag">Required</span>
                    </label>
                    <div className="portfolio-field-header-actions">
                        <span
                            className="portfolio-field-meta"
                            style={{
                                color: availableTweets.length >= 6 ? 'var(--color-success)' : 'var(--color-text-secondary)',
                            }}
                        >
                            {availableTweets.length >= 6 ? '✓ Ready to submit' : `${6 - availableTweets.length} more needed`}
                        </span>
                        {availableTweets.length > 1 && (
                            <button
                                type="button"
                                className="portfolio-inline-action portfolio-inline-action--danger"
                                onClick={clearAllTweets}
                            >
                                Clear all
                            </button>
                        )}
                    </div>
                </div>
                {availableTweets.length === 0 ? (
                    <div className="portfolio-empty-state">
                        <Twitter size={32} style={{ marginBottom: '12px', opacity: 0.5 }} />
                        <p style={{ margin: 0 }}>No tweets added yet. Add tweet URLs above.</p>
                    </div>
                ) : (
                    <div className="portfolio-list portfolio-list--tweets">
                        {availableTweets.map((url, index) => {
                            const tweet = parseTweetInput(url);
                            const tweetUrl = tweet?.canonicalUrl || url;
                            const tweetHandle = tweet?.username === 'i' ? 'Tweet' : `@${tweet?.username || 'tweet'}`;
                            const tweetShortId = tweet?.tweetId ? tweet.tweetId.slice(-8) : 'unknown';
                            return (
                                <div key={`${tweetUrl}-${index}`} className="portfolio-list-item portfolio-list-item--tweet">
                                    <div className="portfolio-tweet-main">
                                        <span className="portfolio-tweet-icon" aria-hidden="true">
                                            <Twitter size={16} style={{ color: 'var(--tone-twitter)' }} />
                                        </span>
                                        <div className="portfolio-tweet-content">
                                            <div className="portfolio-tweet-top">
                                                <span className="portfolio-tweet-handle">{tweetHandle}</span>
                                                <span className="portfolio-tweet-id">ID • {tweetShortId}</span>
                                            </div>
                                            <span className="portfolio-list-item-text portfolio-list-item-text--tweet">{tweetUrl}</span>
                                        </div>
                                    </div>
                                    <div className="portfolio-tweet-actions">
                                        <a
                                            href={tweetUrl}
                                            target="_blank"
                                            rel="noopener noreferrer"
                                            className="portfolio-icon-btn"
                                            aria-label="Open tweet"
                                        >
                                            <ExternalLink size={14} />
                                        </a>
                                        <button
                                            type="button"
                                            className="portfolio-icon-btn portfolio-icon-btn--danger"
                                            onClick={() => removeTweet(url)}
                                            aria-label="Remove tweet"
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
                    <Trophy size={14} style={{ marginRight: '6px', verticalAlign: 'middle' }} />
                    Top Content Highlights
                </label>
                <textarea
                    className="portfolio-input portfolio-textarea"
                    style={{ ...inputStyle, resize: 'vertical' }}
                    placeholder="Links to your best content, threads, or portfolio work..."
                    value={formData.top_content}
                    onChange={(event) => setFormData({ ...formData, top_content: event.target.value })}
                />
            </div>
        </div>
    );
}
function PortfolioTimeline({ loadingTimeline, portfolioTimeline }) {
    if (loadingTimeline) {
        return (
            <div className="portfolio-timeline-container">
                <div style={{ textAlign: 'center', padding: '40px 20px', color: 'var(--color-text-secondary)' }}>
                    <div className="portfolio-spinner" style={{ marginBottom: '16px' }} />
                    Loading timeline...
                </div>
            </div>
        );
    }
    if (!portfolioTimeline || portfolioTimeline.length === 0) {
        return (
            <div className="portfolio-timeline-container">
                <div style={{ textAlign: 'center', padding: '40px 20px', color: 'var(--color-text-secondary)' }}>
                    No submission history yet. Start by creating a portfolio.
                </div>
            </div>
        );
    }
    return (
        <div className="portfolio-timeline-container">
            <div className="portfolio-timeline">
                {portfolioTimeline.map((entry) => {
                    const subsection = getTimelineSubsection(entry);
                    const showNotes = entry.notes && !subsection;
                    return (
                        <div key={entry.id} className="portfolio-timeline-item">
                            <div className="portfolio-timeline-marker" />
                            <div className="portfolio-timeline-date">
                                {new Date(entry.changed_at).toLocaleDateString('en-US', {
                                    year: 'numeric',
                                    month: 'short',
                                    day: 'numeric',
                                    hour: '2-digit',
                                    minute: '2-digit',
                                })}
                            </div>
                            <div className="portfolio-timeline-content">
                                <div className="portfolio-timeline-action">
                                    {getTimelineActionLabel(entry)}
                                </div>
                                {subsection && (
                                    <div className="portfolio-timeline-subsection">
                                        <div className="portfolio-timeline-subsection-title">{subsection.title}</div>
                                        {subsection.parsed ? (
                                            <div className="portfolio-review-feedback">
                                                <div className="portfolio-review-feedback-section">
                                                    <strong className="portfolio-review-feedback-heading">Approved</strong>
                                                    <ul className="portfolio-review-feedback-list">
                                                        {subsection.parsed.approved.length > 0
                                                            ? subsection.parsed.approved.map((line, index) => <li key={`a-${index}`}>{line}</li>)
                                                            : <li className="portfolio-review-feedback-empty">none</li>
                                                        }
                                                    </ul>
                                                </div>
                                                <div className="portfolio-review-feedback-section">
                                                    <strong className="portfolio-review-feedback-heading">Rejected</strong>
                                                    <ul className="portfolio-review-feedback-list">
                                                        {subsection.parsed.rejected.length > 0
                                                            ? subsection.parsed.rejected.map((line, index) => <li key={`r-${index}`}>{line}</li>)
                                                            : <li className="portfolio-review-feedback-empty">none</li>
                                                        }
                                                    </ul>
                                                </div>
                                            </div>
                                        ) : (
                                            <div className="portfolio-timeline-subsection-content">{subsection.content}</div>
                                        )}
                                    </div>
                                )}
                                {showNotes && (
                                    <div className="portfolio-timeline-notes">{entry.notes}</div>
                                )}
                            </div>
                        </div>
                    );
                })}
            </div>
        </div>
    );
}
export { PortfolioTimeline, PortfolioTweetsStep };
