import React from 'react';
import { Palette, PenTool, Check, TrendingUp } from 'lucide-react';
const GUILDS = [
    {
        id: 'traders',
        name: 'Traders Guild',
        icon: TrendingUp,
        image: '/images/Traders_Guild.png',
        description: 'Active traders and market analysts',
        color: 'var(--tone-info)',
        bg: 'var(--tone-info-bg)',
        requirements: [
            'Active trading history',
            'Share market analysis',
            'Participate in competitions',
        ],
    },
    {
        id: 'content',
        name: 'Content Guild',
        icon: PenTool,
        image: '/images/Content_Orator.png',
        description: 'Creators, writers, guides, and social content',
        color: 'var(--tone-success)',
        bg: 'var(--tone-success-bg)',
        requirements: [
            'Create useful content',
            'Write guides or posts',
            'Share community updates',
        ],
    },
    {
        id: 'designers',
        name: 'Designers Guild',
        icon: Palette,
        image: '/images/Artists_Guild.png',
        description: 'Designers and visual artists',
        color: 'var(--tone-promo)',
        bg: 'var(--tone-promo-bg)',
        requirements: [
            'Create visual content and art',
            'Design graphics and memes',
            'Build community tools',
        ],
    },
];
export const GuildCard = ({ guild, selected, onSelect, disabled }) => {
    const Icon = guild.icon;
    const isSelected = selected === guild.id;
    return (
        <button
            onClick={() => !disabled && onSelect(guild.id)}
            disabled={disabled}
            className={`guild-card ${isSelected ? 'is-selected' : ''}`}
            style={{
                '--guild-accent': guild.color,
            }}
        >
            <span className="guild-card-glow" aria-hidden="true" />
            {isSelected && (
                <span className="guild-card-badge">
                    <Check size={12} />
                    Selected
                </span>
            )}
            <div className="guild-card-head">
                <div className="guild-card-icon-wrap">
                    {guild.image ? (
                        <img src={guild.image} alt={guild.name} className="guild-card-icon-image" />
                    ) : (
                        <Icon size={28} style={{ color: guild.color }} />
                    )}
                </div>
                <div className="guild-card-head-copy">
                    <div className="guild-card-title-row">
                        <div className="guild-card-title-main">
                            <h4 className="guild-card-title">{guild.name}</h4>
                        </div>
                    </div>
                    <p className="guild-card-subtitle">{guild.description}</p>
                </div>
            </div>
            <div className="guild-card-body">
                <div className="guild-card-label">Requirements</div>
                <ul className="guild-card-list">
                    {guild.requirements.map((req) => (
                        <li key={req}>
                            <span className="guild-card-dot" aria-hidden="true" />
                            <span>{req}</span>
                        </li>
                    ))}
                </ul>
            </div>
        </button>
    );
};
export const GuildSelect = ({ selected, onSelect, disabled = false, userGuilds = null }) => {
    const guildsToShow = userGuilds && userGuilds.length > 0
        ? GUILDS.filter(guild => userGuilds.some(userGuild => userGuild.id === guild.id))
        : GUILDS;
    return (
        <section className="guild-select-shell">
            {userGuilds && guildsToShow.length === 0 && (
                <div style={{ textAlign: 'center', padding: '40px', color: 'var(--color-text-secondary)' }}>
                    <p>You don't belong to any guilds yet. Join a guild in Discord to submit a portfolio!</p>
                </div>
            )}
            <div className="guild-grid">
                {guildsToShow.map((guild) => (
                    <GuildCard
                        key={guild.id}
                        guild={guild}
                        selected={selected}
                        onSelect={onSelect}
                        disabled={disabled}
                    />
                ))}
            </div>
            <style>{`
                .guild-select-shell {
                    position: relative;
                }
                .guild-select-subtitle {
                    margin: 0 auto 34px;
                    max-width: 760px;
                    color: var(--color-text-secondary);
                    text-align: center;
                    font-size: 20px;
                    line-height: 1.5;
                }
                .guild-grid {
                    display: grid;
                    grid-template-columns: repeat(auto-fit, minmax(min(320px, 100%), 480px));
                    gap: 22px;
                    justify-content: center;
                    align-items: stretch;
                }
                .guild-card {
                    position: relative;
                    width: 100%;
                    max-width: 480px;
                    height: 100%;
                    min-height: 350px;
                    border-radius: 22px;
                    border: 1px solid var(--color-badge-border);
                    background: var(--surface-card), var(--color-card-bg);
                    padding: 30px;
                    text-align: left;
                    cursor: pointer;
                    transition: transform 0.24s ease, border-color 0.24s ease, box-shadow 0.24s ease, background 0.24s ease;
                    color: var(--color-text);
                    overflow: hidden;
                    display: flex;
                    flex-direction: column;
                    gap: 24px;
                    isolation: isolate;
                }
                .guild-card:hover {
                    transform: translateY(-3px);
                    border-color: color-mix(in srgb, var(--guild-accent) 54%, rgba(255, 255, 255, 0.18));
                    box-shadow: 0 24px 34px rgba(0, 0, 0, 0.28);
                }
                .guild-card:focus-visible {
                    outline: none;
                    border-color: color-mix(in srgb, var(--guild-accent) 72%, white 20%);
                    box-shadow: 0 0 0 3px color-mix(in srgb, var(--guild-accent) 38%, transparent);
                }
                .guild-card:disabled {
                    cursor: not-allowed;
                    opacity: 0.7;
                    transform: none;
                    box-shadow: none;
                }
                .guild-card.is-selected {
                    border-color: color-mix(in srgb, var(--guild-accent) 62%, rgba(255, 255, 255, 0.22));
                    box-shadow: 0 22px 34px rgba(0, 0, 0, 0.3);
                    overflow: visible;
                }
                .guild-card-glow {
                    position: absolute;
                    width: 160px;
                    height: 160px;
                    z-index: -1;
                }
                .guild-card:hover .guild-card-glow,
                .guild-card.is-selected .guild-card-glow {
                    opacity: 0.95;
                }
                .guild-card-head {
                    display: flex;
                    align-items: center;
                    gap: 16px;
                }
                .guild-card-icon-wrap {
                    width: 72px;
                    height: 72px;
                    border-radius: 18px;
                    background: color-mix(in srgb, var(--guild-accent) 20%, rgba(255, 255, 255, 0.04));
                    border: 1px solid color-mix(in srgb, var(--guild-accent) 40%, rgba(255, 255, 255, 0.12));
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    flex-shrink: 0;
                }
                .guild-card-icon-image {
                    width: 42px;
                    height: 42px;
                    object-fit: contain;
                }
                .guild-card-head-copy {
                    min-width: 0;
                }
                .guild-card-title-row {
                    display: flex;
                    align-items: flex-start;
                    gap: 10px;
                    margin-bottom: 8px;
                }
                .guild-card-title-main {
                    min-width: 0;
                    display: flex;
                    align-items: center;
                    gap: 10px;
                }
                .guild-card-emoji {
                    font-size: 20px;
                    line-height: 1;
                }
                .guild-card-title {
                    margin: 0;
                    font-size: 30px;
                    line-height: 1.08;
                    letter-spacing: -0.02em;
                    font-weight: 700;
                }
                .guild-card-badge {
                    position: absolute;
                    top: 0;
                    left: 50%;
                    transform: translate(-50%, -52%);
                    z-index: 2;
                    pointer-events: none;
                    display: inline-flex;
                    align-items: center;
                    gap: 6px;
                    padding: 6px 10px;
                    border-radius: 999px;
                    border: 1px solid color-mix(in srgb, var(--guild-accent) 60%, rgba(255, 255, 255, 0.22));
                    background: var(--guild-accent);
                    font-size: 12px;
                    font-weight: 700;
                    line-height: 1;
                    white-space: nowrap;
                    letter-spacing: 0.03em;
                    box-shadow: 0 8px 18px color-mix(in srgb, var(--guild-accent) 20%, transparent);
                }
                .guild-card-subtitle {
                    margin: 0;
                    font-size: 18px;
                    line-height: 1.5;
                    color: var(--color-text-secondary);
                }
                .guild-card-body {
                    margin-top: auto;
                    border-top: 1px solid rgba(255, 255, 255, 0.08);
                    padding-top: 18px;
                }
                .guild-card-label {
                    margin-bottom: 14px;
                    font-size: 13px;
                    letter-spacing: 0.09em;
                    text-transform: uppercase;
                    color: color-mix(in srgb, var(--guild-accent) 45%, #babac7);
                    font-weight: 700;
                }
                .guild-card-list {
                    list-style: none;
                    margin: 0;
                    padding: 0;
                    display: grid;
                    gap: 10px;
                }
                .guild-card-list li {
                    display: flex;
                    gap: 10px;
                    align-items: flex-start;
                    color: #cfd0dc;
                    font-size: 16px;
                    line-height: 1.5;
                }
                .guild-card-dot {
                    margin-top: 8px;
                    width: 7px;
                    height: 7px;
                    border-radius: 999px;
                    flex-shrink: 0;
                    background: var(--guild-accent);
                    box-shadow: 0 0 0 4px color-mix(in srgb, var(--guild-accent) 28%, transparent);
                }
                @media (max-width: 760px) {
                    .guild-select-subtitle {
                        margin-bottom: 20px;
                        font-size: 17px;
                    }
                    .guild-grid {
                        grid-template-columns: 1fr;
                        gap: 16px;
                    }
                    .guild-card {
                        min-height: 0;
                        border-radius: 18px;
                        padding: 20px;
                        margin: 0 auto;
                    }
                    .guild-card-head {
                        gap: 12px;
                    }
                    .guild-card-icon-wrap {
                        width: 58px;
                        height: 58px;
                        border-radius: 14px;
                    }
                    .guild-card-icon-image {
                        width: 34px;
                        height: 34px;
                    }
                    .guild-card-title {
                        font-size: 27px;
                    }
                    .guild-card-badge {
                        padding: 5px 9px;
                        font-size: 11px;
                        transform: translate(-50%, -48%);
                    }
                    .guild-card-subtitle {
                        font-size: 16px;
                    }
                    .guild-card-list li {
                        font-size: 15px;
                    }
                }
                @media (max-width: 520px) {
                    .guild-card-head {
                        flex-direction: column;
                        align-items: flex-start;
                    }
                }
                @media (prefers-reduced-motion: reduce) {
                    .guild-card,
                    .guild-card-glow {
                        transition: none;
                    }
                }
            `}</style>
        </section>
    );
};
export const GuildBadge = ({ guildId, size = 'medium' }) => {
    const guild = GUILDS.find(g => g.id === guildId);
    if (!guild) return null;
    const sizes = {
        small: { padding: '7px 12px', fontSize: '14px', iconSize: 14 },
        medium: { padding: '6px 12px', fontSize: '13px', iconSize: 14 },
        large: { padding: '8px 16px', fontSize: '14px', iconSize: 16 },
    };
    const s = sizes[size] || sizes.medium;
    const Icon = guild.icon;
    return (
        <div style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '6px',
            padding: s.padding,
            borderRadius: '999px',
            background: guild.bg || 'var(--tone-neutral-bg)',
            color: guild.color,
            fontSize: s.fontSize,
            fontWeight: 600,
        }}>
            {guild.image ? (
                <img src={guild.image} alt="" style={{ width: s.iconSize, height: s.iconSize, objectFit: 'contain' }} />
            ) : (
                <Icon size={s.iconSize} />
            )}
            {guild.name}
        </div>
    );
};
export { GUILDS };
export default GuildSelect;
