import React from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
const REVIEWER_ROLES = [
    "1519094379141398558",
    "1519094454265450506",
];
const Navbar = () => {
    const [isMenuOpen, setIsMenuOpen] = React.useState(false);
    const location = useLocation();
    const { user, loading, login, logout, isAuthenticated } = useAuth();
    React.useEffect(() => {
        setIsMenuOpen(false);
    }, [location.pathname]);
    const isActive = (path) => {
        if (path === '/portfolio') {
            return location.pathname === '/portfolio' || location.pathname.startsWith('/portfolios/');
        }
        if (path === '/portfolios') {
            return location.pathname === '/portfolios' || location.pathname.startsWith('/portfolios/');
        }
        return location.pathname === path;
    };
    const roleIds = user?.roles || [];
    const userId = user?.discord_id || "";
    const isReviewer = Array.isArray(roleIds)
        ? roleIds.some((id) => REVIEWER_ROLES.includes(String(id))) || REVIEWER_ROLES.includes(userId)
        : REVIEWER_ROLES.includes(userId);
    const links = [
        ...(isAuthenticated
            ? [{ to: "/dashboard", label: "Dashboard" }]
            : []
        ),
        ...(isReviewer
            ? [{ to: "/portfolios", label: "Review" }]
            : isAuthenticated
                ? [{ to: "/portfolio", label: "Portfolio" }]
                : []
        ),
    ];
    const navLinks = (
        <>
            {links.map((link) => (
                <Link
                    key={link.to}
                    to={link.to}
                    className="nav-link"
                    data-active={isActive(link.to) ? 'true' : 'false'}
                >
                    {link.label}
                </Link>
            ))}
        </>
    );
    const authControls = loading ? (
        <div style={{ width: '100px' }} />
    ) : isAuthenticated ? (
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <Link to="/dashboard" style={{ display: 'flex', alignItems: 'center', gap: '8px', textDecoration: 'none' }}>
                {user.avatar_url ? (
                    <img
                        src={user.avatar_url}
                        alt={user.username}
                        style={{
                            width: '36px',
                            height: '36px',
                            borderRadius: '50%',
                            border: '2px solid var(--color-primary)',
                        }}
                    />
                ) : (
                    <div style={{
                        width: '36px',
                        height: '36px',
                        borderRadius: '50%',
                        background: 'var(--color-primary)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        color: 'white',
                        fontWeight: 600,
                        fontSize: '14px',
                    }}>
                        {user.username?.charAt(0).toUpperCase()}
                    </div>
                )}
                <span style={{ color: 'var(--color-text)', fontWeight: 500, fontSize: '15px' }}>
                    {user.username}
                </span>
            </Link>
            <button
                onClick={logout}
                style={{
                    background: 'transparent',
                    border: '1px solid var(--color-badge-border)',
                    color: 'var(--color-text-secondary)',
                    padding: '8px 16px',
                    borderRadius: '8px',
                    cursor: 'pointer',
                    fontSize: '14px',
                    transition: 'all 0.2s',
                }}
                onMouseEnter={(e) => {
                    e.target.style.borderColor = 'var(--color-primary)';
                    e.target.style.color = 'var(--color-primary)';
                }}
                onMouseLeave={(e) => {
                    e.target.style.borderColor = 'var(--color-badge-border)';
                    e.target.style.color = 'var(--color-text-secondary)';
                }}
            >
                Logout
            </button>
        </div>
    ) : (
        <button
            onClick={login}
            className="btn btn-primary"
            style={{
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
            }}
        >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
                <path d="M20.317 4.37a19.791 19.791 0 0 0-4.885-1.515.074.074 0 0 0-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 0 0-5.487 0 12.64 12.64 0 0 0-.617-1.25.077.077 0 0 0-.079-.037A19.736 19.736 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 0 0 .031.057 19.9 19.9 0 0 0 5.993 3.03.078.078 0 0 0 .084-.028 14.09 14.09 0 0 0 1.226-1.994.076.076 0 0 0-.041-.106 13.107 13.107 0 0 1-1.872-.892.077.077 0 0 1-.008-.128 10.2 10.2 0 0 0 .372-.292.074.074 0 0 1 .077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 0 1 .078.01c.12.098.246.198.373.292a.077.077 0 0 1-.006.127 12.299 12.299 0 0 1-1.873.892.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028 19.839 19.839 0 0 0 6.002-3.03.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.03zM8.02 15.33c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.956-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.956 2.418-2.157 2.418zm7.975 0c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.955-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.946 2.418-2.157 2.418z" />
            </svg>
            Login with Discord
        </button>
    );
    return (
        <nav
            className={`navbar ${isMenuOpen ? 'is-open' : ''}`}
            style={{
                padding: '20px 40px',
                position: 'fixed',
                width: '100%',
                top: '0',
                zIndex: 40,
                background: 'var(--color-bg)',
                borderBottom: '1px solid var(--color-badge-border)',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'stretch',
            }}
        >
            <div className="nav-row">
                <div className="logo">
                    <Link to="/" className="brand-link" aria-label="Liquid Community: Home">
                        <span className="brand-mark-wrap" aria-hidden="true">
                            <img
                                src="/images/Logo.png"
                                alt=""
                                className="brand-mark"
                            />
                        </span>
                        <span className="brand-wordmark">
                            <span className="brand-community">Community</span>
                        </span>
                    </Link>
                </div>
                <div className="center-links desktop-only">
                    {navLinks}
                </div>
                <div className="nav-right">
                    <div className="right-action desktop-only">
                        {authControls}
                    </div>
                    <button
                        className="burger mobile-only"
                        onClick={() => setIsMenuOpen((v) => !v)}
                        aria-label={isMenuOpen ? 'Close menu' : 'Open menu'}
                        style={{
                            background: 'transparent',
                            border: '1px solid var(--color-badge-border)',
                            color: 'var(--color-text)',
                            width: '44px',
                            height: '44px',
                            borderRadius: '12px',
                            fontSize: '22px',
                            cursor: 'pointer',
                            display: 'none',
                            alignItems: 'center',
                            justifyContent: 'center',
                        }}
                    >
                        ☰
                    </button>
                </div>
            </div>
            <div className="mobile-menu" aria-hidden={!isMenuOpen}>
                <div className="mobile-links">
                    {navLinks}
                </div>
                <div className="mobile-action">
                    {authControls}
                </div>
            </div>
            <style>{`
                .nav-row {
                    width: 100%;
                    display: grid;
                    grid-template-columns: auto 1fr auto;
                    align-items: center;
                    gap: 32px;
                    position: relative;
                }
                .center-links {
                    position: absolute;
                    left: 50%;
                    transform: translateX(-50%);
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    gap: 10px;
                    white-space: nowrap;
                    max-width: calc(100% - 360px);
                    overflow: hidden;
                }
                .brand-link {
                    position: relative;
                    display: inline-flex;
                    align-items: center;
                    gap: 10px;
                    text-decoration: none;
                    border-radius: 12px;
                    padding: 5px 4px;
                    margin: -5px -4px;
                }
                .brand-mark-wrap {
                    position: relative;
                    width: 22px;
                    height: 22px;
                    display: grid;
                    place-items: center;
                    flex: none;
                }
                .brand-mark {
                    width: 20px;
                    display: block;
                    transform-origin: 50% 60%;
                    transform: translateY(-2px) rotate(0deg) scale(1.02);
                    transition: transform 220ms cubic-bezier(0.22, 1, 0.36, 1);
                    will-change: transform;
                }
                .brand-wordmark {
                    display: inline-flex;
                    align-items: baseline;
                    gap: 6px;
                    white-space: nowrap;
                    font-size: 20px;
                    line-height: 1.2;
                    letter-spacing: -0.014em;
                }
                .brand-liquid {
                    font-weight: 650;
                    color: var(--color-text);
                }
                .brand-community {
                    font-family: 'Playfair Display', serif;
                    font-style: italic;
                    font-weight: 600;
                    font-size: 21px;
                    letter-spacing: -0.016em;
                    color: color-mix(in srgb, var(--color-text) 92%, var(--color-text-secondary));
                    position: relative;
                    top: 0.5px;
                }
                .brand-link:hover .brand-mark,
                .brand-link:focus-visible .brand-mark {
                    animation: brandLogoFloat 820ms cubic-bezier(0.22, 1, 0.36, 1) both;
                }
                .brand-link:focus-visible {
                    outline: none;
                    box-shadow: 0 0 0 2px rgba(237, 237, 255, 0.38);
                }
                @keyframes brandLogoFloat {
                    0% {
                        transform: translateY(-2px) rotate(0deg) scale(1.02);
                    }
                    35% {
                        transform: translateY(-4px) rotate(-4deg) scale(1.05);
                    }
                    70% {
                        transform: translateY(-3px) rotate(2deg) scale(1.01);
                    }
                    100% {
                        transform: translateY(-2px) rotate(0deg) scale(1.02);
                    }
                }
                .nav-right {
                    display: flex;
                    align-items: center;
                    justify-content: flex-end;
                    gap: 16px;
                }
                .mobile-menu {
                    position: relative;
                    max-height: 0;
                    opacity: 0;
                    transform: translateY(-6px);
                    overflow: hidden;
                    transition:
                        max-height 0.28s ease,
                        opacity 0.2s ease,
                        transform 0.2s ease;
                    will-change: max-height, opacity, transform;
                }
                .mobile-menu::before {
                    content: "";
                    position: absolute;
                    left: 0;
                    right: 0;
                    top: 15px;
                    height: 1px;
                    background: var(--color-badge-border);
                    opacity: 0;
                    transition: opacity 0.2s ease;
                    pointer-events: none;
                }
                .mobile-links {
                    display: flex;
                    flex-direction: column;
                    gap: 12px;
                    align-items: center;
                    justify-content: center;
                    padding-top: 28px;
                }
                .mobile-action {
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    padding: 20px 0 10px;
                }
                .nav-link {
                    display: inline-flex;
                    align-items: center;
                    justify-content: center;
                    padding: 10px 16px;
                    border-radius: 999px;
                    border: 1px solid transparent;
                    font-weight: 600;
                    font-size: 16px;
                    color: var(--color-text-secondary);
                    text-decoration: none;
                    line-height: 1;
                    opacity: 1;
                    transition:
                        background-color 0.2s ease,
                        border-color 0.2s ease,
                        color 0.2s ease,
                        transform 0.2s ease;
                }
                .nav-link:hover {
                    color: var(--color-text);
                    background: rgba(255, 255, 255, 0.04);
                    transform: translateY(-1px);
                }
                .nav-link[data-active="true"] {
                    color: #ffffff;
                    background: rgba(255, 255, 255, 0.10);
                    border-color: rgba(255, 255, 255, 0.18);
                    opacity: 1;
                    box-shadow: inset 0 0 0 1px rgba(255, 255, 255, 0.08);
                }
                .nav-link[data-active="true"]:hover {
                    transform: none;
                    background: rgba(255, 255, 255, 0.12);
                }
                .nav-link:focus-visible {
                    outline: none;
                    color: #ffffff;
                    background: rgba(255, 255, 255, 0.16);
                    border-color: rgba(255, 255, 255, 0.32);
                }
                @media (max-width: 1200px) {
                    .navbar { padding: 15px 20px !important; }
                    .desktop-only { display: none !important; }
                    .nav-row { grid-template-columns: 1fr auto; gap: 16px; }
                    .burger { display: flex !important; }
                    .mobile-menu {
                        display: block;
                    }
                    .navbar.is-open .mobile-menu {
                        max-height: 320px;
                        opacity: 1;
                        transform: translateY(0);
                    }
                    .mobile-menu::before {
                        opacity: 0.3;
                    }
                }
                @media (prefers-reduced-motion: reduce) {
                    .brand-link,
                    .brand-mark,
                    .brand-wordmark {
                        transition: none !important;
                        animation: none !important;
                    }
                    .brand-link:hover .brand-mark,
                    .brand-link:focus-visible .brand-mark {
                        transform: none;
                    }
                }
            `}</style>
        </nav>
    );
};
export default Navbar;
