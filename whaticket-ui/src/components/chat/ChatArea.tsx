import React, { useState, useEffect, useLayoutEffect, useRef, useMemo } from 'react';
import { 
  Check, 
  ChevronDown, 
  CheckCircle2, 
  Send, 
  Paperclip, 
  FileText, 
  StickyNote, 
  PenTool, 
  Zap, 
  ArrowLeft,
  X,
  Download,
  Copy,
  Info,
  ExternalLink,
  Plus,
  Smile,
  Clock,
  Calendar,
  Mic,
  Trash2,
  StopCircle,
  RefreshCw,
  ChevronLeft,
  ChevronRight,
  CheckSquare,
  Square,
  Repeat,
  UserRound,
  AlertTriangle,
  Smartphone,
  RotateCcw
} from 'lucide-react';
import { useChatStore } from '../../store/chatStore';
import { useAuthStore } from '../../store/authStore';
import { Message, QuickMessage } from '../../types';
import { api, getMediaUrl } from '../../services/api';
import { toast } from 'sonner';
import { format, isSameDay } from 'date-fns';
import { formatPhoneNumber, cleanPhoneForCopy } from '../../utils/phone';
import { WhatsAppText } from './WhatsAppText';
import { WhatsAppAudioPlayer } from './WhatsAppAudioPlayer';
import { validateScheduledAttachments } from '../../utils/scheduledAttachments';

interface AttachedMediaItem {
  id: string;
  file: File;
  name: string;
  previewUrl: string;
  isPdf: boolean;
}

const COMMON_EMOJIS = [
  '😀', '😃', '😄', '😁', '😅', '😂', '🤣', '😊', '😇', '🙂', '😉', '😍',
  '🥰', '😘', '😋', '😜', '🤪', '🤗', '🤔', '🤐', '😎', '🥳', '🥺', '😭',
  '👍', '👎', '👌', '✌️', '🤞', '👏', '🙌', '🤝', '🙏', '💪', '❤️', '💙',
  '🔥', '✨', '⚡', '💡', '📌', '📍', '💧', '📦', '🛒', '🚛', '🏗️', '🔨',
  '🪚', '🧱', '🪵', '⚙️', '📞', '✉️', '📅', '⏰', '⭐', '🎉', '🚀', '✅'
];

interface ChatAreaProps {
  onToggleContactDrawer: () => void;
  onBackMobile?: () => void;
  isContactDrawerOpen?: boolean;
}

