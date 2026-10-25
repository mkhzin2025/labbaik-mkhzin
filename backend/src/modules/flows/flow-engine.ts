/**
 * Flow graph model, validation and step logic. Pure functions only: the webhook uses them to drive real
 * conversations and the editor's test chat uses the same code, so what the merchant tests is what runs.
 *
 * Nodes live in the flow's `nodes` jsonb. Handles: every node has one input; `start`, `message`, `link` and
 * `media`-style nodes have one output (no sourceHandle); `buttons` / `list` have one output per option
 * (sourceHandle = option id) plus an optional `fallback` output taken when the reply matches no option.
 */

export type FlowNodeType = 'start' | 'message' | 'buttons' | 'list' | 'link' | 'handoff' | 'end';

export type TriggerType = 'new_conversation' | 'any_message' | 'keyword';
export type KeywordMatch = 'exact' | 'contains' | 'starts_with';

export interface FlowTrigger {
  type: TriggerType;
  match?: KeywordMatch;
  keywords?: string[];
}

export interface FlowMedia {
  /** Uploaded file kept by us (served from /flows/media/:file) and uploaded to Meta when sent. */
  file?: string;
  /** Or a public https link Meta downloads itself. */
  link?: string;
  type: 'image' | 'video' | 'audio' | 'document';
  mimeType?: string;
  filename?: string;
}

export interface FlowOption {
  id: string;
  label: string;
  description?: string;
}

export interface FlowNodeData {
  text?: string;
  media?: FlowMedia | null;
  buttons?: FlowOption[];
  /** list: the button that opens the list sheet. link: the call-to-action button text. */
  buttonText?: string;
  url?: string;
  footer?: string;
  trigger?: FlowTrigger;
  /** Legacy buttons-node header image (before `media`). */
  imageUrl?: string;
  isStart?: boolean;
  [key: string]: any;
}

export interface FlowNode {
  id: string;
  type: FlowNodeType | string;
  position?: { x: number; y: number };
  data: FlowNodeData;
}

export interface FlowEdge {
  id?: string;
  source: string;
  target: string;
  sourceHandle?: string | null;
}

export interface FlowGraph {
  nodes: FlowNode[];
  edges: FlowEdge[];
}

export interface FlowIssue {
  level: 'error' | 'warning';
  nodeId?: string;
  message: string;
}

export const FALLBACK_HANDLE = 'fallback';
export const MAX_REPLY_BUTTONS = 3;
export const MAX_LIST_ROWS = 10;
/** Invalid replies to a question before the flow lets go of the conversation. */
export const MAX_INVALID_REPLIES = 2;
/** A message after this much silence counts as a new conversation for the `new_conversation` trigger. */
export const NEW_CONVERSATION_GAP_MS = 24 * 60 * 60 * 1000;
/** Guards against cycles of nodes that never wait for the customer. */
const MAX_STEPS_PER_TURN = 12;

// WhatsApp Cloud API limits for interactive messages.
const LIMITS = { body: 1024, mediaCaption: 1024, text: 4096, button: 20, listButton: 20, rowTitle: 24, rowDescription: 72, footer: 60 };

const WAITS_FOR_REPLY = new Set(['buttons', 'list']);

export const NODE_LABELS: Record<string, string> = {
  start: 'البداية',
  message: 'رسالة',
  buttons: 'أزرار',
  list: 'قائمة',
  link: 'زر رابط',
  handoff: 'تحويل لموظف',
  end: 'نهاية',
};

export function startNodeOf(graph: FlowGraph) {
  return graph.nodes.find((node) => node.type === 'start' || node.data?.isStart);
}

/** Legacy flows (isDefault, no trigger on the start node) behave as "new conversation". */
export function triggerOf(graph: FlowGraph): FlowTrigger {
  const trigger = startNodeOf(graph)?.data?.trigger;
  return trigger?.type ? trigger : { type: 'new_conversation' };
}

