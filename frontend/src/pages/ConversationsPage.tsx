import { useState, useEffect, useRef } from 'react';
import { io, Socket } from 'socket.io-client';
import api from '../api/client';
import { getApiBaseUrl } from '../api/baseUrl';
import CustomerProfile from '../components/CustomerProfile';
import { useToast } from '../components/Toast';
import { Button } from '../components/ui/Button';
import { Card } from '../components/ui/Card';
import { SkeletonCard } from '../components/ui/Skeleton';
import {
  Search, 
  User as UserIcon, 
  Send, 
  MoreVertical, 
  CheckCheck,
  MessageCircle,
  ChevronRight,
  Filter,
  Tag,
  Plus,
  X as CloseIcon,
  Hash,
  Layers,
  Check,
  Share2,
  Contact,
  AlertTriangle,
  FileText,
  Image as ImageIcon,
  MapPin,
  Music,
  Video,
  Download
} from 'lucide-react';
import { 
  FaWhatsapp, 
  FaInstagram, 
  FaFacebook, 
  FaMapMarkerAlt 
} from 'react-icons/fa';
import { format } from 'date-fns';
import { ar } from 'date-fns/locale';

interface Message {
  _id?: string;
  from: string;
  text: string;
  type: string;
  attachments?: Attachment[];
  metadata?: Record<string, any>;
  sentiment?: string;
  timestamp: any;
}

interface Attachment {
  id?: string;
  type: string;
  mimeType?: string;
  filename: string;
  originalFilename?: string;
  caption?: string;
  url: string;
  downloadError?: boolean;
}

interface Conversation {
  _id: string;
  customerPhone: string;
  platform: string;
  customerId?: string; // Link to Postgres
  lastMessage: string;
  lastMessageAt: string;
  messages: Message[];
  status: string;
  unreadCount?: number;
  aiEnabled?: boolean;
  lastSentiment?: string;
  tags?: string[];
}

function SecureAttachment({ attachment }: { attachment: Attachment }) {
  const [objectUrl, setObjectUrl] = useState<string>('');
  const typeIcon = attachment.type === 'image' || attachment.type === 'sticker'
    ? <ImageIcon size={18} />
    : attachment.type === 'video'
      ? <Video size={18} />
      : attachment.type === 'audio'
        ? <Music size={18} />
        : <FileText size={18} />;

  useEffect(() => {
    let active = true;
    let createdUrl = '';

    if (!attachment.url || attachment.downloadError) return;

    api.get(attachment.url, { responseType: 'blob' }).then(({ data }) => {
      if (!active) return;
      createdUrl = URL.createObjectURL(data);
      setObjectUrl(createdUrl);
    }).catch(() => {});

    return () => {
      active = false;
      if (createdUrl) URL.revokeObjectURL(createdUrl);
    };
  }, [attachment.url, attachment.downloadError]);

  if (attachment.downloadError) {
    return <div className="mt-3 rounded-2xl border border-red-500/20 bg-red-500/10 p-4 text-xs font-bold text-red-200">تعذر تنزيل المرفق من واتساب.</div>;
  }

  if (!objectUrl) {
    return <div className="mt-3 flex items-center gap-3 rounded-2xl border border-white/10 bg-white/5 p-4 text-xs font-bold text-neutral-400">{typeIcon} جاري تحميل المرفق...</div>;
  }

  if (attachment.type === 'image' || attachment.type === 'sticker') {
    return <img src={objectUrl} alt={attachment.caption || attachment.originalFilename || 'WhatsApp attachment'} className="mt-3 max-h-80 rounded-2xl border border-white/10 object-contain" />;
  }

  if (attachment.type === 'video') {
    return <video controls src={objectUrl} className="mt-3 max-h-80 rounded-2xl border border-white/10" />;
  }

  if (attachment.type === 'audio') {
    return <audio controls src={objectUrl} className="mt-3 w-full" />;
  }

  return (
    <a href={objectUrl} download={attachment.originalFilename || attachment.filename} className="mt-3 flex items-center gap-3 rounded-2xl border border-white/10 bg-white/5 p-4 text-xs font-bold text-white hover:bg-white/10">
      {typeIcon}
      <span className="min-w-0 flex-1 truncate">{attachment.originalFilename || attachment.filename || 'WhatsApp file'}</span>
      <Download size={16} />
    </a>
  );
}

