import { useState, useEffect, useCallback } from 'react';
import type { MouseEvent } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  ReactFlow,
  Controls,
  Background,
  useNodesState,
  useEdgesState,
  addEdge,
  Handle,
  Position,
  Panel
} from '@xyflow/react';
import type { Connection, Edge, Node, NodeProps } from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import api from '../api/client';
import { Button } from '../components/ui/Button';
import { 
  Save, 
  MessageSquare, 
  Zap, 
  Trash2, 
  Loader2,
  ChevronRight,
  Plus,
  Settings2,
  PlayCircle,
  Image as ImageIcon
} from 'lucide-react';
import { useToast } from '../components/Toast';

// --- CUSTOM NODES ---

type FlowNodeData = {
  text?: string;
  buttons?: { id: string; label: string }[];
  isStart?: boolean;
  imageUrl?: string;
};

type FlowNode = Node<FlowNodeData>;

const StartNode = (_props: NodeProps<FlowNode>) => (
  <div className="bg-labbaik-deep border-2 border-green-500/50 p-6 rounded-[2rem] shadow-[0_0_20px_rgba(34,197,94,0.2)] min-w-[180px] text-center relative overflow-hidden">
    <div className="absolute top-0 right-0 left-0 h-1 bg-green-500"></div>
    <div className="flex flex-col items-center gap-3">
      <div className="p-3 bg-green-500/20 rounded-2xl"><PlayCircle size={24} className="text-green-400" /></div>
      <span className="text-xs font-black text-white uppercase tracking-widest">نقطة الانطلاق</span>
      <p className="text-[10px] text-neutral-400 font-bold">هنا يبدأ لبيك الرد</p>
    </div>
    <Handle type="source" position={Position.Bottom} className="!bg-green-500 !w-4 !h-4 !border-labbaik-page shadow-lg" />
  </div>
);

const MessageNode = ({ data }: NodeProps<FlowNode>) => (
  <div className="bg-labbaik-surface border-2 border-white/5 p-6 rounded-[2rem] shadow-2xl min-w-[200px] group hover:border-labbaik-blue/50 transition-all">
    <Handle type="target" position={Position.Top} className="!bg-labbaik-blue !w-3 !h-3 !border-labbaik-page" />
    <div className="flex items-center gap-3 mb-4">
      <div className="p-2 bg-labbaik-blue/10 rounded-lg"><MessageSquare size={16} className="text-labbaik-blue" /></div>
      <span className="text-[10px] font-black text-white">رسالة نصية</span>
    </div>
    <div className="text-[11px] text-neutral-400 font-medium leading-relaxed">{data.text || 'اكتب نصاً...'}</div>
    <Handle type="source" position={Position.Bottom} className="!bg-labbaik-blue !w-3 !h-3 !border-labbaik-page" />
  </div>
);

const ButtonsNode = ({ data }: NodeProps<FlowNode>) => (
  <div className="bg-labbaik-surface border-2 border-labbaik-blue/30 p-6 rounded-[2rem] shadow-2xl min-w-[250px] group hover:border-labbaik-blue transition-all">
    <Handle type="target" position={Position.Top} className="!bg-labbaik-blue !w-3 !h-3" />
    <div className="flex items-center gap-3 mb-4">
      <div className="p-2 bg-labbaik-blue/20 rounded-lg"><Zap size={16} className="text-labbaik-blue" /></div>
      <span className="text-[10px] font-black text-white">خيارات (أزرار)</span>
    </div>
    {data.imageUrl && (
      <div className="mb-4 rounded-xl overflow-hidden border border-white/10 aspect-video bg-black/20">
        <img src={data.imageUrl} alt="Header" className="w-full h-full object-cover" />
      </div>
    )}
    <div className="text-[11px] text-gray-200 font-bold mb-4">{data.text}</div>
    <div className="space-y-2">
      {data.buttons?.map((btn) => (
        <div key={btn.id} className="relative bg-white/5 border border-white/10 p-3 rounded-xl text-[9px] font-black text-neutral-400 text-center flex items-center justify-center">
          {btn.label}
          <Handle type="source" position={Position.Right} id={btn.id} className="!bg-labbaik-blue !w-2 !h-2 !-right-2" />
        </div>
      ))}
    </div>
  </div>
);