export function normalizeText(value: string) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[ً-ٰٟ]/g, '') // Arabic diacritics
    .replace(/[أإآ]/g, 'ا')
    .replace(/ى/g, 'ي')
    .replace(/ة/g, 'ه')
    .replace(/[٠-٩]/g, (digit) => String('٠١٢٣٤٥٦٧٨٩'.indexOf(digit)))
    .replace(/\s+/g, ' ');
}

export function keywordMatches(trigger: FlowTrigger, input: string) {
  const text = normalizeText(input);
  if (!text) return false;
  const keywords = (trigger.keywords || []).map(normalizeText).filter(Boolean);
  return keywords.some((keyword) => {
    if (trigger.match === 'contains') return text.includes(keyword);
    if (trigger.match === 'starts_with') return text.startsWith(keyword);
    return text === keyword;
  });
}

/** Outgoing edge for a handle (undefined handle = the node's single output). */
function edgeFrom(graph: FlowGraph, nodeId: string, handle?: string) {
  return graph.edges.find((edge) => edge.source === nodeId && (handle ? edge.sourceHandle === handle : !edge.sourceHandle || edge.sourceHandle === 'out'));
}

function nodeById(graph: FlowGraph, id?: string | null) {
  return id ? graph.nodes.find((node) => node.id === id) : undefined;
}

/** Which option of a question node the reply picks: by WhatsApp reply id, label, or its number ("2"). */
export function matchOption(node: FlowNode, input: string, replyId?: string) {
  const options = node.data?.buttons || [];
  if (replyId) {
    const byId = options.find((option) => option.id === replyId);
    if (byId) return byId;
  }
  const text = normalizeText(input);
  if (!text) return undefined;
  const byLabel = options.find((option) => normalizeText(option.label) === text);
  if (byLabel) return byLabel;
  const index = /^\d{1,2}$/.test(text) ? Number(text) - 1 : -1;
  return index >= 0 ? options[index] : undefined;
}

export interface FlowState {
  nodeId: string | null;
  invalidReplies: number;
}

export interface FlowStep {
  /** Nodes to send, in order. */
  send: FlowNode[];
  /** Node the conversation now waits on, or null when the flow finished. */
  state: FlowState | null;
  /** The flow ended on a handoff node: stop automatic replies and leave it to the team. */
  handoff: boolean;
  /** The customer kept answering outside the options: the flow let go without sending anything. */
  released: boolean;
}

/** Sends `from` and every node after it that needs no reply, stopping at a question, handoff or end. */
function runFrom(graph: FlowGraph, from: FlowNode | undefined): FlowStep {
  const send: FlowNode[] = [];
  let node = from;
  for (let steps = 0; node && steps < MAX_STEPS_PER_TURN; steps++) {
    if (node.type === 'end') return { send, state: null, handoff: false, released: false };
    if (node.type !== 'start') send.push(node);
    if (node.type === 'handoff') return { send, state: null, handoff: true, released: false };
    if (WAITS_FOR_REPLY.has(node.type)) return { send, state: { nodeId: node.id, invalidReplies: 0 }, handoff: false, released: false };
    node = nodeById(graph, edgeFrom(graph, node.id)?.target);
  }
  return { send, state: null, handoff: false, released: false };
}

export function startFlow(graph: FlowGraph): FlowStep {
  return runFrom(graph, startNodeOf(graph));
}

