import type { Edge, Node } from '@xyflow/react';
import { Flag, Headset, Link2, List, MessageSquare, MousePointerClick, Zap } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

// Mirrors backend/src/modules/flows/flow-engine.ts — the backend validates and runs flows.

export type FlowNodeType = 'start' | 'message' | 'buttons' | 'list' | 'link' | 'handoff' | 'end';
export type TriggerType = 'new_conversation' | 'any_message' | 'keyword';
export type KeywordMatch = 'exact' | 'contains' | 'starts_with';

export interface FlowTrigger {
  type: TriggerType;
  match?: KeywordMatch;
  keywords?: string[];
}

export interface FlowMedia {
  file?: string;
  link?: string;
  type: 'image' | 'video' | 'audio' | 'document';
  mimeType?: string;
  filename?: string;
  size?: number;
}

export interface FlowOption {
  id: string;
  label: string;
  description?: string;
}

export type FlowNodeData = {
  text?: string;
  media?: FlowMedia | null;
  buttons?: FlowOption[];
  buttonText?: string;
  url?: string;
  footer?: string;
  trigger?: FlowTrigger;
  imageUrl?: string;
  isStart?: boolean;
  /** Editor-only: problems found by the validator, injected before render and stripped before save. */
  issues?: FlowIssue[];
};

export type FlowNode = Node<FlowNodeData>;
export type FlowEdge = Edge;

export interface FlowIssue {
  level: 'error' | 'warning';
  nodeId?: string;
  message: string;
}

export interface FlowState {
  nodeId: string | null;
  invalidReplies: number;
}

export const FALLBACK_HANDLE = 'fallback';
export const MAX_REPLY_BUTTONS = 3;
export const MAX_LIST_ROWS = 10;

export const LIMITS = { body: 1024, text: 4096, button: 20, listButton: 20, rowTitle: 24, rowDescription: 72, footer: 60 };

export interface NodeKind {
  type: FlowNodeType;
  label: string;
  hint: string;
  icon: LucideIcon;
  /** Tailwind classes for the icon chip: tinted background + readable foreground in both themes. */
  tone: string;
  group: 'messages' | 'actions' | null;
}

export const NODE_KINDS: Record<FlowNodeType, NodeKind> = {
  start: { type: 'start', label: 'البداية', hint: 'متى يبدأ التدفق', icon: Zap, tone: 'bg-emerald-500/12 text-emerald-700 dark:text-emerald-300', group: null },
  message: { type: 'message', label: 'رسالة', hint: 'نص أو رابط أو ملف', icon: MessageSquare, tone: 'bg-labbaik-blue/10 text-labbaik-blue dark:text-purple-300', group: 'messages' },
  buttons: { type: 'buttons', label: 'أزرار', hint: 'حتى 3 خيارات سريعة', icon: MousePointerClick, tone: 'bg-sky-500/12 text-sky-700 dark:text-sky-300', group: 'messages' },
  list: { type: 'list', label: 'قائمة', hint: 'حتى 10 خيارات', icon: List, tone: 'bg-indigo-500/12 text-indigo-700 dark:text-indigo-300', group: 'messages' },
  link: { type: 'link', label: 'زر رابط', hint: 'زر يفتح رابطًا', icon: Link2, tone: 'bg-teal-500/12 text-teal-700 dark:text-teal-300', group: 'messages' },
  handoff: { type: 'handoff', label: 'تحويل لموظف', hint: 'يوقف الرد الآلي', icon: Headset, tone: 'bg-orange-500/12 text-orange-700 dark:text-orange-300', group: 'actions' },
  end: { type: 'end', label: 'نهاية', hint: 'ينهي التدفق', icon: Flag, tone: 'bg-neutral-500/12 text-neutral-700 dark:text-neutral-300', group: 'actions' },
};

export const MEDIA_KIND_LABELS: Record<FlowMedia['type'], string> = { image: 'صورة', video: 'فيديو', audio: 'مقطع صوتي', document: 'ملف' };

export const TRIGGER_LABELS: Record<TriggerType, string> = {
  new_conversation: 'بداية كل محادثة جديدة',
  any_message: 'أي رسالة من العميل',
  keyword: 'كلمة مفتاحية',
};

export const MATCH_LABELS: Record<KeywordMatch, string> = {
  exact: 'تساوي الكلمة تمامًا',
  contains: 'تحتوي الكلمة',
  starts_with: 'تبدأ بالكلمة',
};

