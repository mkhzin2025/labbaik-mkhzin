import { continueFlow, FlowGraph, keywordMatches, startFlow, validateFlow } from './flow-engine';

const welcome: FlowGraph = {
  nodes: [
    { id: 'start', type: 'start', data: { trigger: { type: 'new_conversation' } } },
    { id: 'hello', type: 'message', data: { text: 'أهلًا {{name}}' } },
    { id: 'menu', type: 'buttons', data: { text: 'كيف نخدمك؟', buttons: [{ id: 'b1', label: 'العروض' }, { id: 'b2', label: 'موظف' }] } },
    { id: 'offers', type: 'message', data: { text: 'عروضنا', media: { file: 'x.pdf', type: 'document', mimeType: 'application/pdf', filename: 'offers.pdf' } } },
    { id: 'agent', type: 'handoff', data: { text: 'سيتواصل معك موظف' } },
    { id: 'end', type: 'end', data: {} },
  ],
  edges: [
    { source: 'start', target: 'hello' },
    { source: 'hello', target: 'menu' },
    { source: 'menu', sourceHandle: 'b1', target: 'offers' },
    { source: 'menu', sourceHandle: 'b2', target: 'agent' },
    { source: 'offers', target: 'end' },
  ],
};

const ids = (step: { send: { id: string }[] }) => step.send.map((node) => node.id);

describe('flow engine', () => {
  it('sends every message up to the first question and waits there', () => {
    const step = startFlow(welcome);
    expect(ids(step)).toEqual(['hello', 'menu']);
    expect(step.state).toEqual({ nodeId: 'menu', invalidReplies: 0 });
  });

  it('follows the option picked by reply id, label, or number', () => {
    const state = { nodeId: 'menu', invalidReplies: 0 };
    expect(ids(continueFlow(welcome, state, 'anything', 'b1'))).toEqual(['offers']);
    expect(ids(continueFlow(welcome, state, '  العروض '))).toEqual(['offers']);
    expect(ids(continueFlow(welcome, state, '٢'))).toEqual(['agent']);
  });

  it('finishes at an end node and hands off at a handoff node', () => {
    const offers = continueFlow(welcome, { nodeId: 'menu', invalidReplies: 0 }, 'العروض');
    expect(offers.state).toBeNull();
    expect(offers.handoff).toBe(false);
    const agent = continueFlow(welcome, { nodeId: 'menu', invalidReplies: 0 }, 'موظف');
    expect(agent.handoff).toBe(true);
    expect(ids(agent)).toEqual(['agent']);
  });

  it('repeats the question on an unknown reply, then lets the conversation go', () => {
    const first = continueFlow(welcome, { nodeId: 'menu', invalidReplies: 0 }, 'مرحبا');
    expect(ids(first)).toEqual(['menu']);
    expect(first.state).toEqual({ nodeId: 'menu', invalidReplies: 1 });
    const second = continueFlow(welcome, first.state!, 'مرحبا');
    expect(second.released).toBe(true);
    expect(second.send).toEqual([]);
  });

  it('takes the fallback output when one is connected', () => {
    const graph: FlowGraph = { ...welcome, edges: [...welcome.edges, { source: 'menu', sourceHandle: 'fallback', target: 'agent' }] };
    expect(ids(continueFlow(graph, { nodeId: 'menu', invalidReplies: 0 }, 'غير ذلك'))).toEqual(['agent']);
  });

  it('stops on cycles of nodes that never wait', () => {
    const loop: FlowGraph = {
      nodes: [
        { id: 'start', type: 'start', data: {} },
        { id: 'a', type: 'message', data: { text: 'a' } },
        { id: 'b', type: 'message', data: { text: 'b' } },
      ],
      edges: [{ source: 'start', target: 'a' }, { source: 'a', target: 'b' }, { source: 'b', target: 'a' }],
    };
    expect(startFlow(loop).send.length).toBeLessThan(20);
  });

  it('matches keywords ignoring Arabic letter variants', () => {
    expect(keywordMatches({ type: 'keyword', match: 'exact', keywords: ['اكتشف العروض'] }, 'إكتشف  العروض')).toBe(true);
    expect(keywordMatches({ type: 'keyword', match: 'contains', keywords: ['عرض'] }, 'ابي عرض اليوم')).toBe(true);
    expect(keywordMatches({ type: 'keyword', match: 'exact', keywords: ['عرض'] }, 'ابي عرض اليوم')).toBe(false);
  });

  it('accepts a complete flow and reports the problems of a broken one', () => {
    expect(validateFlow(welcome).filter((issue) => issue.level === 'error')).toEqual([]);

    const broken: FlowGraph = {
      nodes: [
        { id: 'start', type: 'start', data: { trigger: { type: 'keyword', keywords: [] } } },
        { id: 'menu', type: 'buttons', data: { text: '', buttons: [1, 2, 3, 4].map((n) => ({ id: `b${n}`, label: `خيار ${n}` })) } },
        { id: 'link', type: 'link', data: { text: 'زورنا', buttonText: 'المتجر', url: 'http://insecure' } },
      ],
      edges: [{ source: 'start', target: 'menu' }],
    };
    const errors = validateFlow(broken).filter((issue) => issue.level === 'error');
    expect(errors.map((issue) => issue.nodeId)).toEqual(expect.arrayContaining(['start', 'menu', 'link']));
    expect(validateFlow(broken).some((issue) => issue.level === 'warning' && issue.nodeId === 'link')).toBe(true);
  });
});