/** Advances a conversation waiting on `state.nodeId` with the customer's reply. */
export function continueFlow(graph: FlowGraph, state: FlowState, input: string, replyId?: string): FlowStep {
  const current = nodeById(graph, state.nodeId);
  if (!current) return { send: [], state: null, handoff: false, released: true };
  if (!WAITS_FOR_REPLY.has(current.type)) return runFrom(graph, nodeById(graph, edgeFrom(graph, current.id)?.target));

  const option = matchOption(current, input, replyId);
  if (option) {
    const next = edgeFrom(graph, current.id, option.id);
    // An option the merchant left unconnected simply ends the flow.
    return next ? runFrom(graph, nodeById(graph, next.target)) : { send: [], state: null, handoff: false, released: false };
  }

  const fallback = edgeFrom(graph, current.id, FALLBACK_HANDLE);
  if (fallback) return runFrom(graph, nodeById(graph, fallback.target));

  if (state.invalidReplies + 1 >= MAX_INVALID_REPLIES) return { send: [], state: null, handoff: false, released: true };
  return { send: [current], state: { nodeId: current.id, invalidReplies: state.invalidReplies + 1 }, handoff: false, released: false };
}

const isHttpsUrl = (value?: string) => {
  try {
    return new URL(String(value || '')).protocol === 'https:';
  } catch {
    return false;
  }
};

