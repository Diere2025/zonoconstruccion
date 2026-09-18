export interface User {
  id: number;
  name: string;
  email: string;
  profile: 'admin' | 'user';
  online?: boolean;
  queues?: Queue[];
  companyId: number;
}

export interface Queue {
  id: number;
  name: string;
  color: string;
  greetingMessage?: string;
}

export interface Tag {
  id: number;
  name: string;
  color: string;
}

export interface Contact {
  id: number;
  name: string;
  number: string;
  profilePicUrl?: string | null;
  email?: string;
  isGroup?: boolean;
  extraInfo?: Array<{ id: number; name: string; value: string }>;
  tags?: Tag[];
}

export interface Ticket {
  id: number;
  uuid?: string;
  status: 'open' | 'pending' | 'closed';
  unreadMessages: number;
  lastMessage?: string;
  updatedAt: string;
  createdAt: string;
  contact: Contact;
  user?: User | null;
  userId?: number | null;
  queue?: Queue | null;
  queueId?: number | null;
  whatsappId?: number | null;
  whatsapp?: WhatsappConnection | null;
  isGroup?: boolean;
  tags?: Tag[];
}

export interface Message {
  id: string;
  ticketId: number;
  body: string;
  fromMe: boolean;
  read: boolean;
  mediaType?: 'image' | 'audio' | 'video' | 'application' | 'pdf' | string | null;
  mediaUrl?: string | null;
  createdAt: string;
  updatedAt: string;
  quotedMsg?: Message | null;
  ack?: number; // 0=pending, 1=sent, 2=delivered, 3=read, 4=played
  isPrivate?: boolean; // Nota interna
  senderName?: string;
}

export interface QuickMessage {
  id: number;
  shortcode: string;
  message: string;
  mediaPath?: string | null;
  mediaName?: string | null;
  gerall?: boolean;
  companyId?: number;
}

export interface WhatsappConnection {
  id: number;
  name: string;
  status: 'CONNECTED' | 'DISCONNECTED' | 'PAIRING' | 'qrcode' | string;
  isDefault: boolean;
  number?: string;
  qrcode?: string;
  greetingMessage?: string;
  complationMessage?: string;
  outOfHoursMessage?: string;
  queues?: Queue[];
  queueIds?: number[];
  importOldMessages?: boolean;
  importOldMessagesDays?: number;
  importRecentUnreadDays?: number;
  importOldMessagesStatus?: 'idle' | 'importing' | 'completed' | 'error' | string;
  updatedAt: string;
}
