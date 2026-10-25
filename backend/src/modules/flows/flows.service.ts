import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { randomBytes } from 'crypto';
import { existsSync, mkdirSync, writeFileSync } from 'fs';
import { join } from 'path';
import { Flow } from './entities/flow.entity';
import { Store } from '../stores/entities/store.entity';
import {
  FlowGraph,
  FlowMedia,
  FlowTrigger,
  hasErrors,
  keywordMatches,
  startNodeOf,
  triggerOf,
  validateFlow,
} from './flow-engine';

/** Multer's in-memory file, typed locally because @types/multer is not installed. */
export type UploadedFlowFile = { buffer: Buffer; mimetype: string; originalname: string; size: number };

const MB = 1024 * 1024;

/** WhatsApp Cloud API supported media, with Meta's size limits. */
const MEDIA_TYPES: Record<string, { type: FlowMedia['type']; ext: string; max: number }> = {
  'image/jpeg': { type: 'image', ext: '.jpg', max: 5 * MB },
  'image/png': { type: 'image', ext: '.png', max: 5 * MB },
  'video/mp4': { type: 'video', ext: '.mp4', max: 16 * MB },
  'video/3gpp': { type: 'video', ext: '.3gp', max: 16 * MB },
  'audio/aac': { type: 'audio', ext: '.aac', max: 16 * MB },
  'audio/mp4': { type: 'audio', ext: '.m4a', max: 16 * MB },
  'audio/mpeg': { type: 'audio', ext: '.mp3', max: 16 * MB },
  'audio/amr': { type: 'audio', ext: '.amr', max: 16 * MB },
  'audio/ogg': { type: 'audio', ext: '.ogg', max: 16 * MB },
  'application/pdf': { type: 'document', ext: '.pdf', max: 16 * MB },
  'application/msword': { type: 'document', ext: '.doc', max: 16 * MB },
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': { type: 'document', ext: '.docx', max: 16 * MB },
  'application/vnd.ms-excel': { type: 'document', ext: '.xls', max: 16 * MB },
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': { type: 'document', ext: '.xlsx', max: 16 * MB },
  'application/vnd.ms-powerpoint': { type: 'document', ext: '.ppt', max: 16 * MB },
  'application/vnd.openxmlformats-officedocument.presentationml.presentation': { type: 'document', ext: '.pptx', max: 16 * MB },
  'text/plain': { type: 'document', ext: '.txt', max: 16 * MB },
};

const TRIGGER_LABELS: Record<string, string> = {
  new_conversation: 'مع كل محادثة جديدة',
  any_message: 'مع أي رسالة',
};

@Injectable()
export class FlowsService {
  constructor(
    @InjectRepository(Flow)
    private readonly flowRepository: Repository<Flow>,
    private readonly configService: ConfigService,
  ) {}

  /**
   * Flows saved before triggers existed only ran when marked default, so a legacy non-default flow is
   * reported as stopped instead of silently going live the first time it is saved with a trigger.
   */
  static isLive(flow: Flow) {
    if (!flow.isActive) return false;
    return Boolean(startNodeOf(flow)?.data?.trigger?.type) || flow.isDefault;
  }

  private present(flow: Flow) {
    return { ...flow, isActive: FlowsService.isLive(flow), trigger: triggerOf(flow) };
  }

  async findAllByStore(storeId: string) {
    const flows = await this.flowRepository.find({
      where: { store: { id: storeId } },
      order: { updatedAt: 'DESC' }
    });
    return flows.map((flow) => this.present(flow));
  }

  private async findEntity(id: string, storeId: string) {
    const flow = await this.flowRepository.findOne({
      where: { id, store: { id: storeId } }
    });
    if (!flow) throw new NotFoundException('Flow not found');
    return flow;
  }

  async findOne(id: string, storeId: string) {
    return this.present(await this.findEntity(id, storeId));
  }

  async create(store: Store, data: any) {
    const flow = this.flowRepository.create({
      name: String(data?.name || 'تدفق جديد').slice(0, 120),
      nodes: Array.isArray(data?.nodes) ? data.nodes : [],
      edges: Array.isArray(data?.edges) ? data.edges : [],
      // New flows start as drafts; they go live once they pass validation.
      isActive: false,
      isDefault: false,
      store,
    });
    return this.present(await this.flowRepository.save(flow));
  }