/** Everything that would stop the flow from working (errors) or is likely a mistake (warnings). */
export function validateFlow(graph: FlowGraph): FlowIssue[] {
  const issues: FlowIssue[] = [];
  const nodes = Array.isArray(graph.nodes) ? graph.nodes : [];
  const edges = Array.isArray(graph.edges) ? graph.edges : [];
  const error = (message: string, nodeId?: string) => issues.push({ level: 'error', nodeId, message });
  const warning = (message: string, nodeId?: string) => issues.push({ level: 'warning', nodeId, message });

  const starts = nodes.filter((node) => node.type === 'start');
  if (starts.length === 0) error('أضف عقدة «البداية» ليعرف التدفق من أين يبدأ.');
  if (starts.length > 1) starts.slice(1).forEach((node) => error('يُسمح بعقدة بداية واحدة فقط.', node.id));

  const start = starts[0];
  if (start) {
    const trigger = triggerOf({ nodes, edges });
    if (trigger.type === 'keyword' && !(trigger.keywords || []).some((keyword) => keyword.trim())) {
      error('أضف كلمة مفتاحية واحدة على الأقل للمحفّز.', start.id);
    }
    if (!edges.some((edge) => edge.source === start.id)) error('اربط «البداية» بأول رسالة.', start.id);
  }

  for (const node of nodes) {
    const data = node.data || {};
    const text = String(data.text || '').trim();
    const options = data.buttons || [];
    const outgoing = edges.filter((edge) => edge.source === node.id);

    switch (node.type) {
      case 'message':
        if (!text && !data.media) error('اكتب نص الرسالة أو أرفق ملفًا.', node.id);
        if (data.media && text.length > LIMITS.mediaCaption) error(`النص مع المرفق لا يتجاوز ${LIMITS.mediaCaption} حرف.`, node.id);
        if (!data.media && text.length > LIMITS.text) error(`النص لا يتجاوز ${LIMITS.text} حرف.`, node.id);
        if (data.media?.link && !isHttpsUrl(data.media.link)) error('رابط المرفق يجب أن يبدأ بـ https://', node.id);
        break;
      case 'buttons':
      case 'list': {
        const isList = node.type === 'list';
        const max = isList ? MAX_LIST_ROWS : MAX_REPLY_BUTTONS;
        const titleMax = isList ? LIMITS.rowTitle : LIMITS.button;
        if (!text) error('اكتب السؤال أو النص الذي يظهر فوق الخيارات.', node.id);
        if (text.length > LIMITS.body) error(`النص لا يتجاوز ${LIMITS.body} حرف.`, node.id);
        if (options.length === 0) error('أضف خيارًا واحدًا على الأقل.', node.id);
        if (options.length > max) error(`الحد الأقصى ${max} ${isList ? 'خيارات في القائمة' : 'أزرار'}.`, node.id);
        if (options.some((option) => !option.label?.trim())) error('يوجد خيار بدون اسم.', node.id);
        if (options.some((option) => (option.label || '').length > titleMax)) error(`اسم الخيار لا يتجاوز ${titleMax} حرفًا (حد واتساب).`, node.id);
        const labels = options.map((option) => normalizeText(option.label)).filter(Boolean);
        if (new Set(labels).size !== labels.length) error('يوجد خياران بنفس الاسم.', node.id);
        if (isList && !String(data.buttonText || '').trim()) error('اكتب نص زر فتح القائمة.', node.id);
        if (isList && (data.buttonText || '').length > LIMITS.listButton) error(`نص زر القائمة لا يتجاوز ${LIMITS.listButton} حرفًا.`, node.id);
        if (isList && options.some((option) => (option.description || '').length > LIMITS.rowDescription)) error(`وصف الخيار لا يتجاوز ${LIMITS.rowDescription} حرفًا.`, node.id);
        if (!isList && data.media?.type === 'audio') error('رأس رسالة الأزرار يقبل صورة أو فيديو أو مستند فقط.', node.id);
        if (isList && data.media) error('القائمة لا تدعم مرفقًا في واتساب.', node.id);
        if ((data.footer || '').length > LIMITS.footer) error(`التذييل لا يتجاوز ${LIMITS.footer} حرفًا.`, node.id);
        const unlinked = options.filter((option) => option.label?.trim() && !outgoing.some((edge) => edge.sourceHandle === option.id));
        if (unlinked.length) warning(`خيارات غير مربوطة (ينتهي التدفق عندها): ${unlinked.map((option) => `«${option.label}»`).join('، ')}`, node.id);
        break;
      }
      case 'link':
        if (!text) error('اكتب نص الرسالة.', node.id);
        if (text.length > LIMITS.body) error(`النص لا يتجاوز ${LIMITS.body} حرف.`, node.id);
        if (!String(data.buttonText || '').trim()) error('اكتب نص الزر.', node.id);
        if ((data.buttonText || '').length > LIMITS.button) error(`نص الزر لا يتجاوز ${LIMITS.button} حرفًا.`, node.id);
        if (!isHttpsUrl(data.url)) error('أدخل رابطًا صحيحًا يبدأ بـ https://', node.id);
        break;
    }
  }

  // Reachability from the start node.
  if (start) {
    const reached = new Set<string>([start.id]);
    const queue = [start.id];
    while (queue.length) {
      const id = queue.shift()!;
      for (const edge of edges) {
        if (edge.source === id && !reached.has(edge.target)) {
          reached.add(edge.target);
          queue.push(edge.target);
        }
      }
    }
    nodes
      .filter((node) => !reached.has(node.id))
      .forEach((node) => warning('عقدة غير موصولة بمسار التدفق فلن تعمل.', node.id));
  }

  for (const edge of edges) {
    if (!nodes.some((node) => node.id === edge.target) || !nodes.some((node) => node.id === edge.source)) {
      warning('يوجد رابط لعقدة محذوفة.', edge.source);
    }
  }

  return issues;
}

export const hasErrors = (issues: FlowIssue[]) => issues.some((issue) => issue.level === 'error');

/** Fills {{name}} and {{phone}} placeholders the editor inserts. */
export function fillVariables(text: string, vars: { name?: string; phone?: string }) {
  return String(text || '')
    .replace(/\{\{\s*name\s*\}\}/gi, vars.name?.trim() || 'عميلنا العزيز')
    .replace(/\{\{\s*phone\s*\}\}/gi, vars.phone || '');
}

/** Plain-text version of a node: what the inbox shows, and what channels without interactive messages get. */
export function nodeAsText(node: FlowNode, text: string) {
  const data = node.data || {};
  const options = (data.buttons || []).map((option, index) => `${index + 1}. ${option.label}`);
  if ((node.type === 'buttons' || node.type === 'list') && options.length) return `${text}\n\n${options.join('\n')}`;
  if (node.type === 'link') return `${text}\n\n${data.buttonText || 'الرابط'}: ${data.url || ''}`;
  if (node.type === 'message' && data.media && !text) return data.media.filename || `[${data.media.type}]`;
  return text;
}
