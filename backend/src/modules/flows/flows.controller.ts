import { BadRequestException, Controller, Get, Post, Patch, Delete, Body, Param, UseGuards, Request, Res, UploadedFile, UseInterceptors, NotFoundException } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBearerAuth, ApiBody, ApiNotFoundResponse, ApiOperation, ApiParam, ApiResponse, ApiTags, ApiUnauthorizedResponse } from '@nestjs/swagger';
import { existsSync, createReadStream } from 'fs';
import { basename, extname } from 'path';
import { FlowsService } from './flows.service';
import type { UploadedFlowFile } from './flows.service';
import { continueFlow, keywordMatches, startFlow, triggerOf } from './flow-engine';
import type { FlowState } from './flow-engine';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { OrganizationsService } from '../organizations/organizations.service';
import { examples, ids } from '../../common/swagger/api-examples';
import { Access } from '../organizations/access';

@ApiTags('Flows')
@ApiBearerAuth()
@Access('flows')
@Controller('flows')
@UseGuards(JwtAuthGuard)
export class FlowsController {
  constructor(
    private readonly flowsService: FlowsService,
    private readonly organizationsService: OrganizationsService,
  ) {}

  @Get()
  @ApiOperation({ summary: 'List automation flows for the authenticated store' })
  @ApiResponse({ status: 200, description: 'Store flows.', schema: { example: [examples.flow.item] } })
  @ApiUnauthorizedResponse({ schema: { example: examples.errors.unauthorized } })
  @ApiNotFoundResponse({ schema: { example: examples.errors.storeNotFound } })
  async findAll(@Request() req) {
    const { store } = await this.organizationsService.getStoreForUser(req.user.id, req.user.organizationId);
    return this.flowsService.findAllByStore(store.id, store.organizationId);
  }

  @Post('validate')
  @ApiOperation({ summary: 'Check a flow graph for problems before saving or activating it' })
  validate(@Body() graph: any) {
    return this.flowsService.validate(graph);
  }

  /** Runs one turn of an unsaved flow with the same engine the webhook uses, for the editor's test chat. */
  @Post('simulate')
  @ApiOperation({ summary: 'Simulate one customer turn through a flow graph' })
  simulate(@Body() body: { nodes?: any[]; edges?: any[]; state?: FlowState | null; input?: string; replyId?: string }) {
    const graph = { nodes: Array.isArray(body?.nodes) ? body.nodes : [], edges: Array.isArray(body?.edges) ? body.edges : [] };
    const input = String(body?.input || '');
    if (body?.state?.nodeId) {
      return { triggered: true, ...continueFlow(graph, { nodeId: body.state.nodeId, invalidReplies: Number(body.state.invalidReplies) || 0 }, input, body.replyId) };
    }
    const trigger = triggerOf(graph);
    if (trigger.type === 'keyword' && !keywordMatches(trigger, input)) {
      return { triggered: false, send: [], state: null, handoff: false, released: false };
    }
    return { triggered: true, ...startFlow(graph) };
  }

  /** Stores a file to send from a flow message; it is uploaded to Meta when a customer reaches the node. */
  @Post('media')
  @ApiOperation({ summary: 'Upload an image, video, audio or document for a flow message' })
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: 16 * 1024 * 1024 } }))
  uploadMedia(@UploadedFile() file: UploadedFlowFile) {
    return this.flowsService.storeMedia(file);
  }

  @Get('media/:filename')
  @Access('flows', 'conversations')
  getMedia(@Param('filename') filename: string, @Res() res: any) {
    if (filename !== basename(filename)) throw new BadRequestException('Invalid filename');
    const path = this.flowsService.mediaPath(filename);
    if (!existsSync(path)) throw new NotFoundException('File not found');
    res.type(extname(filename));
    res.setHeader('Cache-Control', 'private, max-age=86400');
    return createReadStream(path).pipe(res);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get one automation flow by id' })
  @ApiParam({ name: 'id', example: ids.flow })
  @ApiResponse({ status: 200, description: 'Flow found.', schema: { example: examples.flow.item } })
  @ApiUnauthorizedResponse({ schema: { example: examples.errors.unauthorized } })
  @ApiNotFoundResponse({ schema: { example: { message: 'Flow not found', error: 'Not Found', statusCode: 404 } } })
  async findOne(@Param('id') id: string, @Request() req) {
    const { store } = await this.organizationsService.getStoreForUser(req.user.id, req.user.organizationId);
    return this.flowsService.findOne(id, store.id, store.organizationId);
  }

  @Post()
  @ApiOperation({ summary: 'Create an automation flow' })
  @ApiBody({ schema: { type: 'object' }, examples: { default: { value: examples.flow.create } } })
  @ApiResponse({ status: 201, description: 'Flow created.', schema: { example: examples.flow.item } })
  @ApiUnauthorizedResponse({ schema: { example: examples.errors.unauthorized } })
  @ApiNotFoundResponse({ schema: { example: examples.errors.storeNotFound } })
  async create(@Body() data: any, @Request() req) {
    const { store } = await this.organizationsService.getStoreForUser(req.user.id, req.user.organizationId);
    return this.flowsService.create(store, data);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update an automation flow' })
  @ApiParam({ name: 'id', example: ids.flow })
  @ApiBody({ schema: { type: 'object' }, examples: { default: { value: examples.flow.update } } })
  @ApiResponse({ status: 200, description: 'Flow updated.', schema: { example: { ...examples.flow.item, ...examples.flow.update } } })
  @ApiUnauthorizedResponse({ schema: { example: examples.errors.unauthorized } })
  @ApiNotFoundResponse({ schema: { example: { message: 'Flow not found', error: 'Not Found', statusCode: 404 } } })
  async update(@Param('id') id: string, @Body() data: any, @Request() req) {
    const { store } = await this.organizationsService.getStoreForUser(req.user.id, req.user.organizationId);
    return this.flowsService.update(id, store.id, data, store.organizationId);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Delete an automation flow' })
  @ApiParam({ name: 'id', example: ids.flow })
  @ApiResponse({ status: 200, description: 'Deleted flow.', schema: { example: examples.flow.item } })
  @ApiUnauthorizedResponse({ schema: { example: examples.errors.unauthorized } })
  @ApiNotFoundResponse({ schema: { example: { message: 'Flow not found', error: 'Not Found', statusCode: 404 } } })
  async delete(@Param('id') id: string, @Request() req) {
    const { store } = await this.organizationsService.getStoreForUser(req.user.id, req.user.organizationId);
    return this.flowsService.delete(id, store.id, store.organizationId);
  }
}