  async update(id: string, storeId: string, data: any) {
    const flow = await this.findEntity(id, storeId);
    if (typeof data?.name === 'string') flow.name = data.name.trim().slice(0, 120) || flow.name;
    if (Array.isArray(data?.nodes)) flow.nodes = data.nodes;
    if (Array.isArray(data?.edges)) flow.edges = data.edges;
    const wantsLive = typeof data?.isActive === 'boolean' ? data.isActive : FlowsService.isLive(flow);

    if (wantsLive) {
      await this.assertCanGoLive(flow, storeId);
      // A live flow always carries an explicit trigger, which retires the legacy isDefault switch.
      const start = startNodeOf(flow);
      if (start && !start.data?.trigger?.type) start.data = { ...start.data, trigger: triggerOf(flow) };
      flow.nodes = [...flow.nodes];
    }
    flow.isActive = wantsLive;
    return this.present(await this.flowRepository.save(flow));
  }

  async delete(id: string, storeId: string) {
    const flow = await this.findEntity(id, storeId);
    return this.flowRepository.remove(flow);
  }

  validate(graph: FlowGraph) {
    return validateFlow({ nodes: Array.isArray(graph?.nodes) ? graph.nodes : [], edges: Array.isArray(graph?.edges) ? graph.edges : [] });
  }

  private async assertCanGoLive(flow: Flow, storeId: string) {
    const issues = validateFlow(flow);
    if (hasErrors(issues)) {
      const count = issues.filter((issue) => issue.level === 'error').length;
      throw new BadRequestException(`لا يمكن تفعيل التدفق قبل إصلاح ${count === 1 ? 'مشكلة واحدة' : `${count} مشاكل`}: ${issues.find((issue) => issue.level === 'error')!.message}`);
    }
    const trigger = triggerOf(flow);
    if (trigger.type === 'keyword') return;
    const others = await this.flowRepository.find({ where: { store: { id: storeId }, isActive: true } });
    const clash = others.find((other) => other.id !== flow.id && FlowsService.isLive(other) && triggerOf(other).type === trigger.type);
    if (clash) {
      throw new BadRequestException(`التدفق «${clash.name}» مفعّل ويبدأ ${TRIGGER_LABELS[trigger.type]}. أوقفه أو غيّر محفّز أحدهما.`);
    }
  }

  /**
   * The flow a customer message should start: a keyword match wins, then the "new conversation" flow
   * (first message, or the first after a day of silence), then the "any message" flow.
   */
  async findTriggered(storeId: string, input: string, isNewConversation: boolean) {
    const flows = (await this.flowRepository.find({
      where: { store: { id: storeId }, isActive: true },
      order: { updatedAt: 'DESC' },
    })).filter((flow) => FlowsService.isLive(flow));
    const byType = (type: FlowTrigger['type']) => flows.filter((flow) => triggerOf(flow).type === type);

    const keyword = byType('keyword').find((flow) => keywordMatches(triggerOf(flow), input));
    if (keyword) return keyword;
    if (isNewConversation) {
      const welcome = byType('new_conversation');
      if (welcome.length) return welcome.find((flow) => flow.isDefault) || welcome[0];
    }
    return byType('any_message')[0] || null;
  }

  async findLive(id: string, storeId: string) {
    const flow = await this.flowRepository.findOne({ where: { id, store: { id: storeId } } });
    return flow && FlowsService.isLive(flow) ? flow : null;
  }

  // --- Media attached to flow messages ---

  storeMedia(file: UploadedFlowFile): FlowMedia & { file: string; size: number } {
    if (!file?.buffer?.length) throw new BadRequestException('اختر ملفًا لرفعه.');
    const spec = MEDIA_TYPES[file.mimetype];
    if (!spec) throw new BadRequestException('نوع الملف غير مدعوم في واتساب. المسموح: صور JPG/PNG، فيديو MP4، صوت MP3/AAC/OGG، ومستندات PDF/Word/Excel/PowerPoint.');
    if (file.buffer.length > spec.max) throw new BadRequestException(`حجم الملف أكبر من حد واتساب (${spec.max / MB} ميجابايت).`);

    const root = this.mediaRoot();
    if (!existsSync(root)) mkdirSync(root, { recursive: true });
    // The stored name's extension comes from the checked MIME type, never from the uploaded filename.
    const name = `${randomBytes(16).toString('hex')}${spec.ext}`;
    writeFileSync(join(root, name), file.buffer);
    // Multer decodes multipart filenames as latin1; recover Arabic names.
    const filename = Buffer.from(file.originalname || name, 'latin1').toString('utf8');
    return { file: name, type: spec.type, mimeType: file.mimetype, filename, size: file.buffer.length };
  }

  mediaPath(filename: string) {
    return join(this.mediaRoot(), filename);
  }

  private mediaRoot() {
    return join(this.configService.get<string>('UPLOADS_DIR') || join(process.cwd(), 'uploads'), 'flows');
  }
}
