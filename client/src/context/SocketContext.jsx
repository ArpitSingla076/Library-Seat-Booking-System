import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { io } from 'socket.io-client';
import { getSession } from '../services/session';

const SocketContext = createContext(null);

export const SocketProvider = ({ children }) => {
  const socketRef = useRef(null);
  const [socket, setSocket] = useState(null);
  const [connected, setConnected] = useState(false);

  const connect = useCallback(() => {
    if (socketRef.current) return;

    // In development the browser connects straight to the API server (no websocket proxy needed,
    // which also avoids the noisy "ws proxy error" lines in the Vite terminal).
    const socketUrl =
      import.meta.env.VITE_SOCKET_URL ||
      (import.meta.env.VITE_API_URL
        ? import.meta.env.VITE_API_URL.replace(/\/api\/?$/, '')
        : import.meta.env.DEV
          ? `${window.location.protocol}//${window.location.hostname}:5000`
          : '/');

    const s = io(socketUrl, {
      // function form: the freshest token for this tab's role is used on every (re)connect
      auth: (cb) => cb({ token: getSession()?.token }),
      transports: ['websocket', 'polling'],
      reconnectionAttempts: 5,
      reconnectionDelay: 2000,
    });

    s.on('connect', () => setConnected(true));
    s.on('disconnect', () => setConnected(false));
    s.on('connect_error', (err) => console.error('Socket error:', err.message));

    socketRef.current = s;
    setSocket(s); // state (not just a ref) so listeners re-attach once the socket exists
  }, []);

  const disconnect = useCallback(() => {
    socketRef.current?.disconnect();
    socketRef.current = null;
    setSocket(null);
    setConnected(false);
  }, []);

  // Stable subscribe helper: identity changes only when the socket changes
  const on = useCallback(
    (event, handler) => {
      if (!socket) return () => {};
      socket.on(event, handler);
      return () => socket.off(event, handler);
    },
    [socket]
  );

  useEffect(() => () => socketRef.current?.disconnect(), []);

  const value = useMemo(
    () => ({ socket, connected, connect, disconnect, on }),
    [socket, connected, connect, disconnect, on]
  );

  return <SocketContext.Provider value={value}>{children}</SocketContext.Provider>;
};

export const useSocket = () => useContext(SocketContext);
