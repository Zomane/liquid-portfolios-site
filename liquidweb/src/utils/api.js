const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:8000';
let csrfToken = null;
export async function initCSRF() {
    try {
        const response = await fetch(`${API_BASE}/api/csrf-token`, {
            credentials: 'include',
        });
        if (response.ok) {
            const data = await response.json();
            csrfToken = data.csrf_token;
            return csrfToken;
        }
    } catch (error) {
        console.error('Failed to fetch CSRF token:', error);
    }
    return null;
}
export function getCSRFToken() {
    return csrfToken;
}
export async function apiFetch(url, options = {}) {
    const token = localStorage.getItem('auth_token');
    const method = (options.method || 'GET').toUpperCase();
    const needsCSRF = ['POST', 'PUT', 'PATCH', 'DELETE'].includes(method);
    if (needsCSRF && !csrfToken) {
        await initCSRF();
    }
    const headers = {
        'Content-Type': 'application/json',
        ...options.headers,
        ...(token ? { 'Authorization': `Bearer ${token}` } : {}),
        ...(needsCSRF && csrfToken ? { 'X-CSRF-Token': csrfToken } : {}),
    };
    const response = await fetch(url, {
        ...options,
        headers,
        credentials: 'include',
    });
    if (response.status === 403 && needsCSRF) {
        const errorData = await response.clone().json().catch(() => ({}));
        if (errorData.detail && errorData.detail.includes('CSRF')) {
            await initCSRF();
            const retryHeaders = {
                ...headers,
                ...(csrfToken ? { 'X-CSRF-Token': csrfToken } : {}),
            };
            return fetch(url, {
                ...options,
                headers: retryHeaders,
                credentials: 'include',
            });
        }
    }
    return response;
}
export { API_BASE };
