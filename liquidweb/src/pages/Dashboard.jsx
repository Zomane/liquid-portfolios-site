import React, { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowRight, Briefcase, Calendar, CheckCircle, Gavel, Lock, Shield, User, Zap } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import './Dashboard.css';
const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:8000';
const REVIEWER_ROLES = [
    "1519094379141398558",
    "1519094454265450506",
];
const formatDate = (value) => {
    if (!value) return 'Unknown date';
    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) return 'Unknown date';
    return parsed.toLocaleDateString();
};
const getStatusTone = (status) => {
    if (status === 'approved') return 'success';
    if (status === 'rejected') return 'danger';
    if (status === 'pending_vote' || status === 'pending' || status === 'under_review') return 'info';
    return 'neutral';
};
const capitalizeFirst = (str) => {
    if (!str) return '';
    return str.charAt(0).toUpperCase() + str.slice(1);
};
const getTimelineActionLabel = (entry) => {
    if (entry?.action === 'create') return 'Created';
    if (entry?.action === 'submit') return 'Submitted for Review';
    if (entry?.action === 'reverted_to_draft') return 'Reverted to Draft';
    if (entry?.action === 'approve') return 'Approved by Reviewer';
    if (entry?.action === 'reject') return 'Rejected by Reviewer';
    if (entry?.action === 'request_changes') return 'Changes Requested';
    if (entry?.action === 'promoted') return 'Promotion Approved';
    if (entry?.action === 'promotion_rejected') return 'Promotion Rejected';
    return 'Updated';
};
const getTimelineSubsection = (entry) => {
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
};
const parseReviewFeedback = (text) => {
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
        return items.filter(l => l && l !== 'none');
    };
    const approved = extractLines(approvedBlock);
    const rejected = extractLines(rejectedBlock);
    if (!approved.length && !rejected.length) return null;
    return { approved, rejected };
};
const LOCAL_GUILD_ICON_BY_ID = {
    traders: '/images/Traders_Guild.png',
    designers: '/images/Artists_Guild.png',
    content: '/images/Content_Orator.png',
};
const isImageUrl = (value) => typeof value === 'string' && /^(https?:\/\/|\/)/.test(value);
const getGuildPresentation = (guild) => {
    const rawIcon = guild.icon;
    const displayName = guild.name;
    const iconImage = isImageUrl(rawIcon)
        ? rawIcon
        : LOCAL_GUILD_ICON_BY_ID[guild.id] || '';
    const iconFallback = typeof rawIcon === 'string' && rawIcon.trim()
        ? rawIcon
        : '⭐';
    return {
        displayName,
        icon: iconImage || iconFallback,
        hasImageIcon: Boolean(iconImage),
    };
};
const Dashboard = () => {
    const navigate = useNavigate();
    const { user, isAuthenticated, loading: authLoading, login } = useAuth();
    const [loading, setLoading] = useState(true);
    const [userData, setUserData] = useState(null);
    const [portfolioTimeline, setPortfolioTimeline] = useState([]);
    const [loadingTimeline, setLoadingTimeline] = useState(false);
    const [error, setError] = useState(null);
    const discordId = user?.discord_id || user?.id || '';
    const hasGuildAccess = user?.has_guild_access || false;
    const userRoles = user?.roles || [];
    const userId = user?.discord_id || "";
    const userGuilds = user?.guilds || [];
    const roleInfo = user?.role_info || [];
    const isReviewer = Array.isArray(userRoles)
        ? userRoles.some((roleId) => REVIEWER_ROLES.includes(String(roleId))) || REVIEWER_ROLES.includes(userId)
        : REVIEWER_ROLES.includes(userId);
    const fetchDashboard = useCallback(async () => {
        if (!discordId) {
            setLoading(false);
            return;
        }
        setLoading(true);
        try {
            const response = await fetch(`${API_BASE}/api/user/${discordId}/dashboard`);
            if (!response.ok) {
                setError('User not found');
                return;
            }
            const data = await response.json();
            setUserData(data);
            setError(null);
            try {
                setLoadingTimeline(true);
                const timelineRes = await fetch(`${API_BASE}/api/portfolio/${discordId}/timeline`);
                if (timelineRes.ok) {
                    const timelineData = await timelineRes.json();
                    setPortfolioTimeline(Array.isArray(timelineData) ? timelineData : []);
                } else {
                    setPortfolioTimeline([]);
                }
            } catch (timelineError) {
                console.error('Failed to fetch portfolio timeline:', timelineError);
                setPortfolioTimeline([]);
            } finally {
                setLoadingTimeline(false);
            }
        } catch {
            setError('Failed to load dashboard');
        } finally {
            setLoading(false);
        }
    }, [discordId]);
    useEffect(() => {
        if (discordId && isAuthenticated) {
            fetchDashboard();
        } else if (!authLoading) {
            setLoading(false);
        }
    }, [authLoading, discordId, fetchDashboard, isAuthenticated]);
    if (authLoading || loading) {
        return (
            <div className="dashboard-page dashboard-page--centered page-reveal">
                <section className="dashboard-state-card">
                    <div className="dashboard-spinner" aria-hidden="true" />
                    <p>Loading dashboard...</p>
                </section>
            </div>
        );
    }
    if (!isAuthenticated) {
        return (
            <div className="dashboard-page dashboard-page--centered page-reveal">
                <section className="dashboard-state-card dashboard-state-card--login">
                    <div className="dashboard-login-avatar" aria-hidden="true">
                        <User size={34} />
                    </div>
                    <h1>Dashboard</h1>
                    <p>Connect with Discord to view your stats and submit portfolios.</p>
                    <button onClick={login} className="btn btn-primary dashboard-login-btn">
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                            <path d="M20.317 4.37a19.791 19.791 0 0 0-4.885-1.515.074.074 0 0 0-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 0 0-5.487 0 12.64 12.64 0 0 0-.617-1.25.077.077 0 0 0-.079-.037A19.736 19.736 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 0 0 .031.057 19.9 19.9 0 0 0 5.993 3.03.078.078 0 0 0 .084-.028 14.09 14.09 0 0 0 1.226-1.994.076.076 0 0 0-.041-.106 13.107 13.107 0 0 1-1.872-.892.077.077 0 0 1-.008-.128 10.2 10.2 0 0 0 .372-.292.074.074 0 0 1 .077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 0 1 .078.01c.12.098.246.198.373.292a.077.077 0 0 1-.006.127 12.299 12.299 0 0 1-1.873.892.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028 19.839 19.839 0 0 0 6.002-3.03.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.03zM8.02 15.33c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.956-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.956 2.418-2.157 2.418zm7.975 0c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.955-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.946 2.418-2.157 2.418z" />
                        </svg>
                        Login with Discord
                    </button>
                </section>
            </div>
        );
    }
    if (error) {
        return (
            <div className="dashboard-page dashboard-page--centered page-reveal">
                <section className="dashboard-state-card dashboard-state-card--error">
                    <p>{error}</p>
                </section>
            </div>
        );
    }
    const portfolioStatus = userData?.portfolio_status;
    const latestTimelineEntry = portfolioTimeline.length > 0 ? portfolioTimeline[portfolioTimeline.length - 1] : null;
    const hasRequestedChanges =
        portfolioStatus === 'changes_requested' || (
            portfolioStatus === 'draft' && (
                latestTimelineEntry?.action === 'request_changes' ||
                Boolean(userData?.portfolio?.review_feedback)
            ));
    const displayPortfolioStatus = hasRequestedChanges ? 'changes_requested' : portfolioStatus;
    const portfolioStatusLabel = displayPortfolioStatus ? displayPortfolioStatus.replaceAll('_', ' ') : '';
    return (
        <div className="dashboard-page page-reveal">
            <div className="dashboard-shell">
                <section className="dashboard-card">
                    <header className="dashboard-profile-head">
                        <div className="dashboard-avatar-shell">
                            {user.avatar_url ? (
                                <img src={user.avatar_url} alt={`${user.username || 'User'} avatar`} />
                            ) : (
                                <div className="dashboard-avatar-fallback" aria-hidden="true">
                                    <User size={40} />
                                </div>
                            )}
                        </div>
                        <div className="dashboard-profile-meta">
                            <h1>{user.username || 'User'}</h1>
                            <p className="dashboard-subline">Discord ID: {discordId}</p>
                        </div>
                    </header>
                    {!hasGuildAccess && !isReviewer && (
                        <div className="dashboard-notice dashboard-notice--warning">
                            <Lock size={18} aria-hidden="true" />
                            <div>
                                <h3>No Guild Access</h3>
                                <p>You must belong to at least one guild to submit a portfolio. Join a guild in our <a href="#" target="_blank" rel="noopener noreferrer" className="dashboard-link" style={{ fontWeight: 'bold', textDecoration: 'underline' }}>Discord</a> to get started.</p>
                            </div>
                        </div>
                    )}
                    {!hasGuildAccess && isReviewer && (
                        <div className="dashboard-notice dashboard-notice--info">
                            <Gavel size={18} aria-hidden="true" />
                            <div>
                                <h3>Reviewer Access Active</h3>
                                <p>You can review portfolios now. Open the Portfolios page to check pending submissions.</p>
                            </div>
                        </div>
                    )}
                    {userGuilds.length > 0 && (
                        <section className="dashboard-block">
                            <div className="dashboard-block-head">
                                <Briefcase size={16} aria-hidden="true" />
                                <h2>Your Guilds</h2>
                            </div>
                            <div className="dashboard-chip-grid">
                                {userGuilds.map((guild, index) => {
                                    const presentation = getGuildPresentation(guild);
                                    return (
                                        <article className="dashboard-chip-card" key={`${guild.id || presentation.displayName}-${index}`}>
                                            <span className="dashboard-chip-icon" aria-hidden="true">
                                                {presentation.hasImageIcon ? (
                                                    <img src={presentation.icon} alt="" />
                                                ) : (
                                                    presentation.icon
                                                )}
                                            </span>
                                            <div className="dashboard-chip-meta">
                                                <strong>{presentation.displayName}</strong>
                                                {guild.tier && (
                                                    <span>{capitalizeFirst(guild.tier.id)} • Tier {guild.tier.tier}</span>
                                                )}
                                            </div>
                                        </article>
                                    );
                                })}
                            </div>
                        </section>
                    )}
                    {roleInfo.length > 0 && (
                        <section className="dashboard-block">
                            <div className="dashboard-block-head">
                                <Shield size={16} aria-hidden="true" />
                                <h2>Your Roles</h2>
                            </div>
                            <div className="dashboard-role-list">
                                {roleInfo.map((role, index) => {
                                    const isCustomIcon = role.is_custom_icon && role.icon?.startsWith('https://');
                                    return (
                                        <span className="dashboard-role-pill" key={`${role.id || role.name}-${index}`}>
                                            {isCustomIcon ? (
                                                <img src={role.icon} alt="" />
                                            ) : (
                                                <span className="dashboard-role-emoji" aria-hidden="true">{role.icon || '⭐'}</span>
                                            )}
                                            {role.name}
                                        </span>
                                    );
                                })}
                            </div>
                        </section>
                    )}
                    <section className="dashboard-action-panel">
                        {isReviewer ? (
                            <>
                                <div className="dashboard-action-copy">
                                    <Gavel size={18} aria-hidden="true" />
                                    <div>
                                        <h3>Review Submissions</h3>
                                        <p>Access the portfolios page to review pending submissions and provide feedback to guild members.</p>
                                    </div>
                                </div>
                                <button onClick={() => navigate('/portfolios')} className="btn btn-primary dashboard-action-btn">
                                    Go to Portfolios
                                    <ArrowRight size={16} aria-hidden="true" />
                                </button>
                            </>
                        ) : hasGuildAccess ? (
                            portfolioStatus ? (
                                <>
                                    <div className="dashboard-action-copy">
                                        <CheckCircle size={18} aria-hidden="true" />
                                        <div>
                                            <h3>Portfolio Status</h3>
                                            <p>Your portfolio is currently <span>{portfolioStatusLabel}</span>.</p>
                                        </div>
                                    </div>
                                    <button onClick={() => navigate('/portfolio')} className="btn dashboard-action-btn dashboard-action-btn--secondary">
                                        View Portfolio
                                        <ArrowRight size={16} aria-hidden="true" />
                                    </button>
                                </>
                            ) : (
                                <>
                                    <div className="dashboard-action-copy">
                                        <Zap size={18} aria-hidden="true" />
                                        <div>
                                            <h3>Ready to Submit a Portfolio?</h3>
                                            <p>Create a portfolio to showcase your work and apply for role promotion in your guild.</p>
                                        </div>
                                    </div>
                                    <button onClick={() => navigate('/portfolio')} className="btn btn-primary dashboard-action-btn">
                                        Submit Portfolio
                                        <ArrowRight size={16} aria-hidden="true" />
                                    </button>
                                </>
                            )
                        ) : (
                            <button disabled className="btn dashboard-action-btn dashboard-action-btn--secondary">
                                <Lock size={16} aria-hidden="true" />
                                Submit Portfolio (Requires Guild Membership)
                            </button>
                        )}
                    </section>
                </section>
                {(loadingTimeline || portfolioTimeline.length > 0 || userData?.portfolio_history?.length > 0 || Boolean(userData?.portfolio)) && (
                    <section className="dashboard-card">
                        <div className="dashboard-block-head dashboard-block-head--primary">
                            <Calendar size={16} aria-hidden="true" />
                            <div style={{ flex: 1 }}>
                                <h2>Portfolio Timeline</h2>
                                <p style={{ margin: '4px 0 0', fontSize: '12px', color: 'var(--color-text-secondary)' }}>
                                    Track all changes and reviews for your portfolio submissions
                                </p>
                            </div>
                        </div>
                        {loadingTimeline ? (
                            <div style={{ textAlign: 'center', padding: '40px 20px', color: 'var(--color-text-secondary)' }}>
                                <div className="dashboard-spinner" style={{ marginBottom: '12px' }} />
                                Loading your submission history...
                            </div>
                        ) : portfolioTimeline && portfolioTimeline.length > 0 ? (
                            <div className="dashboard-timeline">
                                {portfolioTimeline.map((entry, index) => {
                                    const subsection = getTimelineSubsection(entry);
                                    const shouldShowNotes = entry.notes && !subsection;
                                    return (
                                        <article className="dashboard-timeline-item" key={`${entry.id || index}`} data-action={entry.action}>
                                            <span className="dashboard-timeline-dot" aria-hidden="true" />
                                            <div className="dashboard-timeline-copy">
                                                <strong>{getTimelineActionLabel(entry)}</strong>
                                                <span>{formatDate(entry.changed_at)}</span>
                                                {subsection && (
                                                    <div className="dashboard-timeline-subsection">
                                                        <div className="dashboard-timeline-subsection-title">
                                                            {subsection.title}
                                                        </div>
                                                        {subsection.parsed ? (
                                                            <div className="dashboard-review-feedback">
                                                                <div className="dashboard-review-feedback-section dashboard-review-feedback-section--approve">
                                                                    <div className="dashboard-review-feedback-section-title">Approved</div>
                                                                    <ul className="dashboard-review-feedback-list">
                                                                        {subsection.parsed.approved.length > 0
                                                                            ? subsection.parsed.approved.map((line, i) => <li key={i}>{line}</li>)
                                                                            : <li className="dashboard-review-feedback-list-empty">none</li>
                                                                        }
                                                                    </ul>
                                                                </div>
                                                                <div className="dashboard-review-feedback-section dashboard-review-feedback-section--reject">
                                                                    <div className="dashboard-review-feedback-section-title">Rejected</div>
                                                                    <ul className="dashboard-review-feedback-list">
                                                                        {subsection.parsed.rejected.length > 0
                                                                            ? subsection.parsed.rejected.map((line, i) => <li key={i}>{line}</li>)
                                                                            : <li className="dashboard-review-feedback-list-empty">none</li>
                                                                        }
                                                                    </ul>
                                                                </div>
                                                            </div>
                                                        ) : (
                                                            <div className="dashboard-timeline-subsection-content">
                                                                {subsection.content}
                                                            </div>
                                                        )}
                                                    </div>
                                                )}
                                                {shouldShowNotes && (
                                                    <span className="dashboard-timeline-notes">{entry.notes}</span>
                                                )}
                                            </div>
                                        </article>
                                    );
                                })}
                            </div>
                        ) : (
                            <div style={{ textAlign: 'center', padding: '40px 20px', color: 'var(--color-text-secondary)' }}>
                                <p style={{ margin: 0, fontSize: '13px' }}>No portfolio history yet. Create one to get started!</p>
                            </div>
                        )}
                    </section>
                )}
                {userData?.promotion_history?.length > 0 && (
                    <section className="dashboard-card">
                        <div className="dashboard-block-head dashboard-block-head--primary">
                            <Calendar size={16} aria-hidden="true" />
                            <h2>Promotion Timeline</h2>
                        </div>
                        <div className="dashboard-timeline">
                            {userData.promotion_history.map((promotion, index) => (
                                <article className="dashboard-timeline-item" key={`${promotion.id || promotion.promoted_at || index}-${index}`}>
                                    <span className="dashboard-timeline-dot" aria-hidden="true" />
                                    <div className="dashboard-timeline-copy">
                                        <strong>Obtained {promotion.to_role}</strong>
                                        <span>{formatDate(promotion.promoted_at)}</span>
                                    </div>
                                </article>
                            ))}
                        </div>
                    </section>
                )}
            </div>
        </div>
    );
};
export default Dashboard;