const nodeTypes = {
  start: StartNode,
  message: MessageNode,
  buttons: ButtonsNode,
};

export default function FlowEditorPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { showToast } = useToast();
  const [nodes, setNodes, onNodesChange] = useNodesState<FlowNode>([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([]);
  const [flowName, setFlowName] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [selectedNode, setSelectedNode] = useState<FlowNode | null>(null);

  useEffect(() => {
    fetchFlow();
  }, [id]);

  const fetchFlow = async () => {
    try {
      const { data } = await api.get(`/flows/${id}`);
      setFlowName(data.name);
      setNodes(data.nodes || []);
      setEdges(data.edges || []);
      setLoading(false);
    } catch {
      navigate('/dashboard/flows');
    }
  };

  const onConnect = useCallback((params: Connection) => setEdges((eds) => addEdge({ ...params, animated: true, style: { stroke: '#643B89' } }, eds)), [setEdges]);

  const handleSave = async () => {
    setSaving(true);
    try {
      await api.patch(`/flows/${id}`, { name: flowName, nodes, edges });
      showToast('تم حفظ التدفق بنجاح! ✅', 'success');
    } catch {
      showToast('فشل الحفظ ❌', 'error');
    } finally {
      setSaving(false);
    }
  };

  const addNode = (type: string) => {
    if (type === 'start' && nodes.some(n => n.type === 'start')) {
      showToast('يمكنك إضافة نقطة بداية واحدة فقط لكل تدفق.', 'error');
      return;
    }
    const newNode: FlowNode = {
      id: `${type}-${Date.now()}`,
      type,
      position: { x: 250, y: 150 },
      data: { 
        text: type === 'message' ? 'مرحباً بك!' : 'اختر أحد الخيارات:',
        buttons: type === 'buttons' ? [{ id: `btn-${Date.now()}`, label: 'خيار 1' }] : [],
        isStart: type === 'start'
      },
    };
    setNodes((nds) => nds.concat(newNode));
  };

  const onNodeClick = (_: MouseEvent, node: FlowNode) => setSelectedNode(node);

  const updateNodeData = <K extends keyof FlowNodeData>(field: K, value: FlowNodeData[K]) => {
    if (!selectedNode) return;
    setNodes((nds) => nds.map((node) => node.id === selectedNode.id ? { ...node, data: { ...node.data, [field]: value } } : node));
    setSelectedNode({ ...selectedNode, data: { ...selectedNode.data, [field]: value } });
  };

  if (loading) return <div className="h-screen flex flex-col items-center justify-center bg-labbaik-page"><Loader2 className="animate-spin text-labbaik-blue" size={48} /></div>;

  return (
    <div className="h-[calc(100vh-100px)] flex flex-col -m-10" dir="rtl">
      <div className="h-20 bg-labbaik-surface border-b border-white/5 flex items-center justify-between px-10 z-50 shadow-2xl">
        <div className="flex items-center gap-6">
          <Button onClick={() => navigate('/dashboard/flows')} variant="ghost" size="md"><ChevronRight size={24} /></Button>
          <input type="text" value={flowName} onChange={(e) => setFlowName(e.target.value)} className="bg-transparent border-none text-xl font-black text-white focus:outline-none w-64"/>
        </div>
        <Button onClick={handleSave} disabled={saving} variant="primary" size="md">
          {saving ? <Loader2 className="animate-spin" size={18} /> : <Save size={18} />} حفظ المسار
        </Button>
      </div>

      <div className="flex-1 flex overflow-hidden relative">
        <div className="flex-1 bg-black/20">
          <ReactFlow nodes={nodes} edges={edges} onNodesChange={onNodesChange} onEdgesChange={onEdgesChange} onConnect={onConnect} nodeTypes={nodeTypes} onNodeClick={onNodeClick} fitView>
            <Background color="rgba(255,255,255,0.05)" gap={20} /><Controls />
            <Panel position="top-right" className="flex gap-3 bg-labbaik-surface p-2 rounded-2xl border border-white/5 shadow-2xl">
              <Button onClick={() => addNode('start')} variant="success" size="sm" className="flex items-center gap-2"><PlayCircle size={14} /> نقطة البداية</Button>
              <Button onClick={() => addNode('message')} variant="secondary" size="sm" className="flex items-center gap-2"><MessageSquare size={14} /> رسالة نصية</Button>
              <Button onClick={() => addNode('buttons')} variant="secondary" size="sm" className="flex items-center gap-2"><Zap size={14} /> أزرار</Button>
            </Panel>
          </ReactFlow>
        </div>

        {selectedNode && (
          <div className="w-96 bg-labbaik-surface border-r border-white/5 p-8 overflow-y-auto animate-fade-in shadow-2xl z-40">
            <div className="flex justify-between items-center mb-10"><h3 className="font-black text-white flex items-center gap-3"><Settings2 size={20} className="text-labbaik-blue" /> إعدادات العقدة</h3><Button onClick={() => { setNodes(nds => nds.filter(n => n.id !== selectedNode.id)); setSelectedNode(null); }} variant="danger" size="md"><Trash2 size={16} /></Button></div>
            <div className="space-y-8">
              {selectedNode.type !== 'start' && (
                <div className="space-y-3">
                  <label className="text-[10px] font-black text-neutral-400 uppercase tracking-widest px-1">نص الرسالة</label>
                  <textarea value={selectedNode.data.text} onChange={(e) => updateNodeData('text', e.target.value)} className="w-full h-32 bg-white/2 border border-white/5 rounded-2xl p-4 text-sm text-gray-200 focus:outline-none focus:ring-1 focus:ring-labbaik-blue/50 font-medium resize-none leading-relaxed"/>
                </div>
              )}
              {selectedNode.type === 'buttons' && (
                <div className="space-y-8">
                  <div className="space-y-3">
                    <label className="text-[10px] font-black text-neutral-400 uppercase tracking-widest px-1 flex items-center gap-2"><ImageIcon size={14} className="text-labbaik-blue" /> صورة الترويسة (Header)</label>
                    <input 
                      type="text" 
                      placeholder="ضع رابط الصورة هنا (URL)..."
                      value={selectedNode.data.imageUrl || ''}
                      onChange={(e) => updateNodeData('imageUrl', e.target.value)}
                      className="w-full bg-white/2 border border-white/5 rounded-xl px-4 py-3 text-xs text-white focus:outline-none font-bold"
                    />
                    <p className="text-[8px] text-neutral-500 font-bold px-1">سيتم عرض هذه الصورة فوق الأزرار في الواتساب.</p>
                  </div>

                  <div className="space-y-4">
                    <label className="text-[10px] font-black text-neutral-400 uppercase tracking-widest px-1">الخيارات المتاحة</label>
                    <div className="space-y-3">
                      {selectedNode.data.buttons?.map((btn, index) => (
                        <div key={btn.id} className="flex gap-2"><input type="text" value={btn.label} onChange={(e) => { const newBtns = [...(selectedNode.data.buttons || [])]; newBtns[index].label = e.target.value; updateNodeData('buttons', newBtns); }} className="flex-1 bg-white/2 border border-white/5 rounded-xl px-4 py-3 text-xs text-white focus:outline-none font-bold"/><Button onClick={() => { const newBtns = (selectedNode.data.buttons || []).filter((b) => b.id !== btn.id); updateNodeData('buttons', newBtns); }} variant="danger" size="md"><Trash2 size={14} /></Button></div>
                      ))}
                      <Button onClick={() => { const newBtns = [...(selectedNode.data.buttons || []), { id: `btn-${Date.now()}`, label: 'خيار جديد' }]; updateNodeData('buttons', newBtns); }} variant="secondary" size="sm" className="w-full"><Plus size={12} /> إضافة زر جديد</Button>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}


