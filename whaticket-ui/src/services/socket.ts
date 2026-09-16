import { io, Socket } from 'socket.io-client';
import { BACKEND_URL } from './api';

let socket: Socket | null = null;

export const getSocket = (): Socket | null => {
  return socket;
};

export const connectSocket = (token?: string): Socket => {
  const activeToken = token || localStorage.getItem('whaticket_token');

  if (socket && socket.connected) {
    return socket;
  }

  if (socket) {
    socket.disconnect();
  }

  socket = io(BACKEND_URL, {
    query: {
      token: activeToken || '',
    },
    transports: ['websocket', 'polling'],
    autoConnect: true,
    reconnection: true,
    reconnectionAttempts: 20,
    reconnectionDelay: 1000,
  });

  socket.on('connect', () => {
    console.log('[Socket] Conectado exitosamente');
    // Unirse a los canales de notificaciones y listas de tickets
    socket?.emit('joinNotification');
    socket?.emit('joinTickets', 'open');
    socket?.emit('joinTickets', 'pending');
    socket?.emit('joinTickets', 'closed');
  });

  socket.on('disconnect', (reason) => {
    console.warn('[Socket] Desconectado:', reason);
  });

  socket.on('connect_error', (error) => {
    console.error('[Socket] Error de conexión:', error.message);
  });

  return socket;
};

export const disconnectSocket = () => {
  if (socket) {
    socket.emit('leaveNotification');
    socket.emit('leaveTickets', 'open');
    socket.emit('leaveTickets', 'pending');
    socket.emit('leaveTickets', 'closed');
    socket.disconnect();
    socket = null;
  }
};

export const joinTicketRoom = (ticketId: number | string) => {
  if (socket && ticketId) {
    socket.emit('joinChatBox', String(ticketId));
  }
};

export const leaveTicketRoom = (ticketId: number | string) => {
  if (socket && ticketId) {
    socket.emit('leaveChatBox', String(ticketId));
  }
};