function MessageExtras({ msg }: { msg: Message }) {
  const attachments = msg.attachments || [];
  const location = msg.metadata?.location;
  const contacts = msg.metadata?.contacts;

  return (
    <div className="space-y-2">
      {attachments.map((attachment, index) => (
        <SecureAttachment key={`${attachment.id || attachment.filename}-${index}`} attachment={attachment} />
      ))}
      {location && (
        <div className="mt-3 rounded-2xl border border-white/10 bg-white/5 p-4 text-xs font-bold text-white">
          <div className="mb-2 flex items-center gap-2"><MapPin size={16} /> {location.name || 'WhatsApp location'}</div>
          <div className="text-neutral-300">{location.address || `${location.latitude}, ${location.longitude}`}</div>
        </div>
      )}
      {Array.isArray(contacts) && contacts.map((contact: any, index: number) => (
        <div key={index} className="mt-3 rounded-2xl border border-white/10 bg-white/5 p-4 text-xs font-bold text-white">
          <div>{contact.name?.formatted_name || contact.name?.first_name || 'Contact'}</div>
          <div className="mt-1 text-neutral-300">{contact.phones?.map((phone: any) => phone.phone).join(', ')}</div>
        </div>
      ))}
    </div>
  );
}

export default function ConversationsPage() {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [selectedChat, setSelectedChat] = useState<Conversation | null>(null);
  const [messageInput, setMessageInput] = useState('');
  const [loading, setLoading] = useState(true);
  const [showMobileList, setShowMobileList] = useState(true);
  const [showProfile, setShowProfile] = useState(false);
  
  const [selectedTag, setSelectedTag] = useState<string | null>(null);
  const [selectedPlatform, setSelectedPlatform] = useState<string | null>(null);
  
  const [showTagEditor, setShowTagEditor] = useState(false);
  const [showFilterDropdown, setShowFilterDropdown] = useState(false);
  const [newTagInput, setNewTagInput] = useState('');
  const [customTags, setCustomTags] = useState<string[]>([]);
  
  const socketRef = useRef<Socket | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const selectedChatRef = useRef<Conversation | null>(null);
  const filterRef = useRef<HTMLDivElement>(null);
  const { showToast } = useToast();
  
  const defaultTags = ['طلب_جديد', 'استفسار_سعر', 'شكوى', 'موقع_المحل', 'سؤال_عام'];
  const platforms = [
    { id: 'whatsapp', name: 'واتساب', icon: <FaWhatsapp className="text-green-500" /> },
    { id: 'instagram', name: 'إنستغرام', icon: <FaInstagram className="text-pink-500" /> },
    { id: 'facebook', name: 'فيسبوك', icon: <FaFacebook className="text-blue-600" /> }
  ];

  const safeFormatDate = (date: any, formatStr: string) => {
    try {
      if (!date) return '';
      const d = new Date(date);
      if (isNaN(d.getTime())) return '';
      return format(d, formatStr, { locale: ar });
    } catch (e) {
      return '';
    }
  };

  useEffect(() => {
    selectedChatRef.current = selectedChat;
    if (selectedChat) {
      setShowMobileList(false);
      if (!selectedChat.customerId) {
        api.get(`/conversations/${selectedChat._id}`).then(({ data }) => {
          setSelectedChat(prev => prev && prev._id === data._id ? { ...prev, customerId: data.customerId } : prev);
          setConversations(prev => prev.map(c => c._id === data._id ? { ...c, customerId: data.customerId } : c));
        });
      }
    }
  }, [selectedChat?._id]);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (filterRef.current && !filterRef.current.contains(event.target as Node)) {
        setShowFilterDropdown(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [selectedChat?.messages?.length]);

  useEffect(() => {
    fetchConversations();
    fetchStoreTags();
    setupSocket();
    return () => { if (socketRef.current) socketRef.current.disconnect(); };
  }, []);

  const fetchStoreTags = async () => {
    try {
      const { data } = await api.get('/stores/me');
      setCustomTags(data.customTags || []);
    } catch (e) {}
  };

  const fetchConversations = async () => {
    try {
      const { data } = await api.get('/conversations');
      setConversations(Array.isArray(data) ? data : []);
      setLoading(false);
    } catch (error) {
      setLoading(false);
    }
  };

  const setupSocket = () => {
    const token = localStorage.getItem('access_token');
    if (!token) return;
    socketRef.current = io(getApiBaseUrl(), {
      auth: { token },
      query: { token }
    });
    socketRef.current.on('new_message', (payload) => {
      handleIncomingRealtimeMessage(payload);
    });
  };

  const handleIncomingRealtimeMessage = (payload: any) => {
    if (!payload) return;
    const targetPhone = payload.from === 'me' ? payload.customerPhone : payload.from;
    if (!targetPhone) return;

    const newMessage: Message = {
      from: payload.from,
      text: payload.text || '',
      type: payload.type || 'text',
      attachments: payload.attachments || [],
      metadata: payload.metadata || {},
      sentiment: payload.sentiment,
      timestamp: payload.timestamp || Date.now()
    };

    if (newMessage.type === 'system_error') {
      showToast(newMessage.text || 'حدث خطأ في إرسال الرسالة', 'error');
    }

    setConversations(prev => {
      const existingIdx = prev.findIndex(c => c.customerPhone === targetPhone);
      const isCurrentlyOpen = selectedChatRef.current?.customerPhone === targetPhone;

      if (existingIdx !== -1) {
        const updatedList = [...prev];
        const oldTags = updatedList[existingIdx].tags || [];
        const newTags = payload.tags || [];
        
        const updatedConv = {
          ...updatedList[existingIdx],
          lastMessage: payload.text || `[${payload.type || 'message'}]`,
          lastMessageAt: new Date().toISOString(),
          lastSentiment: payload.sentiment || updatedList[existingIdx].lastSentiment,
          customerId: payload.customerId || updatedList[existingIdx].customerId,
          tags: Array.from(new Set([...oldTags, ...newTags])),
          messages: [...(updatedList[existingIdx].messages || []), newMessage],
          unreadCount: (payload.from !== 'me' && !isCurrentlyOpen) ? (updatedList[existingIdx].unreadCount || 0) + 1 : (updatedList[existingIdx].unreadCount || 0)
        };
        updatedList.splice(existingIdx, 1);
        return [updatedConv, ...updatedList];
      } else {
        const newConv: Conversation = {
          _id: `temp-${Date.now()}`,
          customerPhone: targetPhone,
          platform: payload.platform || 'whatsapp',
          customerId: payload.customerId,
          lastMessage: payload.text || `[${payload.type || 'message'}]`,
          lastMessageAt: new Date().toISOString(),
          messages: [newMessage],
          status: 'open',
          tags: payload.tags || [],
          unreadCount: isCurrentlyOpen ? 0 : 1
        };
        return [newConv, ...prev];
      }
    });

    if (selectedChatRef.current && selectedChatRef.current.customerPhone === targetPhone) {
      setSelectedChat(prev => {
        if (!prev) return null;
        return { ...prev, messages: [...(prev.messages || []), newMessage] };
      });
    }
  };

  const selectConversation = async (conv: Conversation) => {
    setSelectedChat({ ...conv, unreadCount: 0 });
    setShowTagEditor(false);
    setConversations(prev => prev.map(c => c.customerPhone === conv.customerPhone ? { ...c, unreadCount: 0 } : c));
    try { if (conv._id && !conv._id.startsWith('temp')) await api.patch(`/conversations/${conv._id}/read`); } catch (e) {}
  };

  const toggleAi = async () => {
    if (!selectedChat) return;
    const newStatus = !selectedChat.aiEnabled;
    try {
      await api.patch(`/conversations/${selectedChat._id}/toggle-ai`, { enabled: newStatus });
      setSelectedChat({ ...selectedChat, aiEnabled: newStatus });
      setConversations(prev => prev.map(c => c._id === selectedChat._id ? { ...c, aiEnabled: newStatus } : c));
    } catch (error) {}
  };

  const handleToggleTag = async (tag: string) => {
    if (!selectedChat) return;
    const currentTags = selectedChat.tags || [];
    const newTags = currentTags.includes(tag) ? currentTags.filter(t => t !== tag) : [...currentTags, tag];
    
    try {
      await api.patch(`/conversations/${selectedChat._id}/tags`, { tags: newTags });
      setSelectedChat({ ...selectedChat, tags: newTags });
      setConversations(prev => prev.map(c => c._id === selectedChat._id ? { ...c, tags: newTags } : c));
    } catch (e) {}
  };

  const handleAddNewTag = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTagInput.trim() || !selectedChat) return;
    const tag = newTagInput.trim().replace(/\s+/g, '_');
    if (!allTags.includes(tag)) {
      const updatedCustom = [...customTags, tag];
      setCustomTags(updatedCustom);
      await api.patch('/stores/me', { customTags: updatedCustom });
    }
    await handleToggleTag(tag);
    setNewTagInput('');
  };

  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!messageInput.trim() || !selectedChat) return;
    const textToSend = messageInput;
    setMessageInput('');
    try {
      await api.post(`/conversations/${selectedChat._id}/messages`, { text: textToSend });
    } catch (error: any) {
      showToast(error.response?.data?.message || error.message || 'فشل إرسال الرسالة', 'error');
    }
  };

  const getPlatformIcon = (platform: string) => {
    switch (platform) {
      case 'whatsapp': return <FaWhatsapp size={14} className="text-green-500" />;
      case 'instagram': return <FaInstagram size={14} className="text-pink-500" />;
      case 'facebook': return <FaFacebook size={14} className="text-blue-600" />;
      case 'google_maps': return <FaMapMarkerAlt size={14} className="text-red-500" />;
      default: return <MessageCircle size={14} />;
    }
  };

  const getSentimentEmoji = (sentiment?: string) => {
    switch (sentiment) {
      case 'positive': return <span className="text-lg filter drop-shadow-[0_0_5px_rgba(34,197,94,0.5)]">😊</span>;
      case 'negative': return <span className="text-lg filter drop-shadow-[0_0_5px_rgba(239,68,68,0.5)]">😡</span>;
      default: return null;
    }
  };

  const getTagColor = (tag: string) => {
    const map: any = {
      'استفسار_سعر': 'bg-blue-500/10 text-blue-400 border-blue-500/20',
      'طلب_جديد': 'bg-green-500/10 text-green-400 border-green-500/20',
      'شكوى': 'bg-red-500/10 text-red-400 border-red-500/20',
      'موقع_المحل': 'bg-orange-500/10 text-orange-400 border-orange-500/20',
      'سؤال_عام': 'bg-neutral-500/10 text-neutral-400 border-neutral-500/20',
      'VIP': 'bg-yellow-500/10 text-yellow-500 border-yellow-500/20'
    };
    return map[tag] || 'bg-indigo-500/10 text-indigo-400 border-indigo-500/20';
  };

  const filteredConversations = conversations.filter(c => {
    const tagMatch = !selectedTag || c.tags?.includes(selectedTag);
    const platformMatch = !selectedPlatform || c.platform === selectedPlatform;
    return tagMatch && platformMatch;
  });

  const allTags = Array.from(new Set([...defaultTags, ...customTags]));

  return (
    <div className="h-[calc(100vh-160px)] flex bg-labbaik-surface lg:rounded-[2.5rem] overflow-hidden border border-white/5 shadow-2xl animate-fade-in relative" dir="rtl">
      
      <div className={`${showMobileList ? 'flex' : 'hidden'} lg:flex w-full lg:w-[450px] border-l border-white/5 flex-col bg-white/2`}>
        <div className="p-8 border-b border-white/5 space-y-6">
          <div className="flex items-center justify-between">
            <h2 className="text-xl font-black text-white">صندوق الوارد الموحد</h2>
            <div className="relative" ref={filterRef}>
              <Button onClick={() => setShowFilterDropdown(!showFilterDropdown)} variant={(selectedTag || selectedPlatform) ? 'primary' : 'secondary'} size="md" className="gap-2"><Filter size={20} />{(selectedTag || selectedPlatform) && <span className="w-2 h-2 bg-red-500 rounded-full"></span>}</Button>
              {showFilterDropdown && (
                <div className="absolute left-0 mt-4 w-72 bg-labbaik-surface border border-white/10 rounded-[2rem] shadow-3xl z-[100] overflow-hidden animate-slide-up">
                  <div className="p-5 border-b border-white/5 flex justify-between items-center bg-white/2"><span className="text-xs font-black text-neutral-300">تصفية النتائج</span>{(selectedTag || selectedPlatform) && (<button onClick={() => {setSelectedTag(null); setSelectedPlatform(null); setShowFilterDropdown(false);}} className="text-[10px] font-black text-labbaik-blue hover:underline">مسح الكل</button>)}</div>
                  <div className="max-h-[400px] overflow-y-auto custom-scrollbar p-4 space-y-6">
                    <div className="space-y-3"><span className="text-[9px] font-black text-neutral-400 uppercase tracking-widest flex items-center gap-2"><Share2 size={12} /> القنوات</span><div className="grid grid-cols-1 gap-1">{platforms.map(p => (<Button key={p.id} onClick={() => setSelectedPlatform(selectedPlatform === p.id ? null : p.id)} variant={selectedPlatform === p.id ? 'primary' : 'secondary'} size="sm" className="w-full justify-between">{p.icon} {p.name}{selectedPlatform === p.id && <Check size={14} />}</Button>))}</div></div>
                    <div className="space-y-3"><span className="text-[9px] font-black text-neutral-400 uppercase tracking-widest flex items-center gap-2"><Tag size={12} /> الوسوم</span><div className="grid grid-cols-1 gap-1">{allTags.map(tag => (<Button key={tag} onClick={() => setSelectedTag(selectedTag === tag ? null : tag)} variant={selectedTag === tag ? 'primary' : 'secondary'} size="sm" className="w-full justify-between">{tag.replace('_', ' ')}{selectedTag === tag && <Check size={14} />}</Button>))}</div></div>
                  </div>
                  <div className="p-4 bg-labbaik-blue/5 text-center"><Button onClick={() => setShowFilterDropdown(false)} variant="primary" size="md" className="w-full">تطبيق</Button></div>
                </div>
              )}
            </div>
          </div>
          <div className="relative group"><Search className="absolute right-5 top-1/2 -translate-y-1/2 text-neutral-500 group-focus-within:text-labbaik-blue transition-colors" size={18} /><input type="text" placeholder="البحث في المحادثات..." className="w-full bg-white/2 border border-white/5 rounded-[1.5rem] py-4 pr-12 pl-6 text-sm text-white focus:outline-none focus:ring-2 focus:ring-labbaik-blue/30 transition-all font-bold placeholder:text-gray-700"/></div>
        </div>
        <div className="flex-1 overflow-y-auto custom-scrollbar p-4 space-y-3">
          {loading ? <SkeletonCard count={5} className="rounded-[2.2rem]" /> : filteredConversations.length === 0 ? (<div className="p-10 text-center space-y-4"><MessageCircle size={40} className="mx-auto text-neutral-700" /><p className="text-neutral-500 font-black text-sm">لا توجد نتائج.</p></div>) : filteredConversations.map((conv) => (
            <Card 
              key={conv._id} 
              variant="labbaik"
              isSelected={selectedChat?._id === conv._id}
              interactive={true}
              padding="md"
              onClick={() => selectConversation(conv)}
              className="flex flex-col gap-4 relative overflow-hidden group"
            >
              <div className="flex items-start gap-4">
                <div className="relative shrink-0"><div className={`w-14 h-14 rounded-2xl flex items-center justify-center border transition-transform group-hover:scale-105 ${selectedChat?._id === conv._id ? 'bg-labbaik-blue/20 border-labbaik-blue/30' : 'bg-white/5 border-white/10'}`}><UserIcon size={24} className={selectedChat?._id === conv._id ? 'text-labbaik-blue' : 'text-neutral-400'} /></div><div className="absolute -bottom-1 -left-1 bg-labbaik-surface p-1.5 rounded-lg border border-white/10">{getPlatformIcon(conv.platform)}</div></div>
                <div className="flex-1 min-w-0 text-right space-y-1"><div className="flex justify-between items-center"><div className="flex items-center gap-2 truncate"><h4 className={`text-sm font-bold truncate ${conv.unreadCount && conv.unreadCount > 0 ? 'text-white' : 'font-black text-neutral-300'}`}>{conv.customerPhone}</h4>{getSentimentEmoji(conv.lastSentiment)}</div><span className="text-[9px] text-neutral-500 font-black">{safeFormatDate(conv.lastMessageAt || Date.now(), 'HH:mm')}</span></div><p className={`text-[11px] truncate ${conv.unreadCount && conv.unreadCount > 0 ? 'text-gray-200 font-bold' : 'text-neutral-400 font-medium'}`}>{conv.lastMessage}</p></div>
              </div>
              {conv.tags && conv.tags.length > 0 && (<div className="flex flex-wrap gap-1.5 pt-1">{conv.tags.map(tag => (<span key={tag} className={`text-[8px] font-black px-2 py-0.5 rounded-md border flex items-center gap-1 ${getTagColor(tag)}`}><Tag size={8} /> {tag.replace('_', ' ')}</span>))}</div>)}
              {Number(conv.unreadCount) > 0 && <div className="absolute left-6 top-1/2 -translate-y-1/2 w-6 h-6 bg-labbaik-blue text-labbaik-on-accent text-[10px] font-black rounded-full flex items-center justify-center shadow-lg animate-bounce-short">{conv.unreadCount}</div>}
            </Card>
          ))}
        </div>
      </div>

      <div className={`${!showMobileList ? 'flex' : 'hidden'} lg:flex flex-1 flex-col bg-black/10`}>
        {selectedChat ? (
          <>
            <div className="h-24 px-8 flex items-center justify-between border-b border-white/5 backdrop-blur-md z-40 bg-labbaik-surface/50">
              <div className="flex items-center gap-5"><button onClick={() => setShowMobileList(true)} className="lg:hidden p-2 text-neutral-400"><ChevronRight size={28} /></button><div className="w-12 h-12 bg-labbaik-blue/10 rounded-2xl flex items-center justify-center border border-labbaik-blue/20 shadow-lg"><UserIcon size={24} className="text-labbaik-blue" /></div><div className="space-y-1"><h3 className="font-black text-sm text-white">{selectedChat.customerPhone}</h3><div className="flex items-center gap-2">{selectedChat.tags?.map(tag => (<span key={tag} className={`text-[7px] font-black px-1.5 py-0.5 rounded border uppercase tracking-widest ${getTagColor(tag)}`}>{tag.replace('_', ' ')}</span>))}<button onClick={() => setShowTagEditor(true)} className="p-1 hover:bg-white/5 rounded-md text-neutral-400 hover:text-labbaik-blue transition-all"><Plus size={12} /></button></div></div></div>
              <div className="flex items-center gap-6">
                {selectedChat.customerId && (<Button onClick={() => setShowProfile(!showProfile)} variant={showProfile ? 'primary' : 'secondary'} size="md"><Contact size={20} /></Button>)}
                <div onClick={toggleAi} className={`flex items-center gap-3 px-4 py-2.5 rounded-2xl cursor-pointer transition-all border group ${selectedChat.aiEnabled !== false ? 'bg-labbaik-blue/10 border-labbaik-blue/30 text-labbaik-blue' : 'bg-red-500/10 border-red-500/30 text-red-400'}`}><div className={`w-2 h-2 rounded-full ${selectedChat.aiEnabled !== false ? 'bg-labbaik-blue animate-pulse shadow-[0_0_8px_#643B89]' : 'bg-red-500'}`}></div><span className="text-[10px] font-black uppercase tracking-widest">{selectedChat.aiEnabled !== false ? 'لبيك نشط' : 'الذكاء معطل'}</span></div>
                <button className="p-3 hover:bg-white/5 rounded-2xl text-neutral-400 hover:text-white transition-all"><MoreVertical size={20} /></button>
              </div>
            </div>
            <div className="flex-1 overflow-y-auto p-8 space-y-8 custom-scrollbar bg-[url('https://www.transparenttextures.com/patterns/cubes.png')] bg-fixed opacity-90">
              {selectedChat.messages?.map((msg, idx) => (
                msg.type === 'system_error' ? (
                  <div key={idx} className="flex justify-center">
                    <div className="max-w-[90%] rounded-2xl border border-red-500/30 bg-red-500/10 px-5 py-4 text-red-200 shadow-xl">
                      <div className="flex items-start gap-3">
                        <AlertTriangle size={18} className="mt-0.5 shrink-0" />
                        <div className="space-y-1 text-right">
                          <p className="text-xs font-black">تنبيه إرسال واتساب</p>
                          <p className="text-[12px] font-bold leading-6">{msg.text}</p>
                        </div>
                      </div>
                    </div>
                  </div>
                ) : (
                <div key={idx} className={`flex ${msg.from === 'me' ? 'justify-start' : 'justify-end'}`}>
                  <div className={`max-w-[80%] lg:max-w-[65%] p-5 rounded-[2rem] shadow-2xl ${msg.from === 'me' ? 'bg-gradient-to-br from-labbaik-blue to-[#7A4DA3] text-labbaik-on-accent rounded-tr-none font-bold' : 'bg-labbaik-chat text-white rounded-tl-none border border-white/5'}`}>
                    <div className="flex justify-between items-start gap-6">
                      <p className="text-[13px] leading-[1.8] whitespace-pre-wrap">{msg.text}</p>
                      {msg.from !== 'me' && msg.sentiment && <span className="text-xl shrink-0 filter drop-shadow-md">{getSentimentEmoji(msg.sentiment)}</span>}
                    </div>
                    <MessageExtras msg={msg} />
                    <div className={`flex items-center gap-2 mt-3 ${msg.from === 'me' ? 'justify-start' : 'justify-end'}`}>
                      <span className="text-[9px] opacity-60 font-black tabular-nums">{safeFormatDate(msg.timestamp || Date.now(), 'HH:mm')}</span>
                      {msg.from === 'me' && <CheckCheck size={14} className="opacity-60" />}
                    </div>
                  </div>
                </div>
                )
              ))}
              <div ref={messagesEndRef} />
            </div>
            <div className="p-6 border-t border-white/5 bg-labbaik-surface/80 backdrop-blur-xl"><form onSubmit={handleSendMessage} className="flex items-center gap-4 max-w-5xl mx-auto"><input type="text" value={messageInput} onChange={(e) => setMessageInput(e.target.value)} placeholder="اكتب ردك هنا..." className="flex-1 bg-white/5 border border-white/10 rounded-[1.8rem] py-5 px-8 text-sm text-white focus:outline-none focus:ring-2 focus:ring-labbaik-blue/50 font-bold"/><Button type="submit" variant="primary" size="md" className="shrink-0" style={{width: '64px', height: '64px', borderRadius: '1.5rem', display: 'flex', alignItems: 'center', justifyContent: 'center'}}><Send size={28} /></Button></form></div>
          </>
        ) : <div className="flex-1 flex flex-col items-center justify-center text-neutral-400 p-10 text-center animate-pulse"><div className="w-32 h-32 bg-white/2 rounded-[3rem] flex items-center justify-center mb-8 border border-white/5 shadow-inner"><MessageCircle size={64} className="opacity-10 text-labbaik-blue" /></div><h3 className="text-2xl font-black text-neutral-400">بانتظار اختيارك..</h3></div>}
      </div>

      {selectedChat && showProfile && selectedChat.customerId && (<CustomerProfile customerId={selectedChat.customerId} onClose={() => setShowProfile(false)} />)}

      {showTagEditor && (
        <div className="fixed inset-0 z-[999] flex items-center justify-center p-6 lg:p-0">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-md" onClick={() => setShowTagEditor(false)}></div>
          <div className="relative bg-labbaik-surface border border-white/10 p-10 rounded-[3rem] shadow-3xl w-full max-w-xl animate-slide-up space-y-10">
            <div className="flex justify-between items-center border-b border-white/5 pb-6"><div className="flex items-center gap-4"><div className="p-3 bg-labbaik-blue/10 rounded-2xl"><Layers className="text-labbaik-blue" size={24} /></div><div><h4 className="text-xl font-black text-white">إدارة تصنيفات العميل</h4><p className="text-neutral-400 text-[10px] mt-1 font-bold">أضف وسوماً مخصصة لتنظيم محادثات متجرك بذكاء.</p></div></div><button onClick={() => setShowTagEditor(false)} className="p-2 hover:bg-white/5 rounded-xl text-neutral-400 hover:text-white transition-all"><CloseIcon size={24} /></button></div>
            <div className="space-y-4"><label className="text-xs font-black text-neutral-400 uppercase px-2 flex items-center gap-2"><Plus size={14} className="text-labbaik-blue" /> إنشاء وسم جديد</label><form onSubmit={handleAddNewTag} className="relative group"><Hash className="absolute right-5 top-1/2 -translate-y-1/2 text-neutral-500 group-focus-within:text-labbaik-blue transition-colors" size={18} /><input type="text" value={newTagInput} onChange={(e) => setNewTagInput(e.target.value)} placeholder="اكتب اسم الوسم واضغط Enter..." className="w-full bg-white/2 border border-white/10 rounded-2xl py-5 pr-14 pl-6 text-sm text-white focus:outline-none focus:ring-2 focus:ring-labbaik-blue/50 transition-all font-bold"/></form></div>
            <div className="space-y-4"><label className="text-xs font-black text-neutral-400 uppercase px-2 flex items-center gap-2"><Tag size={14} className="text-labbaik-blue" /> الوسوم المتوفرة</label><div className="flex flex-wrap gap-3 max-h-64 overflow-y-auto custom-scrollbar p-2">{allTags.map(tag => (<Button key={tag} onClick={() => handleToggleTag(tag)} variant={selectedChat?.tags?.includes(tag) ? 'primary' : 'secondary'} size="sm" className="gap-2">{selectedChat?.tags?.includes(tag) && <Check size={14} />} {tag.replace('_', ' ')}</Button>))}</div></div>
          </div>
        </div>
      )}
      <style>{`@keyframes bounce-short { 0%, 100% { transform: translateY(0); } 50% { transform: translateY(-4px); } } .animate-bounce-short { animation: bounce-short 0.6s ease-in-out infinite; }`}</style>
    </div>
  );
}


