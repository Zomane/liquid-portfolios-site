import { useEffect, useRef, useState } from 'react';
const WS_BASE_URL = import.meta.env.VITE_WS_URL ||
  (window.location.protocol === 'https:' ? 'wss:' : 'ws:') + '//' + window.location.host;
const RECONNECT_DELAYS = [1000, 2000, 5000, 10000, 30000];
const PING_INTERVAL = 30000;
export function usePortfolioWebSocket(onUpdate, enabled = true) {
  const [connected, setConnected] = useState(false);
  const [error, setError] = useState(null);
  const wsRef = useRef(null);
  const reconnectTimeoutRef = useRef(null);
  const reconnectAttemptsRef = useRef(0);
  const pingIntervalRef = useRef(null);
  const enabledRef = useRef(enabled);
  useEffect(() => {
    enabledRef.current = enabled;
  }, [enabled]);
  useEffect(() => {
    if (!enabled) {
      if (wsRef.current) {
        wsRef.current.close();
        wsRef.current = null;
      }
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
        reconnectTimeoutRef.current = null;
      }
      if (pingIntervalRef.current) {
        clearInterval(pingIntervalRef.current);
        pingIntervalRef.current = null;
      }
      setConnected(false);
      return;
    }
    function connect() {
      try {
        const wsUrl = `${WS_BASE_URL}/api/ws/portfolios`;
        console.log('[WebSocket] Connecting to:', wsUrl);
        const ws = new WebSocket(wsUrl);
        wsRef.current = ws;
        ws.onopen = () => {
          console.log('[WebSocket] Connected');
          setConnected(true);
          setError(null);
          reconnectAttemptsRef.current = 0;
          pingIntervalRef.current = setInterval(() => {
            if (ws.readyState === WebSocket.OPEN) {
              ws.send('ping');
            }
          }, PING_INTERVAL);
        };
        ws.onmessage = (event) => {
          try {
            if (event.data === 'pong') {
              return;
            }
            const message = JSON.parse(event.data);
            console.log('[WebSocket] Received:', message);
            if (message.type === 'portfolio_update') {
              onUpdate?.(message);
            }
          } catch (err) {
            console.error('[WebSocket] Failed to parse message:', err);
          }
        };
        ws.onerror = (event) => {
          console.error('[WebSocket] Error:', event);
          setError('WebSocket connection error');
        };
        ws.onclose = (event) => {
          console.log('[WebSocket] Closed:', event.code, event.reason);
          setConnected(false);
          if (pingIntervalRef.current) {
            clearInterval(pingIntervalRef.current);
            pingIntervalRef.current = null;
          }
          if (enabledRef.current) {
            const attempt = reconnectAttemptsRef.current;
            const delay = RECONNECT_DELAYS[Math.min(attempt, RECONNECT_DELAYS.length - 1)];
            console.log(`[WebSocket] Reconnecting in ${delay}ms (attempt ${attempt + 1})`);
            reconnectTimeoutRef.current = setTimeout(() => {
              reconnectAttemptsRef.current += 1;
              connect();
            }, delay);
          }
        };
      } catch (err) {
        console.error('[WebSocket] Failed to create connection:', err);
        setError(err.message);
      }
    }
    connect();
    return () => {
      enabledRef.current = false;
      if (wsRef.current) {
        wsRef.current.close();
        wsRef.current = null;
      }
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
        reconnectTimeoutRef.current = null;
      }
      if (pingIntervalRef.current) {
        clearInterval(pingIntervalRef.current);
        pingIntervalRef.current = null;
      }
    };
  }, [enabled, onUpdate]);
  return { connected, error };
}