export function triggerSummary(trigger?: FlowTrigger) {
  if (!trigger || trigger.type !== 'keyword') return TRIGGER_LABELS[trigger?.type || 'new_conversation'];
  const words = (trigger.keywords || []).filter(Boolean);
  return words.length ? `كلمة: ${words.slice(0, 3).join('، ')}${words.length > 3 ? ` +${words.length - 3}` : ''}` : 'كلمة مفتاحية (غير محددة)';
}

export const uid = (prefix: string) => `${prefix}-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;

export function defaultData(type: FlowNodeType): FlowNodeData {
  switch (type) {
    case 'start':
      return { trigger: { type: 'new_conversation', match: 'exact', keywords: [] } };
    case 'message':
      return { text: '' };
    case 'buttons':
      return { text: 'كيف نقدر نخدمك؟', buttons: [{ id: uid('opt'), label: 'خيار 1' }, { id: uid('opt'), label: 'خيار 2' }] };
    case 'list':
      return { text: 'اختر من القائمة:', buttonText: 'عرض الخيارات', buttons: [{ id: uid('opt'), label: 'خيار 1' }, { id: uid('opt'), label: 'خيار 2' }] };
    case 'link':
      return { text: 'تقدر تزور متجرنا من الزر أدناه', buttonText: 'زيارة المتجر', url: 'https://' };
    case 'handoff':
      return { text: 'تم تحويلك لأحد موظفينا، سيرد عليك قريبًا.' };
    default:
      return {};
  }
}

/** Drops editor-only fields before the graph goes to the server. */
export function serializeGraph(nodes: FlowNode[], edges: FlowEdge[]) {
  return {
    nodes: nodes.map(({ id, type, position, data }) => {
      const { issues: _issues, ...rest } = data;
      return { id, type, position, data: rest };
    }),
    edges: edges.map(({ id, source, target, sourceHandle }) => ({ id, source, target, sourceHandle: sourceHandle ?? null })),
  };
}

/** Upgrades flows saved by the first editor: a start node without trigger, header images as `imageUrl`. */
export function normalizeNodes(nodes: FlowNode[]): FlowNode[] {
  return nodes.map((node) => {
    if (node.type === 'start' && !node.data?.trigger) return { ...node, data: { ...node.data, trigger: { type: 'new_conversation', match: 'exact', keywords: [] } } };
    if (node.type === 'buttons' && node.data?.imageUrl && !node.data.media) {
      const { imageUrl, ...rest } = node.data;
      return { ...node, data: { ...rest, media: { type: 'image', link: imageUrl } } };
    }
    return node;
  });
}

const NODE_WIDTH = 280;
const GAP_X = 60;
const GAP_Y = 90;

/** Arranges nodes in layers by distance from the start, ordered by their parent's option order. */
export function autoLayout(nodes: FlowNode[], edges: FlowEdge[]): FlowNode[] {
  const start = nodes.find((node) => node.type === 'start') || nodes[0];
  if (!start) return nodes;
  const depth = new Map<string, number>([[start.id, 0]]);
  const order: string[] = [start.id];
  for (let i = 0; i < order.length; i++) {
    const id = order[i];
    const parent = nodes.find((node) => node.id === id);
    const optionIndex = (handle?: string | null) => {
      const index = (parent?.data.buttons || []).findIndex((option) => option.id === handle);
      return index < 0 ? (handle === FALLBACK_HANDLE ? 99 : 0) : index;
    };
    edges
      .filter((edge) => edge.source === id)
      .sort((a, b) => optionIndex(a.sourceHandle) - optionIndex(b.sourceHandle))
      .forEach((edge) => {
        if (depth.has(edge.target)) return;
        depth.set(edge.target, depth.get(id)! + 1);
        order.push(edge.target);
      });
  }
  const maxDepth = Math.max(0, ...depth.values());
  nodes.filter((node) => !depth.has(node.id)).forEach((node) => { depth.set(node.id, maxDepth + 1); order.push(node.id); });

  const layers = new Map<number, string[]>();
  order.forEach((id) => layers.set(depth.get(id)!, [...(layers.get(depth.get(id)!) || []), id]));
  const position = new Map<string, { x: number; y: number }>();
  let y = 0;
  [...layers.keys()].sort((a, b) => a - b).forEach((layer) => {
    const ids = layers.get(layer)!;
    const width = ids.length * NODE_WIDTH + (ids.length - 1) * GAP_X;
    // RTL: the first option's branch sits on the right.
    ids.forEach((id, index) => position.set(id, { x: width / 2 - NODE_WIDTH - index * (NODE_WIDTH + GAP_X), y }));
    const tallest = Math.max(...ids.map((id) => estimateHeight(nodes.find((node) => node.id === id)!)));
    y += tallest + GAP_Y;
  });
  return nodes.map((node) => ({ ...node, position: position.get(node.id) || node.position }));
}

function estimateHeight(node: FlowNode) {
  const options = node.data.buttons?.length || 0;
  const media = node.data.media ? 120 : 0;
  return 96 + media + options * 38 + (node.type === 'buttons' || node.type === 'list' ? 38 : 0);
}

export interface FlowTemplate {
  id: string;
  name: string;
  description: string;
  build: () => { nodes: FlowNode[]; edges: FlowEdge[] };
}

const edge = (source: string, target: string, sourceHandle?: string): FlowEdge => ({ id: uid('e'), source, target, sourceHandle: sourceHandle ?? null });

export const FLOW_TEMPLATES: FlowTemplate[] = [
  {
    id: 'welcome-menu',
    name: 'ترحيب بقائمة خيارات',
    description: 'رسالة ترحيب مع أزرار: العروض، حالة الطلب، التحدث مع موظف.',
    build: () => {
      const offers = uid('opt');
      const order = uid('opt');
      const agent = uid('opt');
      const nodes: FlowNode[] = [
        { id: 'start', type: 'start', position: { x: 0, y: 0 }, data: defaultData('start') },
        { id: 'welcome', type: 'message', position: { x: 0, y: 0 }, data: { text: 'أهلًا {{name}} 👋\nحياك الله في متجرنا.' } },
        { id: 'menu', type: 'buttons', position: { x: 0, y: 0 }, data: { text: 'كيف نقدر نخدمك اليوم؟', buttons: [{ id: offers, label: 'العروض' }, { id: order, label: 'حالة الطلب' }, { id: agent, label: 'التحدث مع موظف' }] } },
        { id: 'offers', type: 'message', position: { x: 0, y: 0 }, data: { text: 'هذه أحدث عروضنا 🎁' } },
        { id: 'order', type: 'link', position: { x: 0, y: 0 }, data: { text: 'تقدر تتابع طلبك من صفحة الطلبات.', buttonText: 'تتبع الطلب', url: 'https://' } },
        { id: 'agent', type: 'handoff', position: { x: 0, y: 0 }, data: defaultData('handoff') },
      ];
      const edges = [edge('start', 'welcome'), edge('welcome', 'menu'), edge('menu', 'offers', offers), edge('menu', 'order', order), edge('menu', 'agent', agent)];
      return { nodes: autoLayout(nodes, edges), edges };
    },
  },
  {
    id: 'keyword-file',
    name: 'رد على كلمة مفتاحية',
    description: 'عندما يكتب العميل كلمة مثل «العروض» يصله ملف أو صورة فورًا.',
    build: () => {
      const nodes: FlowNode[] = [
        { id: 'start', type: 'start', position: { x: 0, y: 0 }, data: { trigger: { type: 'keyword', match: 'contains', keywords: ['العروض', 'عروض'] } } },
        { id: 'reply', type: 'message', position: { x: 0, y: 0 }, data: { text: 'تفضل، هذا ملف عروضنا الحالية 👇' } },
        { id: 'end', type: 'end', position: { x: 0, y: 0 }, data: {} },
      ];
      const edges = [edge('start', 'reply'), edge('reply', 'end')];
      return { nodes: autoLayout(nodes, edges), edges };
    },
  },
  {
    id: 'blank',
    name: 'تدفق فارغ',
    description: 'ابدأ من نقطة البداية وأضف ما تحتاجه.',
    build: () => ({ nodes: [{ id: 'start', type: 'start', position: { x: 0, y: 0 }, data: defaultData('start') }], edges: [] }),
  },
];

/** {{name}} / {{phone}} as the test chat shows them. */
export const previewVariables = (text: string) => text.replace(/\{\{\s*name\s*\}\}/gi, 'محمد').replace(/\{\{\s*phone\s*\}\}/gi, '966500000000');

export const errorMessage = (error: unknown, fallback: string) =>
  (error as { response?: { data?: { message?: string } } })?.response?.data?.message || fallback;