export const ChatArea: React.FC<ChatAreaProps> = ({
  onToggleContactDrawer,
  onBackMobile,
  isContactDrawerOpen = false,
}) => {
  const { 
    activeTicket, 
    selectTicket,
    messages, 
    queues, 
    users,
    whatsapps,
    quickMessages,
    isLoadingMessages, 
    hasMoreMessages,
    messagesError,
    fetchMessages,
    isSendingMessage,
    sendMessage, 
    updateTicketStatus, 
    updateTicketQueue,
    updateTicketUser
  } = useChatStore();

  const { user } = useAuthStore();

  const [inputText, setInputText] = useState('');
  const [isPrivateNote, setIsPrivateNote] = useState(false);
  const [signMessage, setSignMessage] = useState(true);
  const [attachedFiles, setAttachedFiles] = useState<AttachedMediaItem[]>([]);
  const [isDragging, setIsDragging] = useState(false);
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [showScheduleModal, setShowScheduleModal] = useState(false);
  const [scheduleTab, setScheduleTab] = useState<'FECHA' | 'RECURRENCIA'>('FECHA');
  const [scheduleSendAt, setScheduleSendAt] = useState('');
  const [scheduleBody, setScheduleBody] = useState('');
  const [isScheduling, setIsScheduling] = useState(false);
  const [recurrenceEnabled, setRecurrenceEnabled] = useState(false);
  const [recurrenceInterval, setRecurrenceInterval] = useState(1);
  const [recurrenceUnit, setRecurrenceUnit] = useState<'dia' | 'semana' | 'mes'>('dia');
  const [recurrenceEndType, setRecurrenceEndType] = useState<'never' | 'on_date'>('never');
  const [recurrenceEndDate, setRecurrenceEndDate] = useState('');

  // Audio Recording State
  const [isRecordingAudio, setIsRecordingAudio] = useState(false);
  const [recordingSeconds, setRecordingSeconds] = useState(0);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const recordingTimerRef = useRef<any>(null);

  const [showSlashPopover, setShowSlashPopover] = useState(false);
  const [copiedPhone, setCopiedPhone] = useState(false);
  const [isResolverMenuOpen, setIsResolverMenuOpen] = useState(false);
  const [isQueueMenuOpen, setIsQueueMenuOpen] = useState(false);
  const [isUserMenuOpen, setIsUserMenuOpen] = useState(false);

  const closeAllHeaderMenus = () => {
    setIsResolverMenuOpen(false);
    setIsQueueMenuOpen(false);
    setIsUserMenuOpen(false);
  };

  const toggleResolverMenu = () => {
    setIsResolverMenuOpen((prev) => !prev);
    setIsQueueMenuOpen(false);
    setIsUserMenuOpen(false);
  };

  const toggleQueueMenu = () => {
    setIsQueueMenuOpen((prev) => !prev);
    setIsResolverMenuOpen(false);
    setIsUserMenuOpen(false);
  };

  const toggleUserMenu = () => {
    setIsUserMenuOpen((prev) => !prev);
    setIsResolverMenuOpen(false);
    setIsQueueMenuOpen(false);
  };

  useEffect(() => {
    const handleOutsideClick = (e: MouseEvent) => {
      const target = e.target as HTMLElement | null;
      if (!target) return;
      if (!target.closest('[data-dropdown="header-menu"]')) {
        closeAllHeaderMenus();
      }
    };
    document.addEventListener('mousedown', handleOutsideClick);
    return () => document.removeEventListener('mousedown', handleOutsideClick);
  }, []);

  const messagesContainerRef = useRef<HTMLDivElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const stickToBottomRef = useRef(true);
  const historyAnchorRef = useRef<{ element: HTMLElement; top: number } | null>(null);

  const scrollToBottom = (behavior: ScrollBehavior = 'auto') => {
    if (messagesContainerRef.current) {
      messagesContainerRef.current.scrollTop = messagesContainerRef.current.scrollHeight;
    }
    messagesEndRef.current?.scrollIntoView({ behavior });
  };

  useLayoutEffect(() => {
    stickToBottomRef.current = true;
    historyAnchorRef.current = null;
    closeAllHeaderMenus();
  }, [activeTicket?.id]);

  // Preserve the visible message while older history is prepended.
  useLayoutEffect(() => {
    const container = messagesContainerRef.current;
    const anchor = historyAnchorRef.current;
    if (container && anchor?.element.isConnected) {
      container.scrollTop += anchor.element.getBoundingClientRect().top - anchor.top;
    } else if (stickToBottomRef.current && messages.length > 0) {
      scrollToBottom('auto');
    }
    if (!isLoadingMessages) historyAnchorRef.current = null;
  }, [messages, isLoadingMessages, hasMoreMessages]);

  const loadOlderMessages = () => {
    if (!activeTicket || isLoadingMessages) return;
    const container = messagesContainerRef.current;
    const top = container?.getBoundingClientRect().top ?? 0;
    const element = container && Array.from(container.querySelectorAll<HTMLElement>('[data-message-id]'))
      .find((item) => item.getBoundingClientRect().bottom > top);
    historyAnchorRef.current = element ? { element, top: element.getBoundingClientRect().top } : null;
    stickToBottomRef.current = false;
    void fetchMessages(activeTicket.id);
  };

  // Limpieza de audio al desmontar
  useEffect(() => {
    return () => {
      if (recordingTimerRef.current) clearInterval(recordingTimerRef.current);
      if (mediaRecorderRef.current) {
        try {
          mediaRecorderRef.current.stream?.getTracks().forEach((t) => t.stop());
        } catch {}
      }
    };
  }, []);

  // Filtrado reactivo en tiempo real para el menú emergente de respuestas rápidas tipo Whaticket
  const filteredQuickMessages = useMemo(() => {
    if (!inputText.startsWith('/')) return [];
    const q = inputText.slice(1).trim().toLowerCase();
    if (!q) return quickMessages;
    return quickMessages.filter(
      (item) =>
        item.shortcode.toLowerCase().includes(q) ||
        item.message.toLowerCase().includes(q)
    );
  }, [quickMessages, inputText]);

  if (!activeTicket) {
    return (
      <div className="flex-1 bg-white dark:bg-slate-900 flex flex-col items-center justify-center text-slate-500 dark:text-slate-400 p-8 select-none">
        <p className="text-sm font-normal text-slate-600 dark:text-slate-300">
          Selecciona un chat para empezar a chatear.
        </p>
      </div>
    );
  }

  const contact = activeTicket.contact;
  const currentQueue = activeTicket.queue || queues.find((q) => q.id === activeTicket.queueId);
  const linkedWhatsapp = whatsapps.find((whatsapp) => whatsapp.id === activeTicket.whatsappId);
  const currentWhatsapp = activeTicket.whatsapp || linkedWhatsapp;
  const lineName = activeTicket.whatsapp?.name || linkedWhatsapp?.name || (activeTicket.whatsappId ? `Línea #${activeTicket.whatsappId}` : 'Sin línea');
  const isLineConnected = (activeTicket.whatsapp?.status === 'CONNECTED') || (linkedWhatsapp?.status === 'CONNECTED');
  const needsWhatsappAttention = !activeTicket.whatsappId || !isLineConnected;

  const copyPhoneNumber = () => {
    if (contact?.number) {
      const toCopy = cleanPhoneForCopy(contact.number);
      navigator.clipboard.writeText(toCopy);
      setCopiedPhone(true);
      setTimeout(() => setCopiedPhone(false), 2000);
      toast.success(`Copiado: ${toCopy}`);
    }
  };

  const transferTicket = async (userId: number | null) => {
    try {
      await updateTicketUser(activeTicket.id, userId);
      closeAllHeaderMenus();
      toast.success(userId === null ? 'Conversación sin asignar' : 'Conversación transferida');
    } catch (err) {
      console.error('Error al transferir conversación:', err);
      toast.error('No se pudo transferir la conversación. Intentá nuevamente.');
    }
  };

  const changeTicketStatus = async (status: 'open' | 'pending' | 'closed') => {
    try {
      await updateTicketStatus(activeTicket.id, status);
      closeAllHeaderMenus();
      if (status === 'closed') {
        await selectTicket(null);
        toast.success('Conversación resuelta');
      }
    } catch (err: any) {
      console.error('Error al actualizar estado de la conversación:', err);
      toast.error(err?.response?.data?.error || err?.response?.data?.message || 'No se pudo actualizar el estado de la conversación. Intentá nuevamente.');
    }
  };

  const changeTicketQueue = async (queueId: number) => {
    try {
      await updateTicketQueue(activeTicket.id, queueId);
      closeAllHeaderMenus();
      toast.success('Departamento actualizado');
    } catch (err) {
      console.error('Error al cambiar departamento:', err);
      toast.error('No se pudo cambiar el departamento. Intentá nuevamente.');
    }
  };


  const addFilesToAttachments = (files: File[]) => {
    const newItems: AttachedMediaItem[] = files.map((file) => {
      const isPdf = file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf');
      const isImg = file.type.startsWith('image/');
      return {
        id: `${Date.now()}-${Math.random().toString(36).substring(2, 8)}`,
        file,
        name: file.name,
        previewUrl: isImg ? URL.createObjectURL(file) : '',
        isPdf,
      };
    });
    setAttachedFiles((prev) => [...prev, ...newItems]);
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (files.length > 0) {
      addFilesToAttachments(files);
    }
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const removeAttachment = (id: string) => {
    setAttachedFiles((prev) => {
      const target = prev.find((item) => item.id === id);
      if (target?.previewUrl) {
        URL.revokeObjectURL(target.previewUrl);
      }
      return prev.filter((item) => item.id !== id);
    });
  };

  const clearAllAttachments = () => {
    attachedFiles.forEach((item) => {
      if (item.previewUrl) URL.revokeObjectURL(item.previewUrl);
    });
    setAttachedFiles([]);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const files = Array.from(e.dataTransfer.files || []);
    if (files.length > 0) {
      addFilesToAttachments(files);
    }
  };

  const handleEmojiClick = (emoji: string) => {
    setInputText((prev) => prev + emoji);
    setShowEmojiPicker(false);
    textareaRef.current?.focus();
  };

  const handleSendMessage = async () => {
    if (activeTicket.status === 'closed') {
      toast.error('La conversación está resuelta. Reabrí el ticket para enviar mensajes.');
      return;
    }
    const trimmed = inputText.trim();
    if (!trimmed && attachedFiles.length === 0) return;

    let bodyToSend = trimmed;
    if (signMessage && user?.name && !isPrivateNote) {
      bodyToSend = `*${user.name}:*\n${bodyToSend}`;
    }

    try {
      await sendMessage({
        body: bodyToSend,
        media: attachedFiles.length > 0 ? attachedFiles[0].file : null,
        medias: attachedFiles.map((a) => a.file),
        isPrivate: isPrivateNote,
      });

      setInputText('');
      clearAllAttachments();
      setIsPrivateNote(false);
      setShowSlashPopover(false);
    } catch (err) {
      console.error('Error al enviar:', err);
    }
  };

  // Audio Recording Handlers
  const startAudioRecording = async () => {
    try {
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        toast.error('El navegador no soporta grabación de audio o no tiene permisos HTTPS');
        return;
      }
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      
      let mimeType = 'audio/webm;codecs=opus';
      if (!MediaRecorder.isTypeSupported(mimeType)) {
        mimeType = 'audio/ogg;codecs=opus';
        if (!MediaRecorder.isTypeSupported(mimeType)) {
          mimeType = 'audio/mp4';
          if (!MediaRecorder.isTypeSupported(mimeType)) {
            mimeType = '';
          }
        }
      }

      const recorder = mimeType ? new MediaRecorder(stream, { mimeType }) : new MediaRecorder(stream);
      audioChunksRef.current = [];

      recorder.ondataavailable = (e) => {
        if (e.data && e.data.size > 0) {
          audioChunksRef.current.push(e.data);
        }
      };

      mediaRecorderRef.current = recorder;
      recorder.start(100);
      setIsRecordingAudio(true);
      setRecordingSeconds(0);

      if (recordingTimerRef.current) clearInterval(recordingTimerRef.current);
      recordingTimerRef.current = setInterval(() => {
        setRecordingSeconds((prev) => prev + 1);
      }, 1000);
    } catch (err: any) {
      console.error('Error accediendo al micrófono:', err);
      toast.error('No se pudo acceder al micrófono. Verifica los permisos.');
    }
  };

  const cancelAudioRecording = () => {
    if (recordingTimerRef.current) {
      clearInterval(recordingTimerRef.current);
      recordingTimerRef.current = null;
    }
    if (mediaRecorderRef.current) {
      if (mediaRecorderRef.current.state !== 'inactive') {
        mediaRecorderRef.current.stop();
      }
      mediaRecorderRef.current.stream.getTracks().forEach((track) => track.stop());
      mediaRecorderRef.current = null;
    }
    audioChunksRef.current = [];
    setIsRecordingAudio(false);
    setRecordingSeconds(0);
  };

  const stopAndSendAudioRecording = async () => {
    if (!mediaRecorderRef.current) return;

    if (recordingTimerRef.current) {
      clearInterval(recordingTimerRef.current);
      recordingTimerRef.current = null;
    }

    const recorder = mediaRecorderRef.current;
    
    recorder.onstop = async () => {
      try {
        const stream = recorder.stream;
        stream.getTracks().forEach((track) => track.stop());

        const mime = recorder.mimeType || 'audio/mp4';
        const blob = new Blob(audioChunksRef.current, { type: mime });
        
        if (blob.size < 1000) {
          toast.error('Audio demasiado corto');
          cancelAudioRecording();
          return;
        }

        const ext = mime.includes('mp4') ? 'm4a' : mime.includes('ogg') ? 'ogg' : 'mp3';
        const filename = `audio-record-site-${Date.now()}.${ext}`;
        const audioFile = new File([blob], filename, { type: mime });

        await sendMessage({
          body: filename,
          media: audioFile,
          medias: [audioFile],
          isPrivate: isPrivateNote,
        });

        setIsRecordingAudio(false);
        setRecordingSeconds(0);
        audioChunksRef.current = [];
        mediaRecorderRef.current = null;
      } catch (err) {
        console.error('Error al enviar audio grabado:', err);
        toast.error('Error al procesar el audio');
        cancelAudioRecording();
      }
    };

    if (recorder.state !== 'inactive') {
      recorder.stop();
    }
  };

  const formatAudioTime = (sec: number) => {
    const mins = Math.floor(sec / 60);
    const s = sec % 60;
    return `${mins.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  };

  const handleScheduleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isScheduling || !activeTicket) return;
    // The current schedule API accepts one file, unlike immediate messages.
    const attachmentError = validateScheduledAttachments(attachedFiles);
    if (attachmentError) {
      toast.error(attachmentError);
      return;
    }
    if (!scheduleSendAt) {
      toast.error('Selecciona una fecha y hora para programar');
      return;
    }
    if (!scheduleBody.trim() && attachedFiles.length === 0) {
      toast.error('El mensaje no puede estar vacío');
      return;
    }

    let bodyToSend = scheduleBody.trim();
    if (signMessage && user?.name && !isPrivateNote) {
      bodyToSend = `*${user.name}:*\n${bodyToSend}`;
    }

    setIsScheduling(true);
    try {
      const res = await api.post('/schedules', {
        body: bodyToSend || (attachedFiles[0]?.name ?? 'Mensaje programado'),
        sendAt: new Date(scheduleSendAt).toISOString(),
        contactId: activeTicket.contact?.id || (activeTicket as any).contactId,
        userId: user?.id,
      });

      if (attachedFiles.length > 0 && res.data?.id) {
        const formData = new FormData();
        formData.append('file', attachedFiles[0].file, attachedFiles[0].name);
        await api.post(`/schedules/${res.data.id}/media-upload`, formData);
      }

      toast.success('Mensaje programado exitosamente');
      setShowScheduleModal(false);
      setInputText('');
      clearAllAttachments();
    } catch (err: any) {
      console.error('Error scheduling message:', err);
      toast.error(err.response?.data?.message || 'Error al programar el mensaje');
    } finally {
      setIsScheduling(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      // Si el popover de respuestas rápidas está abierto y hay resultados, selecciona el primero con Enter
      if (showSlashPopover && filteredQuickMessages.length > 0) {
        e.preventDefault();
        handleSelectQuickMessage(filteredQuickMessages[0]);
        return;
      }
      e.preventDefault();
      handleSendMessage();
    } else if (e.key === 'Escape') {
      setShowSlashPopover(false);
      setShowEmojiPicker(false);
    }
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const val = e.target.value;
    setInputText(val);

    // Si comienza con "/", mostramos el popover flotante
    if (val.startsWith('/')) {
      setShowSlashPopover(true);
    } else {
      setShowSlashPopover(false);
    }
  };

  const handleSelectQuickMessage = async (item: QuickMessage) => {
    const contactName = activeTicket?.contact?.name || 'Cliente';
    const formatted = item.message
      .replace(/\{\{\s*firstName\s*\}\}/gi, contactName.split(' ')[0] || contactName)
      .replace(/\{\{\s*name\s*\}\}/gi, contactName)
      .replace(/\{\{\s*user\s*\}\}/gi, user?.name || '')
      .replace(/\{\{\s*userName\s*\}\}/gi, user?.name || '');

    setInputText(formatted);
    setShowSlashPopover(false);

    if (item.mediaPath) {
      const filename = item.mediaName || item.mediaPath.split('/').pop() || 'adjunto';
      const targetUrl = getMediaUrl(item.mediaPath);

      try {
        let res = await fetch(targetUrl);
        if (!res.ok) {
          const baseName = item.mediaPath.split('/').pop() || '';
          res = await fetch(getMediaUrl(`quickMessage/${baseName}`));
        }
        if (!res.ok) throw new Error(`HTTP ${res.status}`);

        const blob = await res.blob();
        let cleanName = filename.replace(/\.jfif$/i, '.jpeg');
        let mimeType = blob.type;
        const lower = cleanName.toLowerCase();
        if (!mimeType || mimeType === 'application/octet-stream' || lower.endsWith('.pdf')) {
          if (lower.endsWith('.pdf')) mimeType = 'application/pdf';
          else if (lower.endsWith('.png')) mimeType = 'image/png';
          else if (lower.endsWith('.webp')) mimeType = 'image/webp';
          else if (lower.endsWith('.jpg') || lower.endsWith('.jpeg')) mimeType = 'image/jpeg';
        }
        const file = new File([blob], cleanName, { type: mimeType });
        addFilesToAttachments([file]);
      } catch (err) {
        console.error('Error al precargar adjunto de respuesta rápida:', err);
      }
    }

    // Regresar el foco al campo de texto
    setTimeout(() => {
      textareaRef.current?.focus();
    }, 50);
  };

  const formatMsgTime = (d?: string) => {
    if (!d) return '';
    try {
      const parsed = new Date(d);
      return isNaN(parsed.getTime()) ? '' : format(parsed, 'HH:mm');
    } catch {
      return '';
    }
  };

  const checkIfPdf = (mediaType?: string | null, body?: string | null, mediaUrl?: string | null) => {
    if (mediaType === 'application' || mediaType === 'pdf') return true;
    const b = String(body || '').toLowerCase();
    const u = String(mediaUrl || '').toLowerCase();
    return b.endsWith('.pdf') || u.endsWith('.pdf');
  };

  const checkIfAudio = (mediaType?: string | null, body?: string | null, mediaUrl?: string | null) => {
    if (mediaType === 'audio' || (mediaType && mediaType.startsWith('audio/'))) return true;
    const b = String(body || '').toLowerCase();
    const u = String(mediaUrl || '').toLowerCase();
    return b.endsWith('.mp3') || b.endsWith('.ogg') || b.endsWith('.m4a') || b.endsWith('.webm') || b.includes('audio-record') || b === 'áudio' || b === 'audio' ||
           u.endsWith('.mp3') || u.endsWith('.ogg') || u.endsWith('.m4a') || u.endsWith('.webm') || u.includes('audio-record');
  };

  const checkIfVideo = (mediaType?: string | null, body?: string | null, mediaUrl?: string | null) => {
    if (mediaType === 'video' || (mediaType && mediaType.startsWith('video/'))) return true;
    const b = String(body || '').toLowerCase();
    const u = String(mediaUrl || '').toLowerCase();
    return (b.endsWith('.mp4') || u.endsWith('.mp4')) && mediaType !== 'audio' && !b.includes('audio');
  };

  return (
    <div className="flex-1 flex flex-col h-full max-h-full w-full min-w-0 bg-slate-100 dark:bg-slate-950 overflow-hidden relative">
      {/* 1. Header (Sticky Top, Flex-Shrink-0 para no desaparecer nunca en móvil) */}
      <header className="sticky top-0 bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 px-3 py-2 flex items-center justify-between z-30 select-none shadow-xs flex-shrink-0 w-full">
        <div className="flex items-center gap-2 min-w-0">
          {/* Botón de regreso para celular */}
          {onBackMobile && (
            <button
              onClick={onBackMobile}
              className="md:hidden p-2 -ml-1 mr-1 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200 hover:bg-slate-200 active:scale-95 transition-all flex items-center justify-center flex-shrink-0"
              title="Volver a la lista de chats"
            >
              <ArrowLeft className="w-5 h-5" />
            </button>
          )}

          {/* Contact Avatar */}
          <div className="w-10 h-10 rounded-full bg-slate-200 dark:bg-slate-700 flex items-center justify-center font-bold text-slate-700 dark:text-slate-200 text-sm overflow-hidden flex-shrink-0">
            {contact?.profilePicUrl ? (
              <img
                src={contact.profilePicUrl}
                alt={contact.name}
                className="w-full h-full object-cover"
              />
            ) : (
              contact?.name?.slice(0, 2).toUpperCase() || 'ZC'
            )}
          </div>

          {/* Contact Details */}
          <div className="flex flex-col min-w-0 truncate">
            <span className="font-bold text-sm text-slate-900 dark:text-slate-100 leading-snug truncate">
              {contact?.name || formatPhoneNumber(contact?.number) || 'Sin nombre'}
            </span>
            <div className="flex items-center gap-2 text-xs text-slate-500">
              <span className="flex items-center gap-1 font-mono text-[11px] truncate">
                {formatPhoneNumber(contact?.number)}
              </span>
              <button
                onClick={copyPhoneNumber}
                title="Copiar teléfono"
                className="hover:text-blue-600 transition-colors flex-shrink-0 cursor-pointer"
              >
                {copiedPhone ? (
                  <Check className="w-3 h-3 text-emerald-500" />
                ) : (
                  <Copy className="w-3 h-3" />
                )}
              </button>
            </div>
          </div>

          {/* Department Interactive Badge */}
          <div className="relative ml-1 flex-shrink-0" data-dropdown="header-menu">
            <button
              type="button"
              onClick={toggleQueueMenu}
              aria-expanded={isQueueMenuOpen}
              className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold text-white shadow-xs transition-opacity hover:opacity-90 cursor-pointer"
              style={{ backgroundColor: currentQueue?.color || '#3b82f6' }}
            >
              <span className="max-w-[80px] sm:max-w-none truncate">{currentQueue?.name || 'Sin depto'}</span>
              <ChevronDown className="w-3 h-3 opacity-80 flex-shrink-0" />
            </button>

            {isQueueMenuOpen && (
              <div className="absolute left-0 top-8 w-52 bg-white dark:bg-slate-800 rounded-xl shadow-xl border border-slate-200 dark:border-slate-700 p-1.5 z-50 flex flex-col gap-0.5">
                <span className="text-[10px] uppercase font-bold text-slate-400 px-2 py-1">
                  Reasignar departamento:
                </span>
                {queues.map((q) => (
                  <button
                    key={q.id}
                    type="button"
                    onClick={() => changeTicketQueue(q.id)}
                    className="flex items-center gap-2 px-2 py-1.5 text-xs text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-lg text-left cursor-pointer"
                  >
                    <span
                      className="w-2.5 h-2.5 rounded-full"
                      style={{ backgroundColor: q.color || '#3b82f6' }}
                    />
                    <span className="truncate">{q.name}</span>
                  </button>
                ))}
              </div>
            )}
          </div>

          <div className="relative flex-shrink-0" data-dropdown="header-menu">
            <button
              type="button"
              onClick={toggleUserMenu}
              aria-expanded={isUserMenuOpen}
              title="Transferir conversación"
              className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-medium text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800 cursor-pointer"
            >
              <UserRound className="h-3.5 w-3.5" />
              <span className="hidden max-w-[96px] truncate lg:inline">{activeTicket.user?.name || 'Sin asignar'}</span>
              <ChevronDown className="h-3 w-3" />
            </button>

            {isUserMenuOpen && (
              <div className="absolute left-0 top-8 z-50 flex w-56 flex-col gap-0.5 rounded-xl border border-slate-200 bg-white p-1.5 shadow-xl dark:border-slate-700 dark:bg-slate-800">
                <span className="px-2 py-1 text-[10px] font-bold uppercase text-slate-400">Transferir a:</span>
                {user && activeTicket.userId !== user.id && (
                  <button
                    type="button"
                    onClick={() => transferTicket(user.id)}
                    className="rounded-lg bg-blue-50 px-2 py-1.5 text-left text-xs font-semibold text-blue-700 hover:bg-blue-100 dark:bg-blue-950/50 dark:text-blue-300 dark:hover:bg-blue-950"
                  >
                    Mantener conmigo
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => transferTicket(null)}
                  className="rounded-lg px-2 py-1.5 text-left text-xs text-slate-700 hover:bg-slate-100 dark:text-slate-200 dark:hover:bg-slate-700"
                >
                  Sin asignar
                </button>
                {users.map((candidate) => (
                  <button
                    key={candidate.id}
                    type="button"
                    onClick={() => transferTicket(candidate.id)}
                    className="flex items-center gap-2 rounded-lg px-2 py-1.5 text-left text-xs text-slate-700 hover:bg-slate-100 dark:text-slate-200 dark:hover:bg-slate-700"
                  >
                    <span className="flex h-5 w-5 items-center justify-center rounded-full bg-blue-100 text-[10px] font-bold text-blue-700 dark:bg-blue-950/60 dark:text-blue-300">
                      {candidate.name.slice(0, 1).toUpperCase()}
                    </span>
                    <span className="truncate">{candidate.name}</span>
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* WhatsApp Line Informative Badge (Solo informativo, no editable) */}
          <div
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-slate-50/90 px-2.5 py-1 text-xs text-slate-700 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300 select-none flex-shrink-0"
            title={`Línea receptora: ${lineName}${isLineConnected ? ' (Conectada)' : ' (Desconectada / Inactiva)'}`}
          >
            <Smartphone className="h-3.5 w-3.5 text-slate-500 dark:text-slate-400 flex-shrink-0" />
            <span className="max-w-[130px] truncate sm:max-w-none font-semibold">
              {lineName}
            </span>
            <span
              className={`h-2 w-2 rounded-full flex-shrink-0 ${
                isLineConnected
                  ? 'bg-emerald-500 ring-2 ring-emerald-200 dark:ring-emerald-900'
                  : 'bg-slate-400'
              }`}
            />
          </div>
        </div>

        {/* Header Right Actions */}
        <div className="flex items-center gap-1.5 flex-shrink-0">
          {/* Botón Resolver o Reabrir */}
          {activeTicket.status === 'closed' ? (
            <button
              type="button"
              onClick={() => changeTicketStatus('open')}
              className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold shadow-md shadow-blue-600/20 transition active:scale-95 cursor-pointer"
              title="Reabrir conversación"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span>Reabrir</span>
            </button>
          ) : (
            <div className="relative" data-dropdown="header-menu">
              <div className="flex items-center rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold shadow-md shadow-emerald-600/20 overflow-hidden">
                <button
                  type="button"
                  onClick={() => changeTicketStatus('closed')}
                  className="px-2.5 sm:px-3 py-1.5 flex items-center gap-1 border-r border-emerald-500/40 hover:bg-emerald-600/50 cursor-pointer"
                  title="Cerrar ticket como resuelto"
                >
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  <span className="hidden sm:inline">Resolver</span>
                </button>
                <button
                  type="button"
                  onClick={toggleResolverMenu}
                  aria-expanded={isResolverMenuOpen}
                  className="px-1.5 py-1.5 hover:bg-emerald-600/50 cursor-pointer"
                >
                  <ChevronDown className="w-3 h-3" />
                </button>
              </div>

              {/* Resolver Dropdown */}
              {isResolverMenuOpen && (
                <div className="absolute right-0 top-10 w-52 bg-white dark:bg-slate-800 rounded-xl shadow-xl border border-slate-200 dark:border-slate-700 p-1.5 z-50 flex flex-col gap-1">
                  {activeTicket.status === 'pending' && (
                    <button
                      type="button"
                      onClick={() => changeTicketStatus('open')}
                      className="px-2.5 py-2 text-xs font-medium text-blue-700 dark:text-blue-300 hover:bg-blue-50 dark:hover:bg-blue-950/40 rounded-lg text-left cursor-pointer"
                    >
                      Tomar en atención
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => changeTicketStatus('closed')}
                    className="px-2.5 py-2 text-xs font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-lg text-left cursor-pointer"
                  >
                    Resolver directo
                  </button>
                  <button
                    type="button"
                    onClick={() => changeTicketStatus('pending')}
                    className="px-2.5 py-2 text-xs font-medium text-amber-600 dark:text-amber-400 hover:bg-amber-50 dark:hover:bg-amber-950/40 rounded-lg text-left cursor-pointer"
                  >
                    Devolver a pendientes
                  </button>
                </div>
              )}
            </div>
          )}

          {/* Drawer info toggle */}
          <button
            onClick={onToggleContactDrawer}
            title={isContactDrawerOpen ? 'Ocultar detalles del contacto' : 'Ver detalles del contacto'}
            className={`p-2 rounded-xl transition-colors cursor-pointer ${
              isContactDrawerOpen
                ? 'bg-blue-50 text-blue-600 dark:bg-blue-950/50 dark:text-blue-400'
                : 'text-slate-500 hover:text-slate-800 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800'
            }`}
          >
            <Info className="w-4 h-4" />
          </button>
        </div>
      </header>

      {needsWhatsappAttention && (
        <div className="flex items-center gap-2 border-b border-amber-200 bg-amber-50 px-3.5 py-2 text-xs text-amber-900 dark:border-amber-900/60 dark:bg-amber-950/30 dark:text-amber-200">
          <AlertTriangle className="h-4 w-4 flex-shrink-0 text-amber-600" />
          <span>
            {activeTicket.whatsappId
              ? `La línea receptora (${lineName}) se encuentra desconectada o inactiva.`
              : 'Esta conversación no tiene una línea de WhatsApp vinculada.'}
          </span>
        </div>
      )}

      {/* 2. Messages List (Con fondo oficial WhatsApp doodle y burbujas fieles al diseño) */}
      <div 
        ref={messagesContainerRef}
        onScroll={(event) => {
          const el = event.currentTarget;
          if (!historyAnchorRef.current) {
            stickToBottomRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
          }
        }}
        className="flex-1 min-h-0 overflow-y-auto p-4 flex flex-col gap-2 bg-[#efeae2] dark:bg-[#0b141a] bg-repeat"
        style={{
          backgroundImage: 'url(/wa-background.png)',
          backgroundSize: '412px auto'
        }}
      >
        {messagesError && <p role="alert" className="text-center text-sm text-red-700 dark:text-red-300">{messagesError}</p>}
        {(hasMoreMessages || messagesError) && (
          <button type="button" onClick={loadOlderMessages} disabled={isLoadingMessages}
            className="self-center shrink-0 rounded-lg bg-white dark:bg-slate-800 px-4 py-2 text-sm shadow-sm disabled:opacity-50">
            {isLoadingMessages ? 'Cargando mensajes...' : messagesError ? 'Reintentar carga' : 'Cargar mensajes anteriores'}
          </button>
        )}
        {isLoadingMessages && messages.length === 0 ? null : (
          messages.map((msg, index) => {
            const isMe = msg.fromMe;
            const isNote = msg.isPrivate;
            const mediaUrl = msg.mediaUrl ? getMediaUrl(msg.mediaUrl) : null;
            const isPdf = checkIfPdf(msg.mediaType, msg.body, msg.mediaUrl);
            const isAudio = checkIfAudio(msg.mediaType, msg.body, msg.mediaUrl);
            const isVideo = checkIfVideo(msg.mediaType, msg.body, msg.mediaUrl);

            // Separador de fecha (ej: "Hoy", "Ayer" o "dd/MM/yyyy")
            const prevMsg = index > 0 ? messages[index - 1] : null;
            let showDateDivider = false;
            if (!prevMsg) {
              showDateDivider = true;
            } else if (msg.createdAt && prevMsg.createdAt) {
              try {
                const d1 = new Date(msg.createdAt);
                const d2 = new Date(prevMsg.createdAt);
                if (!isNaN(d1.getTime()) && !isNaN(d2.getTime())) {
                  showDateDivider = !isSameDay(d1, d2);
                }
              } catch {
                showDateDivider = false;
              }
            }

            let dateLabel = '';
            if (showDateDivider && msg.createdAt) {
              try {
                const msgDate = new Date(msg.createdAt);
                if (!isNaN(msgDate.getTime())) {
                  const today = new Date();
                  const yesterday = new Date();
                  yesterday.setDate(today.getDate() - 1);

                  if (isSameDay(msgDate, today)) {
                    dateLabel = 'Hoy';
                  } else if (isSameDay(msgDate, yesterday)) {
                    dateLabel = 'Ayer';
                  } else {
                    dateLabel = format(msgDate, 'dd/MM/yyyy');
                  }
                }
              } catch (e) {
                console.error('Error formatting date divider:', e);
              }
            }

            if (isNote) {
              return (
                <React.Fragment key={msg.id}>
                  {showDateDivider && (
                    <div className="self-center my-2 select-none">
                      <span className="bg-[#e1f3fb] dark:bg-[#1f2c34] text-[#54656f] dark:text-[#8696a0] text-[11px] font-semibold px-3 py-1 rounded-lg shadow-xs">
                        {dateLabel}
                      </span>
                    </div>
                  )}
                  <div
                    data-message-id={msg.id}
                    className="self-center w-full max-w-lg bg-amber-50 dark:bg-amber-950/50 border border-amber-300/80 dark:border-amber-800/60 rounded-xl p-3 shadow-xs text-xs text-amber-900 dark:text-amber-200 flex flex-col gap-1"
                  >
                    <div className="flex items-center justify-between font-semibold text-[11px] text-amber-700 dark:text-amber-400">
                      <span className="flex items-center gap-1">
                        <StickyNote className="w-3.5 h-3.5" />
                        Nota interna
                      </span>
                      <span>{formatMsgTime(msg.createdAt)}</span>
                    </div>
                    <WhatsAppText text={msg.body} className="text-amber-900 dark:text-amber-200" />
                  </div>
                </React.Fragment>
              );
            }

            return (
              <React.Fragment key={msg.id}>
                {showDateDivider && (
                  <div className="self-center my-2 select-none">
                    <span className="bg-white/90 dark:bg-[#182229] text-[#54656f] dark:text-[#8696a0] text-[11px] font-medium px-3 py-1 rounded-lg shadow-xs border border-black/5 dark:border-white/5">
                      {dateLabel}
                    </span>
                  </div>
                )}

                <div
                  data-message-id={msg.id}
                  className={`flex flex-col max-w-[85%] sm:max-w-[75%] md:max-w-[65%] ${
                    isMe ? 'self-end items-end' : 'self-start items-start'
                  }`}
                >
                  <div
                    className={`rounded-2xl px-3 py-2 shadow-xs text-xs leading-relaxed relative ${
                      isMe
                        ? 'bg-[#d9fdd3] dark:bg-[#005c4b] text-[#111b21] dark:text-[#e9edef] rounded-tr-xs'
                        : 'bg-white dark:bg-[#202c33] text-[#111b21] dark:text-[#e9edef] rounded-tl-xs shadow-[0_1px_0.5px_rgba(11,20,26,0.13)]'
                    }`}
                  >
                    {/* Media Rendering */}
                    {mediaUrl && (
                      <div className={isAudio ? '' : 'mb-2'}>
                        {isAudio ? (
                          <WhatsAppAudioPlayer
                            src={mediaUrl}
                            isMe={isMe}
                            timestamp={formatMsgTime(msg.createdAt)}
                            ack={msg.ack}
                          />
                        ) : isVideo ? (
                          <div className="rounded-xl overflow-hidden max-w-xs">
                            <video
                              src={mediaUrl}
                              controls
                              className="w-full max-h-64 rounded-xl"
                            />
                          </div>
                        ) : isPdf ? (
                          <a
                            href={mediaUrl}
                            target="_blank"
                            rel="noreferrer"
                            className={`flex items-center gap-2.5 p-2.5 rounded-xl border transition-colors ${
                              isMe
                                ? 'bg-black/5 dark:bg-white/5 border-emerald-600/20 text-inherit hover:bg-black/10'
                                : 'bg-slate-50 dark:bg-slate-700/50 border-slate-200 dark:border-slate-600 text-inherit'
                            }`}
                          >
                            <FileText className="w-6 h-6 text-rose-500 flex-shrink-0" />
                            <div className="truncate text-xs">
                              <span className="font-semibold block truncate">
                                {msg.body || 'Documento PDF'}
                              </span>
                              <span className="text-[10px] opacity-70 flex items-center gap-1">
                                <Download className="w-2.5 h-2.5" /> Descargar
                              </span>
                            </div>
                          </a>
                        ) : (
                          <div className="rounded-xl overflow-hidden max-w-xs">
                            <img
                              src={mediaUrl}
                              alt="Imagen"
                              className="w-full object-cover max-h-64 rounded-xl cursor-pointer hover:opacity-95"
                              onLoad={() => {
                                if (stickToBottomRef.current) scrollToBottom('auto');
                              }}
                              onError={(e) => {
                                const target = e.currentTarget;
                                const currentSrc = target.src;
                                if (!currentSrc.includes('/quickMessage/')) {
                                  const parts = currentSrc.split('/public/');
                                  if (parts.length === 2) {
                                    target.src = `${parts[0]}/public/quickMessage/${parts[1]}`;
                                  }
                                }
                              }}
                              onClick={() => window.open(mediaUrl, '_blank')}
                            />
                          </div>
                        )}
                      </div>
                    )}

                    {/* Text Content formateado con sintaxis WhatsApp (*bold*, _italic_, ~strike~, code, links) */}
                    {msg.body && !isPdf && (!isAudio || (msg.body !== 'Áudio' && msg.body !== 'audio' && !msg.body.includes('audio-record'))) && (
                      <div className="pr-12 pb-1">
                        <WhatsAppText text={msg.body} />
                      </div>
                    )}

                    {/* Time and ticks (Anclado al estilo WhatsApp en la esquina inferior derecha) */}
                    {!isAudio && (
                      <div
                        className="flex items-center justify-end gap-1 text-[10px] float-right -mt-2.5 ml-3 select-none text-[#667781] dark:text-[#8696a0]"
                      >
                        <span className="leading-none">{formatMsgTime(msg.createdAt)}</span>
                        {isMe && (
                          <span className={`leading-none font-bold ${
                            (msg.ack ?? 0) >= 3 || (msg.ack ?? 0) === 2 ? 'text-[#53bdeb]' : 'text-[#8696a0]'
                          }`}>
                            {(msg.ack ?? 0) >= 3 ? '✓✓' : (msg.ack ?? 0) === 2 ? '✓✓' : '✓'}
                          </span>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              </React.Fragment>
            );
          })
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* 3. Input Deck (Sticky Bottom, Flex-Shrink-0) */}
      <div className="p-3 bg-white dark:bg-slate-900 border-t border-slate-200 dark:border-slate-800 flex flex-col gap-2 shadow-lg flex-shrink-0 sticky bottom-0 z-20 relative">
        {activeTicket.status === 'closed' ? (
          <div className="flex flex-col sm:flex-row items-center justify-between gap-3 p-4 bg-slate-100/90 dark:bg-slate-800/80 rounded-2xl border border-slate-200 dark:border-slate-700 select-none">
            <div className="flex items-center gap-2.5 text-xs sm:text-sm text-slate-700 dark:text-slate-300 font-medium text-center sm:text-left">
              <CheckCircle2 className="w-5 h-5 text-emerald-600 dark:text-emerald-400 flex-shrink-0" />
              <span>Esta conversación está resuelta. Para responder o escribir, debés reabrir el ticket.</span>
            </div>
            <button
              type="button"
              onClick={() => changeTicketStatus('open')}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs sm:text-sm font-bold shadow-md shadow-blue-600/20 transition active:scale-95 flex-shrink-0 cursor-pointer"
            >
              <RotateCcw className="w-4 h-4" />
              <span>Reabrir conversación</span>
            </button>
          </div>
        ) : (
          <>
            {/* Floating Real-Time Slash Quick Messages Popover (Estilo Whaticket / Anclado arriba del input) */}
            {showSlashPopover && inputText.startsWith('/') && (
          <div className="absolute bottom-full left-3 right-3 mb-2 bg-white dark:bg-slate-900 rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-700 overflow-hidden z-40 flex flex-col max-h-64 animate-in fade-in slide-in-from-bottom-2 duration-150">
            {/* Popover Header */}
            <div className="px-3.5 py-2 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between bg-slate-50/80 dark:bg-slate-800/40">
              <span className="text-[11px] font-bold tracking-wider text-blue-600 dark:text-blue-400 uppercase flex items-center gap-1.5">
                <Zap className="w-3.5 h-3.5 text-amber-500" />
                Respuestas Rápidas
              </span>
              <button
                type="button"
                onClick={() => setShowSlashPopover(false)}
                className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 p-0.5 rounded-md"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>

            {/* Popover List */}
            <div className="overflow-y-auto divide-y divide-slate-100 dark:divide-slate-800/60">
              {filteredQuickMessages.length === 0 ? (
                <div className="p-4 text-center text-xs text-slate-400">
                  No se encontraron respuestas para "{inputText.slice(1)}"
                </div>
              ) : (
                filteredQuickMessages.map((item) => {
                  const hasMedia = Boolean(item.mediaPath);
                  const isPdf = item.mediaPath?.toLowerCase().endsWith('.pdf');

                  return (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => handleSelectQuickMessage(item)}
                      className="w-full text-left p-2.5 hover:bg-blue-50/60 dark:hover:bg-slate-800/80 flex items-center gap-2.5 transition-colors group cursor-pointer"
                    >
                      {/* Badge con Shortcut y Cámara si tiene adjunto */}
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-blue-50 dark:bg-blue-950/80 text-blue-600 dark:text-blue-400 font-bold text-xs flex-shrink-0 group-hover:bg-blue-600 group-hover:text-white transition-colors">
                        {hasMedia && (isPdf ? '📄' : '📷')}
                        /{item.shortcode.replace(/^\//, '')}
                      </span>

                      {/* Snippet del texto */}
                      <span className="text-xs text-slate-600 dark:text-slate-300 truncate flex-1 font-normal">
                        {item.message}
                      </span>
                    </button>
                  );
                })
              )}
            </div>
          </div>
        )}

        {/* Emoji Picker Popover */}
        {showEmojiPicker && (
          <div className="absolute bottom-16 left-3 bg-white dark:bg-slate-900 rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-700 p-3 z-40 w-72 max-h-60 overflow-y-auto animate-in fade-in slide-in-from-bottom-2 duration-150">
            <div className="flex items-center justify-between pb-2 mb-2 border-b border-slate-100 dark:border-slate-800">
              <span className="text-xs font-semibold text-slate-500">Emojis</span>
              <button
                type="button"
                onClick={() => setShowEmojiPicker(false)}
                className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 p-0.5"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
            <div className="grid grid-cols-8 gap-1.5 text-xl">
              {COMMON_EMOJIS.map((emoji) => (
                <button
                  key={emoji}
                  type="button"
                  onClick={() => handleEmojiClick(emoji)}
                  className="hover:scale-125 transition-transform p-1 rounded cursor-pointer hover:bg-slate-100 dark:hover:bg-slate-800 flex items-center justify-center"
                >
                  {emoji}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Tier 1: Attached Media Gallery Strip (Identical to screenshot media_1789341642816.png) */}
        {attachedFiles.length > 0 && (
          <div className="flex items-center gap-3.5 px-1 py-2 overflow-x-auto select-none border-b border-slate-100 dark:border-slate-800/80 mb-1">
            {/* Left Circular Dismiss All Button */}
            <button
              type="button"
              onClick={clearAllAttachments}
              className="w-7 h-7 rounded-full bg-slate-500 hover:bg-slate-600 text-white flex items-center justify-center transition-colors shadow-sm flex-shrink-0 cursor-pointer self-center"
              title="Eliminar todos los archivos"
            >
              <X className="w-4 h-4" />
            </button>

            {/* Attached File Cards */}
            {attachedFiles.map((item) => (
              <div key={item.id} className="flex flex-col items-center flex-shrink-0 group relative">
                <div className="w-24 h-24 sm:w-28 sm:h-28 rounded-xl overflow-hidden bg-slate-100 dark:bg-slate-800 border border-slate-200/90 dark:border-slate-700 shadow-sm relative flex items-center justify-center">
                  {item.isPdf ? (
                    <div className="flex flex-col items-center justify-center p-2 text-rose-500">
                      <FileText className="w-10 h-10 mb-1" />
                      <span className="text-[10px] font-bold uppercase tracking-wider bg-rose-100 dark:bg-rose-950/60 px-1.5 py-0.5 rounded text-rose-700 dark:text-rose-400">
                        PDF
                      </span>
                    </div>
                  ) : item.previewUrl ? (
                    <img
                      src={item.previewUrl}
                      alt={item.name}
                      className="w-full h-full object-cover select-none"
                    />
                  ) : (
                    <FileText className="w-10 h-10 text-slate-400" />
                  )}

                  {/* Individual Remove Button on Hover */}
                  <button
                    type="button"
                    onClick={() => removeAttachment(item.id)}
                    className="absolute top-1.5 right-1.5 w-5 h-5 rounded-full bg-black/60 hover:bg-black/80 text-white flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer shadow"
                    title="Eliminar archivo"
                  >
                    <X className="w-3 h-3" />
                  </button>
                </div>

                <span className="text-[11px] font-medium text-slate-600 dark:text-slate-400 mt-1.5 max-w-[96px] sm:max-w-[112px] truncate text-center block">
                  {item.name}
                </span>
              </div>
            ))}

            {/* Dropzone Card: Arrastra y suelta para agregar archivos */}
            <div
              onClick={() => fileInputRef.current?.click()}
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onDrop={handleDrop}
              className={`w-24 h-24 sm:w-28 sm:h-28 rounded-xl flex flex-col items-center justify-center p-2 text-center cursor-pointer transition-all select-none flex-shrink-0 ${
                isDragging
                  ? 'bg-blue-100 border-2 border-dashed border-blue-500 text-blue-600 dark:bg-blue-950/50'
                  : 'bg-[#dcdfe4] hover:bg-[#d2d6dc] dark:bg-slate-800 dark:hover:bg-slate-750 text-slate-600 dark:text-slate-400 border border-slate-300/60 dark:border-slate-700'
              }`}
              title="Haz clic o arrastra archivos para agregar"
            >
              <Plus className="w-6 h-6 mb-1 text-slate-500 dark:text-slate-400" strokeWidth={1.5} />
              <span className="text-[10px] sm:text-[10.5px] leading-tight text-slate-500 dark:text-slate-400 font-normal">
                Arrastra y suelta<br />para agregar<br />archivos
              </span>
            </div>
          </div>
        )}

        {/* Tier 2: Middle Toolbar Utilities Row */}
        <div className="flex items-center justify-between py-1 select-none">
          <div className="flex items-center gap-2">
            {/* Nota Interna */}
            <button
              type="button"
              onClick={() => setIsPrivateNote(!isPrivateNote)}
              className={`px-2.5 py-1 text-xs font-semibold rounded-lg flex items-center gap-1.5 transition-all cursor-pointer ${
                isPrivateNote
                  ? 'bg-amber-500 text-white shadow-sm'
                  : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700'
              }`}
            >
              <StickyNote className="w-3.5 h-3.5" />
              Nota
            </button>

            {/* Adjuntar Archivo */}
            <input
              type="file"
              multiple
              ref={fileInputRef}
              onChange={handleFileSelect}
              className="hidden"
            />
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="px-2.5 py-1 text-xs font-semibold rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700 flex items-center gap-1.5 transition-all cursor-pointer"
            >
              <Paperclip className="w-3.5 h-3.5" />
              Adjuntar
            </button>

            {/* Firmar Mensaje */}
            <button
              type="button"
              onClick={() => setSignMessage(!signMessage)}
              className={`px-2.5 py-1 text-xs font-semibold rounded-lg flex items-center gap-1.5 transition-all cursor-pointer ${
                signMessage
                  ? 'bg-blue-100 dark:bg-blue-950/60 text-blue-700 dark:text-blue-300 border border-blue-200 dark:border-blue-800'
                  : 'bg-slate-100 dark:bg-slate-800 text-slate-400'
              }`}
              title="Firma con tu nombre al pie del mensaje"
            >
              <PenTool className="w-3.5 h-3.5" />
              Firmar
            </button>

            {/* Respuestas Rápidas */}
            <button
              type="button"
              onClick={() => {
                setInputText('/');
                setShowSlashPopover(true);
                setTimeout(() => textareaRef.current?.focus(), 50);
              }}
              className="px-3 py-1 text-xs font-bold rounded-lg bg-amber-500/10 text-amber-600 dark:text-amber-400 hover:bg-amber-500/20 flex items-center gap-1.5 transition-colors cursor-pointer"
            >
              <Zap className="w-3.5 h-3.5 text-amber-500" />
              Respuestas Rápidas
            </button>
          </div>
        </div>

        {/* Tier 3: Bottom Input Row (Voice recording or Smile + Textarea + Enviar/Schedule/Mic) */}
        {isRecordingAudio ? (
          <div className="flex items-center gap-3 pt-1 w-full bg-slate-50/90 dark:bg-slate-800/90 p-2 rounded-2xl border border-slate-200 dark:border-slate-700 animate-in fade-in">
            {/* Cancel / Trash */}
            <button
              type="button"
              onClick={cancelAudioRecording}
              className="p-2 text-slate-400 hover:text-rose-500 transition-colors cursor-pointer rounded-full hover:bg-rose-50 dark:hover:bg-rose-950/40"
              title="Cancelar y descartar audio"
            >
              <Trash2 className="w-5 h-5" />
            </button>

            {/* Pulsing Dot & Timer */}
            <div className="flex items-center gap-2 flex-1">
              <span className="w-2.5 h-2.5 rounded-full bg-rose-500 animate-ping" />
              <span className="text-xs font-mono font-semibold text-slate-700 dark:text-slate-200">
                {formatAudioTime(recordingSeconds)}
              </span>
              <div className="flex-1 h-1.5 bg-slate-200 dark:bg-slate-700 rounded-full overflow-hidden mx-2">
                <div className="h-full bg-emerald-500 rounded-full animate-pulse w-full" />
              </div>
            </div>

            {/* Send Audio Button */}
            <button
              type="button"
              onClick={stopAndSendAudioRecording}
              className="flex items-center gap-2 px-5 py-2.5 rounded-full font-medium text-xs text-white bg-[#2563eb] hover:bg-blue-700 shadow-md shadow-blue-500/25 active:scale-95 transition-all cursor-pointer"
            >
              <Send className="w-3.5 h-3.5" />
              <span>Enviar audio</span>
            </button>
          </div>
        ) : (
          <div className="flex items-end gap-2.5 pt-1">
            {/* Emoji Button */}
            <button
              type="button"
              onClick={() => setShowEmojiPicker(!showEmojiPicker)}
              className="p-1.5 text-slate-400 hover:text-slate-600 dark:text-slate-500 dark:hover:text-slate-300 transition-colors cursor-pointer self-center"
              title="Insertar emoji"
            >
              <Smile className="w-6 h-6" />
            </button>

            {/* Textarea */}
            <textarea
              ref={textareaRef}
              value={inputText}
              onChange={handleInputChange}
              onKeyDown={handleKeyDown}
              placeholder={
                isPrivateNote
                  ? 'Escribe una nota interna para el equipo...'
                  : 'Escribe un mensaje o presiona / para respuestas rápidas...'
              }
              rows={Math.min(6, Math.max(1, inputText.split('\n').length))}
              className={`flex-1 py-2 px-3 text-xs sm:text-sm rounded-xl resize-none border focus:outline-none transition-all ${
                isPrivateNote
                  ? 'bg-amber-50/70 dark:bg-amber-950/20 border-amber-300 dark:border-amber-700 focus:ring-2 focus:ring-amber-500 text-amber-900 dark:text-amber-100'
                  : 'bg-slate-50/80 dark:bg-slate-800/60 border-slate-200 dark:border-slate-700 focus:ring-2 focus:ring-blue-500 text-slate-800 dark:text-slate-100'
              }`}
            />

            {/* Action Buttons: If writing text or attached files -> Send + Schedule. If empty -> Mic */}
            {inputText.trim() || attachedFiles.length > 0 ? (
              <div className="flex items-center gap-1.5 animate-in fade-in duration-150">
                {/* Blue Pill Send Button */}
                <button
                  type="button"
                  onClick={handleSendMessage}
                  disabled={isSendingMessage}
                  className="flex items-center gap-2 px-5 py-2.5 rounded-full font-medium text-xs text-white bg-[#2563eb] hover:bg-blue-700 shadow-md shadow-blue-500/25 active:scale-95 transition-all cursor-pointer disabled:opacity-50"
                >
                  <Send className="w-3.5 h-3.5" />
                  <span>Enviar</span>
                </button>

                {/* Schedule Message (Clock) Button */}
                <button
                  type="button"
                  onClick={() => {
                    setScheduleBody(inputText);
                    const d = new Date();
                    d.setHours(d.getHours() + 1, 0, 0, 0);
                    const localIso = new Date(d.getTime() - d.getTimezoneOffset() * 60000)
                      .toISOString()
                      .slice(0, 16);
                    setScheduleSendAt(localIso);
                    setShowScheduleModal(true);
                  }}
                  className="w-9 h-9 rounded-full bg-[#2563eb] hover:bg-blue-700 text-white flex items-center justify-center shadow-md shadow-blue-500/25 transition-all active:scale-95 cursor-pointer flex-shrink-0"
                  title="Programar mensaje"
                >
                  <Clock className="w-4 h-4" />
                </button>
              </div>
            ) : (
              /* Mic Button for Audio Recording */
              <button
                type="button"
                onClick={startAudioRecording}
                className="w-9 h-9 rounded-full bg-blue-50 hover:bg-blue-100 dark:bg-slate-800 dark:hover:bg-slate-700 text-blue-600 dark:text-blue-400 flex items-center justify-center transition-all active:scale-95 cursor-pointer flex-shrink-0"
                title="Grabar mensaje de voz"
              >
                <Mic className="w-5 h-5" />
              </button>
            )}
          </div>
        )}
          </>
        )}

        {/* Schedule Modal (Tabs FECHA y RECURRENCIA fieles al diseño del sistema) */}
        {showScheduleModal && (
          <div className="fixed inset-0 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-in fade-in duration-150">
            <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-800 w-full max-w-sm overflow-hidden flex flex-col">
              {/* Header Tabs: FECHA & RECURRENCIA */}
              <div className="flex border-b border-slate-200 dark:border-slate-800 text-xs font-bold tracking-wide">
                <button
                  type="button"
                  onClick={() => setScheduleTab('FECHA')}
                  className={`flex-1 py-3 text-center border-b-2 transition-all cursor-pointer ${
                    scheduleTab === 'FECHA'
                      ? 'border-blue-600 text-blue-600 dark:text-blue-400'
                      : 'border-transparent text-slate-500 hover:text-slate-800 dark:hover:text-slate-300'
                  }`}
                >
                  FECHA
                </button>
                <button
                  type="button"
                  onClick={() => setScheduleTab('RECURRENCIA')}
                  className={`flex-1 py-3 text-center border-b-2 transition-all cursor-pointer ${
                    scheduleTab === 'RECURRENCIA'
                      ? 'border-blue-600 text-blue-600 dark:text-blue-400'
                      : 'border-transparent text-slate-500 hover:text-slate-800 dark:hover:text-slate-300'
                  }`}
                >
                  RECURRENCIA
                </button>
              </div>

              <form onSubmit={handleScheduleSubmit} className="p-5 space-y-4">
                {scheduleTab === 'FECHA' ? (
                  <>
                    {/* Header preview similar al calendario */}
                    {(() => {
                      let dateObj = new Date();
                      if (scheduleSendAt) {
                        const parsed = new Date(scheduleSendAt);
                        if (!isNaN(parsed.getTime())) dateObj = parsed;
                      }
                      return (
                        <div className="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-slate-800">
                          <div>
                            <div className="text-[10px] text-slate-400 uppercase font-bold">
                              {dateObj.getFullYear()}
                            </div>
                            <div className="text-xl font-bold text-slate-800 dark:text-slate-100">
                              {format(dateObj, 'MMM dd')}
                            </div>
                          </div>
                          <div className="text-3xl font-light text-slate-700 dark:text-slate-200 font-mono">
                            {format(dateObj, 'HH:mm')}
                          </div>
                        </div>
                      );
                    })()}

                    <div>
                      <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5 flex items-center gap-1.5">
                        <Calendar className="w-3.5 h-3.5 text-blue-500" />
                        Fecha y Hora de Envío
                      </label>
                      <input
                        type="datetime-local"
                        value={scheduleSendAt}
                        onChange={(e) => setScheduleSendAt(e.target.value)}
                        required
                        className="w-full px-3 py-2 text-xs border border-slate-200 dark:border-slate-700 rounded-xl bg-slate-50 dark:bg-slate-800 text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500"
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
                        Mensaje a Enviar
                      </label>
                      <textarea
                        value={scheduleBody}
                        onChange={(e) => setScheduleBody(e.target.value)}
                        rows={3}
                        placeholder="Escribe el mensaje programado..."
                        className="w-full px-3 py-2 text-xs border border-slate-200 dark:border-slate-700 rounded-xl bg-slate-50 dark:bg-slate-800 text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
                      />
                    </div>
                  </>
                ) : (
                  /* Tab RECURRENCIA */
                  <div className="space-y-4 py-1">
                    {/* Toggle Activar recurrencia */}
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-medium text-slate-700 dark:text-slate-200">
                        Activar recurrencia
                      </span>
                      <button
                        type="button"
                        onClick={() => setRecurrenceEnabled(!recurrenceEnabled)}
                        className={`w-11 h-6 flex items-center rounded-full p-1 cursor-pointer transition-colors ${
                          recurrenceEnabled ? 'bg-blue-600' : 'bg-slate-300 dark:bg-slate-700'
                        }`}
                      >
                        <div
                          className={`bg-white w-4 h-4 rounded-full shadow-md transform transition-transform ${
                            recurrenceEnabled ? 'translate-x-5' : 'translate-x-0'
                          }`}
                        />
                      </button>
                    </div>

                    {recurrenceEnabled && (
                      <div className="space-y-3.5 pt-1 animate-in fade-in">
                        {/* Repetir a cada: [1] [día v] */}
                        <div>
                          <label className="block text-xs text-slate-500 dark:text-slate-400 mb-1.5">
                            Repetir a cada:
                          </label>
                          <div className="flex items-center gap-2">
                            <input
                              type="number"
                              min="1"
                              value={recurrenceInterval}
                              onChange={(e) => setRecurrenceInterval(Math.max(1, parseInt(e.target.value) || 1))}
                              className="w-20 px-3 py-2 text-xs border border-slate-300 dark:border-slate-700 rounded-xl bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500"
                            />
                            <select
                              value={recurrenceUnit}
                              onChange={(e) => setRecurrenceUnit(e.target.value as any)}
                              className="flex-1 px-3 py-2 text-xs border border-blue-500 rounded-xl bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500"
                            >
                              <option value="dia">día</option>
                              <option value="semana">semana</option>
                              <option value="mes">mes</option>
                            </select>
                          </div>
                        </div>

                        {/* Termina en: */}
                        <div>
                          <label className="block text-xs text-slate-500 dark:text-slate-400 mb-2">
                            Termina en:
                          </label>
                          <div className="space-y-2">
                            {/* Checkbox Nunca */}
                            <label className="flex items-center gap-2 text-xs text-slate-700 dark:text-slate-300 cursor-pointer">
                              <input
                                type="checkbox"
                                checked={recurrenceEndType === 'never'}
                                onChange={() => setRecurrenceEndType('never')}
                                className="w-4 h-4 rounded text-blue-600 focus:ring-blue-500 border-slate-300"
                              />
                              <span>Nunca</span>
                            </label>

                            {/* Checkbox En: [DD/MM/YYYY] */}
                            <div className="flex items-center gap-2">
                              <label className="flex items-center gap-2 text-xs text-slate-700 dark:text-slate-300 cursor-pointer">
                                <input
                                  type="checkbox"
                                  checked={recurrenceEndType === 'on_date'}
                                  onChange={() => setRecurrenceEndType('on_date')}
                                  className="w-4 h-4 rounded text-blue-600 focus:ring-blue-500 border-slate-300"
                                />
                                <span>En</span>
                              </label>
                              <input
                                type="date"
                                disabled={recurrenceEndType !== 'on_date'}
                                value={recurrenceEndDate}
                                onChange={(e) => setRecurrenceEndDate(e.target.value)}
                                className={`flex-1 px-3 py-1.5 text-xs border rounded-xl bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                                  recurrenceEndType !== 'on_date'
                                    ? 'opacity-40 cursor-not-allowed border-slate-200 dark:border-slate-800'
                                    : 'border-slate-300 dark:border-slate-700'
                                }`}
                              />
                            </div>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {attachedFiles.length > 0 && (
                  <div className="p-2.5 bg-blue-50 dark:bg-blue-950/40 rounded-xl border border-blue-200/60 dark:border-blue-900 flex items-center gap-2">
                    <Paperclip className="w-4 h-4 text-blue-600 flex-shrink-0" />
                    <div className="text-xs text-blue-900 dark:text-blue-300 truncate">
                      <span className="font-semibold">Adjunto: </span>
                      {attachedFiles.map((item) => item.name).join(', ')}
                    </div>
                  </div>
                )}

                {attachedFiles.length > 1 && (
                  <p role="alert" className="text-xs text-red-700 dark:text-red-300">
                    Podés programar un archivo por mensaje. Volvé al chat y quitá los adjuntos extra; ninguno se enviará ni se descartará.
                  </p>
                )}
                {/* Footer Buttons: Cancelar / Programar */}
                <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-100 dark:border-slate-800">
                  <button
                    type="button"
                    onClick={() => setShowScheduleModal(false)}
                    className="px-4 py-2 text-xs font-semibold text-blue-600 hover:text-blue-700 dark:text-blue-400 transition-colors cursor-pointer"
                  >
                    Cancelar
                  </button>
                  <button
                    type="submit"
                    disabled={isScheduling || attachedFiles.length > 1}
                    className="px-6 py-2 text-xs font-bold text-white bg-blue-600 hover:bg-blue-700 rounded-full transition-all shadow-md shadow-blue-500/25 active:scale-95 cursor-pointer disabled:opacity-50"
                  >
                    {isScheduling ? 'Programando...' : 'Programar'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
