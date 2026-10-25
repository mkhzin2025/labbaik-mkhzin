import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { DragEvent } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  addEdge,
  applyEdgeChanges,
  applyNodeChanges,
  Background,
  BackgroundVariant,
  BaseEdge,
  Controls,
  EdgeLabelRenderer,
  getSmoothStepPath,
  MarkerType,
  MiniMap,
  ReactFlow,
  ReactFlowProvider,
  useReactFlow,
} from '@xyflow/react';
import type { Connection, EdgeChange, EdgeProps, NodeChange } from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { AlertTriangle, ArrowRight, CheckCircle2, FlaskConical, LayoutGrid, Loader2, Save, X } from 'lucide-react';
import api from '../api/client';
import { useToast } from '../components/Toast';
import { useTheme } from '../context/ThemeContext';
import FlowNodeCard from '../components/flows/FlowNodes';
import NodeSettings from '../components/flows/NodeSettings';
import FlowTester from '../components/flows/FlowTester';
import {
  autoLayout, defaultData, errorMessage, FALLBACK_HANDLE, NODE_KINDS, normalizeNodes, serializeGraph, uid,
} from '../components/flows/flowModel';
import type { FlowEdge, FlowIssue, FlowNode, FlowNodeData, FlowNodeType } from '../components/flows/flowModel';

const EDGE_STYLE = { stroke: 'var(--color-labbaik-blue)', strokeWidth: 1.75 };
const edgeDefaults = { type: 'flow', markerEnd: { type: MarkerType.ArrowClosed, width: 16, height: 16, color: '#643B89' }, style: EDGE_STYLE };

