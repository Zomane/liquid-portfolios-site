import React from 'react';
export const StatsCard = ({ icon: Icon, image, label, value, trend }) => (
    <div
        className="stats-card"
        style={{
            background: 'var(--surface-card)',
            borderRadius: 'var(--border-radius)',
            padding: '24px',
            border: '1px solid var(--color-badge-border)',
            boxShadow: '0 4px 20px rgba(0,0,0,0.1)',
            transition: 'all 0.3s ease',
            cursor: 'default',
            backdropFilter: 'blur(20px)',
            position: 'relative',
            overflow: 'hidden',
        }}
    >
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '16px' }}>
            {image ? (
                <img src={image} alt={label} style={{ width: '24px', height: '24px', objectFit: 'contain' }} />
            ) : Icon ? (
                <Icon size={24} style={{ color: 'var(--color-text-secondary)' }} />
            ) : null}
            <span style={{ fontSize: '14px', color: 'var(--color-text-secondary)', fontWeight: 500 }}>{label}</span>
        </div>
        <div style={{ fontSize: '36px', fontWeight: 700, color: 'var(--color-text)', letterSpacing: '-0.02em', fontVariantNumeric: 'tabular-nums' }}>
            {value}
        </div>
        {trend ? (
            <div
                style={{
                    fontSize: '13px',
                    marginTop: '8px',
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '4px',
                    padding: '4px 8px',
                    borderRadius: '99px',
                    background: trend > 0 ? 'rgba(34, 197, 94, 0.1)' : 'rgba(239, 68, 68, 0.1)',
                    color: trend > 0 ? '#4ade80' : '#f87171',
                }}
            >
                {trend > 0 ? '↑' : trend < 0 ? '↓' : ''} {Math.abs(trend)}%
            </div>
        ) : null}
    </div>
);
export default StatsCard;
