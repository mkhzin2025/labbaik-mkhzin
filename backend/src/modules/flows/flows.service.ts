import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Flow } from './entities/flow.entity';
import { Store } from '../stores/entities/store.entity';

@Injectable()
export class FlowsService {
  constructor(
    @InjectRepository(Flow)
    private readonly flowRepository: Repository<Flow>,
  ) {}

  async findAllByStore(storeId: string) {
    return this.flowRepository.find({
      where: { store: { id: storeId } },
      order: { updatedAt: 'DESC' }
    });
  }

  async findOne(id: string, storeId: string) {
    const flow = await this.flowRepository.findOne({
      where: { id, store: { id: storeId } }
    });
    if (!flow) throw new NotFoundException('Flow not found');
    return flow;
  }

  async findDefault(storeId: string) {
    return this.flowRepository.createQueryBuilder('flow')
      .where('flow.storeId = :storeId', { storeId })
      .andWhere('flow.isDefault = :isDefault', { isDefault: true })
      .andWhere('flow.isActive = :isActive', { isActive: true })
      .getOne();
  }

  async create(store: Store, data: any) {
    const flow = this.flowRepository.create({
      ...data,
      store
    });
    return this.flowRepository.save(flow);
  }

  async update(id: string, storeId: string, data: any) {
    const flow = await this.findOne(id, storeId);
    if (data.isDefault === true) {
      // Unset other defaults for this store specifically
      await this.flowRepository.createQueryBuilder()
        .update(Flow)
        .set({ isDefault: false })
        .where('storeId = :storeId', { storeId })
        .execute();
    }
    Object.assign(flow, data);
    return this.flowRepository.save(flow);
  }

  async delete(id: string, storeId: string) {
    const flow = await this.findOne(id, storeId);
    return this.flowRepository.remove(flow);
  }

  // FLOW EXECUTION LOGIC
  getNextNode(flow: Flow, currentNodeId: string, input: string) {
    const currentNode = flow.nodes.find(n => n.id === currentNodeId);
    if (!currentNode) return null;

    // Check edges where source is current node
    // And handle matches (e.g. button text matches input)
    const outgoingEdges = flow.edges.filter(e => e.source === currentNodeId);
    
    // For simplicity, we assume the edge's 'sourceHandle' or some metadata links to button choice
    // In a more advanced version, we'd map input to the correct edge.
    // Let's assume input matches the button label.
    const matchingEdge = outgoingEdges.find(e => {
      // If it's a direct connection from a Start Node or a simple Message Node, we might not have a buttonId
      if (!e.sourceHandle) return true; 

      const buttonId = e.sourceHandle; 
      const button = currentNode.data.buttons?.find(b => b.id === buttonId);
      return button && (button.label === input || button.value === input);
    });

    if (matchingEdge) {
      return flow.nodes.find(n => n.id === matchingEdge.target);
    }

    return null;
  }
}