/** Smooth-step edge with a remove button while selected. */
function FlowEdgeView(props: EdgeProps) {
  const { setEdges } = useReactFlow();
  const [path, labelX, labelY] = getSmoothStepPath({ ...props, borderRadius: 14 });
  return (
    <>
      <BaseEdge path={path} markerEnd={props.markerEnd} style={{ ...props.style, strokeWidth: props.selected ? 2.5 : 1.75 }} />
      {props.selected && (
        <EdgeLabelRenderer>
          <button
            type="button"
            onClick={() => setEdges((edges) => edges.filter((edge) => edge.id !== props.id))}
            aria-label="حذف الرابط"
            title="حذف الرابط"
            className="nodrag nopan pointer-events-auto absolute grid h-6 w-6 place-items-center rounded-full bg-labbaik-surface text-red-600 shadow-[0_2px_8px_rgba(15,10,30,0.25)] ring-1 ring-red-500/40 hover:bg-red-600 hover:text-white cursor-pointer"
            style={{ transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY}px)` }}
          >
            <X size={13} strokeWidth={2.5} />
          </button>
        </EdgeLabelRenderer>
      )}
    </>
  );
}

const edgeTypes = { flow: FlowEdgeView };
const nodeTypes = { start: FlowNodeCard, message: FlowNodeCard, buttons: FlowNodeCard, list: FlowNodeCard, link: FlowNodeCard, handoff: FlowNodeCard, end: FlowNodeCard };

const PALETTE: { title: string; types: FlowNodeType[] }[] = [
  { title: 'رسائل', types: ['message', 'buttons', 'list', 'link'] },
  { title: 'إجراءات', types: ['handoff', 'end'] },
];

const DRAG_TYPE = 'application/x-flow-node';

function Editor() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { showToast } = useToast();
  const { theme } = useTheme();
  const { screenToFlowPosition, setCenter, fitView, getNode } = useReactFlow();

  const [nodes, setNodes] = useState<FlowNode[]>([]);
  const [edges, setEdges] = useState<FlowEdge[]>([]);
  const [name, setName] = useState('');
  const [isActive, setIsActive] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [issues, setIssues] = useState<FlowIssue[]>([]);
  const [checked, setChecked] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [panel, setPanel] = useState<'settings' | 'test' | null>(null);
  const [issuesOpen, setIssuesOpen] = useState(false);
  const canvasRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let cancelled = false;
    api.get(`/flows/${id}`)
      .then(({ data }) => {
        if (cancelled) return;
        const loaded = normalizeNodes(Array.isArray(data.nodes) ? data.nodes : []);
        const loadedEdges: FlowEdge[] = (Array.isArray(data.edges) ? data.edges : []).map((edge: FlowEdge) => ({ ...edge, id: edge.id || uid('e'), ...edgeDefaults }));
        const unplaced = loaded.length > 1 && loaded.every((node) => !node.position || (node.position.x === loaded[0].position?.x && node.position.y === loaded[0].position?.y));
        setNodes((unplaced ? autoLayout(loaded, loadedEdges) : loaded).map((node) => ({ ...node, deletable: node.type !== 'start' })));
        setEdges(loadedEdges);
        setName(data.name);
        setIsActive(Boolean(data.isActive));
        setLoading(false);
      })
      .catch(() => {
        showToast('تعذر فتح التدفق.', 'error');
        navigate('/dashboard/flows');
      });
    return () => { cancelled = true; };
  }, [id, navigate, showToast]);

  // Live validation by the same rules the server applies before a flow can go live.
  const graphKey = useMemo(() => JSON.stringify(serializeGraph(nodes, edges), (key, value) => (key === 'position' ? undefined : value)), [nodes, edges]);
  useEffect(() => {
    if (loading) return;
    const timer = setTimeout(() => {
      api.post<FlowIssue[]>('/flows/validate', JSON.parse(graphKey))
        .then(({ data }) => { setIssues(Array.isArray(data) ? data : []); setChecked(true); })
        .catch(() => undefined);
    }, 350);
    return () => clearTimeout(timer);
  }, [graphKey, loading]);

  useEffect(() => {
    if (!dirty) return;
    const warn = (event: BeforeUnloadEvent) => { event.preventDefault(); };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty]);

  const errors = issues.filter((issue) => issue.level === 'error');
  const warnings = issues.filter((issue) => issue.level === 'warning');
  const startNode = nodes.find((node) => node.type === 'start');

  const displayNodes = useMemo(() => {
    const byNode = new Map<string, FlowIssue[]>();
    issues.forEach((issue) => issue.nodeId && byNode.set(issue.nodeId, [...(byNode.get(issue.nodeId) || []), issue]));
    return nodes.map((node) => (byNode.has(node.id) || node.data.issues ? { ...node, data: { ...node.data, issues: byNode.get(node.id) } } : node));
  }, [nodes, issues]);

  const selectedNode = displayNodes.find((node) => node.id === selectedId) || null;

  const onNodesChange = useCallback((changes: NodeChange<FlowNode>[]) => {
    if (changes.some((change) => change.type !== 'select' && change.type !== 'dimensions')) setDirty(true);
    if (changes.some((change) => change.type === 'remove' && change.id === selectedId)) { setSelectedId(null); setPanel((current) => (current === 'settings' ? null : current)); }
    setNodes((current) => applyNodeChanges(changes, current));
  }, [selectedId]);

  const onEdgesChange = useCallback((changes: EdgeChange<FlowEdge>[]) => {
    if (changes.some((change) => change.type !== 'select')) setDirty(true);
    setEdges((current) => applyEdgeChanges(changes, current));
  }, []);

  // Every output leads to exactly one step: a new connection replaces the old one from the same handle.
  const onConnect = useCallback((connection: Connection) => {
    setDirty(true);
    setEdges((current) => addEdge(
      { ...connection, id: uid('e'), ...edgeDefaults },
      current.filter((edge) => !(edge.source === connection.source && (edge.sourceHandle ?? null) === (connection.sourceHandle ?? null))),
    ));
  }, []);

  const isValidConnection = useCallback((connection: FlowEdge | Connection) => connection.source !== connection.target, []);

  const focusNode = useCallback((nodeId: string) => {
    const node = getNode(nodeId);
    if (!node) return;
    const width = node.measured?.width || 280;
    const height = node.measured?.height || 120;
    setCenter(node.position.x + width / 2, node.position.y + height / 2, { zoom: 1, duration: 300 });
  }, [getNode, setCenter]);

  const selectNode = (nodeId: string) => {
    setSelectedId(nodeId);
    setPanel('settings');
    setNodes((current) => current.map((node) => ({ ...node, selected: node.id === nodeId })));
  };

  const updateNodeData = (nodeId: string, patch: Partial<FlowNodeData>) => {
    setDirty(true);
    setNodes((current) => current.map((node) => (node.id === nodeId ? { ...node, data: { ...node.data, ...patch } } : node)));
    if (patch.buttons) {
      const handles = new Set([...patch.buttons.map((option) => option.id), FALLBACK_HANDLE]);
      setEdges((current) => current.filter((edge) => edge.source !== nodeId || !edge.sourceHandle || handles.has(edge.sourceHandle)));
    }
  };

  const deleteNode = (nodeId: string) => {
    setDirty(true);
    setNodes((current) => current.filter((node) => node.id !== nodeId));
    setEdges((current) => current.filter((edge) => edge.source !== nodeId && edge.target !== nodeId));
    setSelectedId(null);
    setPanel(null);
  };

  const addNode = (type: FlowNodeType, at?: { x: number; y: number }) => {
    const rect = canvasRef.current?.getBoundingClientRect();
    const center = rect ? screenToFlowPosition({ x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 }) : { x: 0, y: 0 };
    const source = nodes.find((node) => node.id === selectedId);
    const chain = !at && source && ['start', 'message', 'link'].includes(source.type || '') && !edges.some((edge) => edge.source === source.id && !edge.sourceHandle);
    const position = at || (chain && source
      ? { x: source.position.x, y: source.position.y + (source.measured?.height || 120) + 70 }
      : { x: center.x - 140 + (nodes.length % 4) * 24, y: center.y - 60 + (nodes.length % 4) * 24 });
    const node: FlowNode = { id: uid(type), type, position, data: defaultData(type), deletable: true };
    setNodes((current) => [...current.map((item) => ({ ...item, selected: false })), { ...node, selected: true }]);
    // Adding a step while a step with a free output is selected links them, so a flow can be built top-down by clicking.
    if (chain && source) setEdges((current) => [...current, { id: uid('e'), source: source.id, target: node.id, sourceHandle: null, ...edgeDefaults }]);
    setDirty(true);
    setSelectedId(node.id);
    setPanel('settings');
    if (chain) requestAnimationFrame(() => setCenter(position.x + 140, position.y + 80, { zoom: 1, duration: 300 }));
  };

  const onDrop = (event: DragEvent) => {
    event.preventDefault();
    const type = event.dataTransfer.getData(DRAG_TYPE) as FlowNodeType;
    if (!type || !NODE_KINDS[type]) return;
    const point = screenToFlowPosition({ x: event.clientX, y: event.clientY });
    addNode(type, { x: point.x - 140, y: point.y - 30 });
  };

  const arrange = () => {
    setNodes((current) => autoLayout(current, edges));
    setDirty(true);
    requestAnimationFrame(() => fitView({ padding: 0.2, duration: 300, maxZoom: 1 }));
  };

  const persist = async (extra: { isActive?: boolean } = {}) => {
    setSaving(true);
    try {
      const { data } = await api.patch(`/flows/${id}`, { name: name.trim() || 'تدفق بدون اسم', ...serializeGraph(nodes, edges), ...extra });
      setIsActive(Boolean(data.isActive));
      setDirty(false);
      return true;
    } catch (error) {
      showToast(errorMessage(error, 'تعذر حفظ التدفق.'), 'error');
      return false;
    } finally {
      setSaving(false);
    }
  };

  const save = async () => {
    if (isActive && errors.length) {
      setIssuesOpen(true);
      showToast('التدفق مفعّل، فلا يُحفظ وفيه مشاكل تمنع عمله. أصلحها أو أوقف التدفق أولًا.', 'error');
      return;
    }
    if (await persist()) showToast(isActive ? 'حُفظ التدفق، والتعديلات تعمل الآن.' : 'حُفظ التدفق كمسودة.', 'success');
  };

  const toggleActive = async () => {
    if (!isActive && errors.length) {
      setIssuesOpen(true);
      showToast(`أصلح ${errors.length === 1 ? 'المشكلة' : `${errors.length} مشاكل`} قبل التفعيل.`, 'error');
      return;
    }
    if (await persist({ isActive: !isActive })) showToast(isActive ? 'أُوقف التدفق.' : 'فُعّل التدفق وسيبدأ مع العملاء حسب المحفّز.', 'success');
  };

  const saveRef = useRef(save);
  saveRef.current = save;
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 's') { event.preventDefault(); void saveRef.current(); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const goBack = () => {
    if (dirty && !window.confirm('لديك تعديلات غير محفوظة. الخروج بدون حفظ؟')) return;
    navigate('/dashboard/flows');
  };

  if (loading) {
    return <div className="grid h-full place-items-center bg-labbaik-page"><Loader2 className="animate-spin text-labbaik-blue" size={32} /></div>;
  }

  const issueSummary = !checked
    ? { label: 'جاري الفحص', tone: 'text-labbaik-text-muted', icon: <Loader2 size={14} className="animate-spin" /> }
    : errors.length
      ? { label: `${errors.length} ${errors.length === 1 ? 'مشكلة' : errors.length <= 10 ? 'مشاكل' : 'مشكلة'}`, tone: 'bg-red-500/10 text-red-700 dark:text-red-300', icon: <AlertTriangle size={14} /> }
      : { label: warnings.length ? `جاهز · ${warnings.length} تنبيه` : 'جاهز للتشغيل', tone: warnings.length ? 'bg-amber-500/12 text-amber-800 dark:text-amber-200' : 'bg-emerald-500/12 text-emerald-800 dark:text-emerald-300', icon: <CheckCircle2 size={14} /> };

  return (
    <div className="flex h-full flex-col bg-labbaik-page" dir="rtl">
      {/* Top bar */}
      <header className="flex flex-wrap items-center gap-2 border-b border-labbaik-border bg-labbaik-surface px-3 py-2 sm:px-4">
        <button type="button" onClick={goBack} aria-label="العودة للتدفقات" className="grid h-9 w-9 place-items-center rounded-lg text-labbaik-text-muted hover:bg-labbaik-page hover:text-labbaik-text cursor-pointer"><ArrowRight size={18} /></button>
        <input
          value={name}
          onChange={(e) => { setName(e.target.value); setDirty(true); }}
          aria-label="اسم التدفق"
          className="h-9 min-w-0 flex-1 basis-40 rounded-lg border-transparent! bg-transparent px-2 text-base font-black text-neutral-900 hover:border-[color:var(--color-input-border)]! focus:border-[color:var(--color-input-border)]! focus:outline-none dark:text-white sm:max-w-80"
        />

        <div className="relative">
          <button type="button" onClick={() => setIssuesOpen((open) => !open)} aria-expanded={issuesOpen} className={`inline-flex h-8 items-center gap-1.5 rounded-full px-3 text-xs font-bold cursor-pointer ${issueSummary.tone}`}>
            {issueSummary.icon} {issueSummary.label}
          </button>
          {issuesOpen && issues.length > 0 && (
            <div className="absolute top-10 right-0 z-30 w-80 max-w-[calc(100vw-2rem)] rounded-xl border border-labbaik-border bg-labbaik-surface p-1.5 shadow-[0_16px_40px_-12px_rgba(15,10,30,0.35)]">
              <ul className="max-h-80 overflow-y-auto custom-scrollbar">
                {issues.map((issue, index) => {
                  const node = nodes.find((item) => item.id === issue.nodeId);
                  return (
                    <li key={index}>
                      <button
                        type="button"
                        onClick={() => { if (issue.nodeId) { selectNode(issue.nodeId); focusNode(issue.nodeId); } setIssuesOpen(false); }}
                        className="flex w-full gap-2 rounded-lg px-2.5 py-2 text-start hover:bg-labbaik-page cursor-pointer"
                      >
                        <span className={`mt-1 h-2 w-2 shrink-0 rounded-full ${issue.level === 'error' ? 'bg-red-600' : 'bg-amber-500'}`} />
                        <span className="min-w-0">
                          {node && <span className="block text-[11px] font-bold text-labbaik-text-muted">{NODE_KINDS[node.type as FlowNodeType]?.label}</span>}
                          <span className="block text-xs leading-relaxed text-labbaik-text">{issue.message}</span>
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            </div>
          )}
        </div>

        <div className="ms-auto flex items-center gap-2">
          <button type="button" onClick={() => { setPanel(panel === 'test' ? null : 'test'); setIssuesOpen(false); }} aria-pressed={panel === 'test'} className={`inline-flex h-9 items-center gap-1.5 rounded-lg border px-3 text-sm font-bold cursor-pointer ${panel === 'test' ? 'border-labbaik-blue bg-labbaik-blue/10 text-labbaik-blue dark:text-purple-200' : 'border-labbaik-border text-labbaik-text hover:border-labbaik-blue/40'}`}>
            <FlaskConical size={15} /> تجربة
          </button>
          <span className="mx-0.5 hidden h-6 w-px bg-labbaik-border sm:block" />
          <button
            type="button"
            role="switch"
            aria-checked={isActive}
            disabled={saving}
            onClick={() => void toggleActive()}
            className="inline-flex h-9 items-center gap-2 rounded-lg px-2 text-sm font-bold text-labbaik-text hover:bg-labbaik-page disabled:opacity-50 cursor-pointer"
          >
            <span className={`relative h-5 w-9 rounded-full transition-colors ${isActive ? 'bg-emerald-600' : 'bg-neutral-300 dark:bg-neutral-600'}`}>
              <span className={`absolute top-0.5 h-4 w-4 rounded-full bg-white shadow-sm transition-all ${isActive ? 'right-0.5' : 'right-[18px]'}`} />
            </span>
            {isActive ? 'مفعّل' : 'مسودة'}
          </button>
          <button type="button" onClick={() => void save()} disabled={saving || !dirty} title="Ctrl+S" className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-labbaik-blue px-4 text-sm font-black text-labbaik-on-accent hover:bg-[#553174] disabled:opacity-50 cursor-pointer disabled:cursor-default">
            {saving ? <Loader2 size={15} className="animate-spin" /> : <Save size={15} />} {dirty ? 'حفظ' : 'محفوظ'}
          </button>
        </div>
      </header>

      <div className="relative flex min-h-0 flex-1 flex-col lg:flex-row">
        {/* Palette */}
        <aside className="flex shrink-0 gap-1 overflow-x-auto border-b border-labbaik-border bg-labbaik-surface p-2 lg:w-52 lg:flex-col lg:gap-0 lg:overflow-y-auto lg:border-b-0 lg:border-l lg:p-3 custom-scrollbar">
          {PALETTE.map((group) => (
            <div key={group.title} className="flex gap-1 lg:mb-4 lg:block lg:space-y-1">
              <p className="hidden px-2 pb-1 text-[11px] font-bold text-labbaik-text-muted lg:block">{group.title}</p>
              {group.types.map((type) => {
                const kind = NODE_KINDS[type];
                const Icon = kind.icon;
                return (
                  <button
                    key={type}
                    type="button"
                    draggable
                    onDragStart={(event) => { event.dataTransfer.setData(DRAG_TYPE, type); event.dataTransfer.effectAllowed = 'move'; }}
                    onClick={() => addNode(type)}
                    title={`${kind.label}: ${kind.hint}`}
                    className="flex shrink-0 items-center gap-2.5 rounded-lg px-2 py-1.5 text-start hover:bg-labbaik-page cursor-grab active:cursor-grabbing lg:w-full"
                  >
                    <span className={`grid h-7 w-7 shrink-0 place-items-center rounded-md ${kind.tone}`}><Icon size={14} /></span>
                    <span className="min-w-0">
                      <span className="block whitespace-nowrap text-[13px] font-bold text-labbaik-text">{kind.label}</span>
                      <span className="hidden truncate text-[11px] text-labbaik-text-muted lg:block">{kind.hint}</span>
                    </span>
                  </button>
                );
              })}
            </div>
          ))}
          <p className="mt-auto hidden rounded-lg bg-labbaik-page p-2.5 text-[11px] leading-relaxed text-labbaik-text-muted lg:block">
            اسحب خطوة إلى الكانفس، أو اختر خطوة ثم اضغط نوعًا هنا لإضافته بعدها مباشرة.
          </p>
        </aside>

        {/* Canvas */}
        <div ref={canvasRef} className="relative min-h-0 flex-1" dir="ltr" onDragOver={(event) => { event.preventDefault(); event.dataTransfer.dropEffect = 'move'; }} onDrop={onDrop}>
          <ReactFlow<FlowNode, FlowEdge>
            nodes={displayNodes}
            edges={edges}
            nodeTypes={nodeTypes}
            edgeTypes={edgeTypes}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            onConnect={onConnect}
            isValidConnection={isValidConnection}
            onNodeClick={(_, node) => selectNode(node.id)}
            onPaneClick={() => { setSelectedId(null); setIssuesOpen(false); if (panel === 'settings') setPanel(null); }}
            deleteKeyCode={['Backspace', 'Delete']}
            colorMode={theme === 'dark' ? 'dark' : 'light'}
            defaultEdgeOptions={edgeDefaults}
            fitView
            fitViewOptions={{ padding: 0.2, maxZoom: 1 }}
            minZoom={0.25}
            maxZoom={1.75}
            proOptions={{ hideAttribution: true }}
            className="bg-labbaik-page!"
          >
            <Background variant={BackgroundVariant.Dots} gap={22} size={1.4} color="var(--color-input-border)" />
            <Controls showInteractive={false} position="bottom-left" className="overflow-hidden! rounded-lg! border! border-labbaik-border! shadow-none!" />
            <MiniMap position="top-left" pannable zoomable style={{ width: 150, height: 96 }} className="hidden! rounded-lg! border! border-labbaik-border! md:block!" nodeColor={(node) => (node.type === 'start' ? '#059669' : '#643B89')} maskColor="rgba(100,59,137,0.06)" />
          </ReactFlow>
          <button type="button" onClick={arrange} className="absolute top-3 right-3 inline-flex h-8 items-center gap-1.5 rounded-lg border border-labbaik-border bg-labbaik-surface px-2.5 text-xs font-bold text-labbaik-text shadow-[0_1px_2px_rgba(15,10,30,0.06)] hover:border-labbaik-blue/40 cursor-pointer" dir="rtl">
            <LayoutGrid size={14} /> ترتيب تلقائي
          </button>
        </div>

        {/* Side panel */}
        {panel && (panel === 'test' || selectedNode) && (
          <aside className="absolute inset-x-0 bottom-0 z-20 h-[72%] rounded-t-2xl border-t border-labbaik-border bg-labbaik-surface shadow-[0_-12px_40px_-16px_rgba(15,10,30,0.35)] lg:static lg:h-auto lg:w-[380px] lg:rounded-none lg:border-t-0 lg:border-r lg:shadow-none">
            {panel === 'test'
              ? <FlowTester nodes={nodes} edges={edges} trigger={startNode?.data.trigger} onClose={() => setPanel(null)} onFocusNode={(nodeId) => { setNodes((current) => current.map((node) => ({ ...node, selected: node.id === nodeId }))); focusNode(nodeId); }} />
              : selectedNode && (
                <NodeSettings
                  key={selectedNode.id}
                  node={selectedNode}
                  onChange={(patch) => updateNodeData(selectedNode.id, patch)}
                  onDelete={() => deleteNode(selectedNode.id)}
                  onClose={() => { setPanel(null); setSelectedId(null); }}
                />
              )}
          </aside>
        )}
      </div>
    </div>
  );
}

export default function FlowEditorPage() {
  return (
    <ReactFlowProvider>
      <Editor />
    </ReactFlowProvider>
  );
}
