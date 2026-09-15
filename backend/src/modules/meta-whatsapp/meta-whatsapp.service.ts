import { BadRequestException, Injectable, Logger, NotFoundException, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import axios from 'axios';
import { createHmac, randomBytes, timingSafeEqual } from 'crypto';
import {
  MetaConnectionMode,
  MetaConnectionScope,
  MetaConnectionStatus,
  MetaInboundRouting,
  MetaWhatsAppConnection,
} from './entities/meta-whatsapp-connection.entity';
import { WhatsAppTemplate } from './entities/whatsapp-template.entity';
import { SaveMetaWhatsAppConnectionDto, SendWhatsAppTemplateBulkDto, SendWhatsAppTemplateDto, UpdateMetaWhatsAppConnectionDto } from './dto/meta-whatsapp.dto';
import { OrganizationsService } from '../organizations/organizations.service';
import { CredentialEncryptionService } from '../channels/credential-encryption.service';
import { Channel, ChannelStatus, ChannelType } from '../channels/entities/channel.entity';
import { ConversationsService } from '../conversations/conversations.service';
import { CustomersService } from '../customers/customers.service';
import { EventsGateway } from '../events/events.gateway';
import { BillingService } from '../billing/billing.service';
import { Store } from '../stores/entities/store.entity';

@Injectable()
export class MetaWhatsAppService {
  private readonly logger = new Logger(MetaWhatsAppService.name);

  constructor(
    @InjectRepository(MetaWhatsAppConnection) private readonly connectionRepository: Repository<MetaWhatsAppConnection>,
    @InjectRepository(WhatsAppTemplate) private readonly templateRepository: Repository<WhatsAppTemplate>,
    @InjectRepository(Channel) private readonly channelRepository: Repository<Channel>,
    private readonly organizationsService: OrganizationsService,
    private readonly credentialEncryption: CredentialEncryptionService,
    private readonly configService: ConfigService,
    private readonly conversationsService: ConversationsService,
    private readonly customersService: CustomersService,
    private readonly eventsGateway: EventsGateway,
    private readonly billingService: BillingService,
  ) {}

  async listConnectionsForUser(userId: string, organizationId?: string) {
    const { organization } = await this.organizationsService.assertCanManageIntegrations(userId, organizationId);
    const rows = await this.connectionRepository.find({
      where: { organizationId: organization.id },
      relations: ['store', 'defaultStore'],
      order: { createdAt: 'ASC' },
    });
    return Promise.all(rows.map(async (row) => this.toPublicConnection(await this.getConnectionWithSecrets(row.id))));
  }

  async getForUser(userId: string, organizationId?: string, storeId?: string, scope: MetaConnectionScope = MetaConnectionScope.STORE, connectionId?: string) {
    const connection = await this.findForUser(userId, organizationId, { storeId, scope, connectionId, required: false });
    return connection ? this.toPublicConnection(await this.getConnectionWithSecrets(connection.id)) : null;
  }

  async saveForUser(userId: string, dto: SaveMetaWhatsAppConnectionDto | UpdateMetaWhatsAppConnectionDto, organizationId?: string) {
    const { organization } = await this.organizationsService.assertCanManageIntegrations(userId, organizationId);
    const requestedScope = dto.scope ?? MetaConnectionScope.STORE;
    let store: Store | null = null;
    let defaultStore: Store | null = null;

    if (requestedScope === MetaConnectionScope.STORE) {
      if (!dto.storeId) throw new BadRequestException('Branch is required when Meta scope is STORE');
      store = await this.organizationsService.assertStoreBelongsToOrganization(organization.id, dto.storeId);
      defaultStore = store;
    } else {
      const listed = await this.organizationsService.listStoresForUser(userId, organization.id);
      if (!listed.stores.length) throw new BadRequestException('Create at least one branch before configuring an organization WhatsApp number');
      if (dto.defaultStoreId) defaultStore = await this.organizationsService.assertStoreBelongsToOrganization(organization.id, dto.defaultStoreId);
      else defaultStore = listed.stores[0];
    }

    let connection = await this.findByScope(organization.id, requestedScope, store?.id || null);
    const requestedMode = dto.mode ?? connection?.mode ?? MetaConnectionMode.SHARED_APP;
    if (requestedMode === MetaConnectionMode.SHARED_APP) await this.billingService.assertMetaLabbaikReady(organization.id);
    const existingSecrets = connection ? await this.getConnectionWithSecrets(connection.id) : null;

    if (!connection) {
      const createDto = dto as SaveMetaWhatsAppConnectionDto;
      if (!createDto.wabaId || !createDto.phoneNumberId || !createDto.accessToken) throw new BadRequestException('WABA ID, Phone Number ID and Access Token are required');
      if ((createDto.mode || MetaConnectionMode.SHARED_APP) === MetaConnectionMode.OWN_APP && !createDto.appSecret) throw new BadRequestException('Meta App Secret is required when the tenant uses its own Meta App');
      const verifyToken = randomBytes(32).toString('base64url');
      connection = this.connectionRepository.create({
        organizationId: organization.id,
        scope: requestedScope,
        storeId: store?.id || null,
        defaultStoreId: defaultStore?.id || null,
        inboundRouting: dto.inboundRouting || MetaInboundRouting.LAST_CUSTOMER_STORE,
        mode: createDto.mode || MetaConnectionMode.SHARED_APP,
        appId: createDto.appId || null,
        appSecret: createDto.appSecret ? this.credentialEncryption.encryptSecret(createDto.appSecret)! : null,
        wabaId: createDto.wabaId,
        phoneNumberId: createDto.phoneNumberId,
        displayPhoneNumber: createDto.displayPhoneNumber || null,
        accessToken: this.credentialEncryption.encryptSecret(createDto.accessToken)!,
        verifyToken: this.credentialEncryption.encryptSecret(verifyToken)!,
        status: MetaConnectionStatus.DRAFT,
        lastError: null,
      });
      connection = await this.connectionRepository.save(connection);
    } else {
      const updateDto = dto as UpdateMetaWhatsAppConnectionDto;
      connection.scope = requestedScope;
      connection.storeId = store?.id || null;
      connection.defaultStoreId = defaultStore?.id || null;
      connection.inboundRouting = updateDto.inboundRouting ?? connection.inboundRouting;
      connection.mode = updateDto.mode ?? connection.mode;
      connection.appId = updateDto.appId ?? connection.appId;
      if (connection.mode === MetaConnectionMode.OWN_APP && !updateDto.appSecret && !existingSecrets?.appSecret) throw new BadRequestException('Meta App Secret is required when the tenant uses its own Meta App');
      if (updateDto.appSecret && updateDto.appSecret !== '********') connection.appSecret = this.credentialEncryption.encryptSecret(updateDto.appSecret)!;
      else if (!connection.appSecret && existingSecrets?.appSecret) connection.appSecret = existingSecrets.appSecret;
      connection.wabaId = updateDto.wabaId ?? connection.wabaId;
      connection.phoneNumberId = updateDto.phoneNumberId ?? connection.phoneNumberId;
      connection.displayPhoneNumber = updateDto.displayPhoneNumber ?? connection.displayPhoneNumber;
      if (updateDto.accessToken && updateDto.accessToken !== '********') connection.accessToken = this.credentialEncryption.encryptSecret(updateDto.accessToken)!;
      else if (existingSecrets?.accessToken) connection.accessToken = existingSecrets.accessToken;
      connection.lastError = null;
      connection = await this.connectionRepository.save(connection);
    }

    connection.webhookUrl = this.buildWebhookUrl(connection.id);
    connection = await this.connectionRepository.save(connection);
    await this.syncWhatsAppChannels(connection, userId);
    return this.toPublicConnection(await this.getConnectionWithSecrets(connection.id));
  }

  async testForUser(userId: string, organizationId?: string, options: { connectionId?: string; storeId?: string; scope?: MetaConnectionScope } = {}) {
    await this.organizationsService.assertCanManageIntegrations(userId, organizationId);
    const connection = await this.findForUser(userId, organizationId, { ...options, required: true }) as MetaWhatsAppConnection;
    const secretConnection = await this.getConnectionWithSecrets(connection.id);
    try {
      const token = this.credentialEncryption.decryptSecret(secretConnection.accessToken)!;
      const version = this.getGraphVersion();
      const { data } = await axios.get(`https://graph.facebook.com/${version}/${connection.wabaId}/phone_numbers`, {
        headers: { Authorization: `Bearer ${token}` },
        params: { fields: 'id,display_phone_number,verified_name,quality_rating,status' },
        timeout: 15000,
      });
      const phone = (data?.data || []).find((item: any) => String(item.id) === String(connection.phoneNumberId));
      if (!phone) throw new BadRequestException('Phone Number ID does not belong to the configured WABA or is not visible to this token');
      connection.displayPhoneNumber = phone.display_phone_number || connection.displayPhoneNumber;
      connection.status = MetaConnectionStatus.CONNECTED;
      connection.lastError = null;
      await this.connectionRepository.save(connection);
      await this.syncWhatsAppChannels(connection, userId);
      return { success: true, connectionId: connection.id, scope: connection.scope, storeId: connection.storeId, phoneNumber: phone };
    } catch (error: any) {
      const message = this.metaErrorMessage(error);
      connection.status = MetaConnectionStatus.ERROR;
      connection.lastError = message;
      await this.connectionRepository.save(connection);
      throw new BadRequestException(message);
    }
  }

  async subscribeWebhookForUser(userId: string, organizationId?: string, options: { connectionId?: string; storeId?: string; scope?: MetaConnectionScope } = {}) {
    await this.organizationsService.assertCanManageIntegrations(userId, organizationId);
    const connection = await this.findForUser(userId, organizationId, { ...options, required: true }) as MetaWhatsAppConnection;
    const secretConnection = await this.getConnectionWithSecrets(connection.id);
    const accessToken = this.credentialEncryption.decryptSecret(secretConnection.accessToken)!;
    const verifyToken = this.credentialEncryption.decryptSecret(secretConnection.verifyToken)!;
    const webhookUrl = connection.webhookUrl || this.buildWebhookUrl(connection.id);
    try {
      await axios.post(
        `https://graph.facebook.com/${this.getGraphVersion()}/${connection.wabaId}/subscribed_apps`,
        { override_callback_uri: webhookUrl, verify_token: verifyToken },
        { headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' }, timeout: 15000 },
      );
      connection.webhookUrl = webhookUrl;
      connection.webhookSubscribedAt = new Date();
      connection.status = MetaConnectionStatus.CONNECTED;
      connection.lastError = null;
      await this.connectionRepository.save(connection);
      return { success: true, connectionId: connection.id, scope: connection.scope, storeId: connection.storeId, webhookUrl, verifyToken };
    } catch (error: any) {
      const message = this.metaErrorMessage(error);
      connection.lastError = message;
      connection.status = MetaConnectionStatus.ERROR;
      await this.connectionRepository.save(connection);
      throw new BadRequestException(message);
    }
  }

  async syncTemplatesForUser(userId: string, organizationId?: string, options: { connectionId?: string; storeId?: string; scope?: MetaConnectionScope } = {}) {
    await this.organizationsService.assertCanManageIntegrations(userId, organizationId);
    const connection = await this.findForUser(userId, organizationId, { ...options, required: true }) as MetaWhatsAppConnection;
    const secretConnection = await this.getConnectionWithSecrets(connection.id);
    const accessToken = this.credentialEncryption.decryptSecret(secretConnection.accessToken)!;
    let url: string | null = `https://graph.facebook.com/${this.getGraphVersion()}/${connection.wabaId}/message_templates`;
    let params: any = { fields: 'id,name,status,category,language,components,quality_score', limit: 100 };
    const remoteTemplates: any[] = [];

    try {
      for (let page = 0; url && page < 20; page++) {
        const response = await axios.get(url, { headers: { Authorization: `Bearer ${accessToken}` }, params, timeout: 20000 });
        remoteTemplates.push(...(response.data?.data || []));
        url = response.data?.paging?.next || null;
        params = undefined;
      }
      const seen = new Set<string>();
      for (const remote of remoteTemplates) {
        const key = `${remote.name}::${remote.language}`;
        seen.add(key);
        let template = await this.templateRepository.findOne({ where: { connectionId: connection.id, name: remote.name, language: remote.language } });
        if (!template) template = this.templateRepository.create({ connectionId: connection.id, name: remote.name, language: remote.language });
        template.metaTemplateId = remote.id ? String(remote.id) : null;
        template.category = remote.category || null;
        template.status = remote.status || null;
        template.components = remote.components || [];
        template.qualityScore = remote.quality_score || null;
        await this.templateRepository.save(template);
      }
      const locals = await this.templateRepository.find({ where: { connectionId: connection.id } });
      const stale = locals.filter((item) => !seen.has(`${item.name}::${item.language}`));
      if (stale.length) await this.templateRepository.remove(stale);
      connection.templatesSyncedAt = new Date();
      connection.lastError = null;
      await this.connectionRepository.save(connection);
      return { synced: remoteTemplates.length, connectionId: connection.id, templates: await this.templateRepository.find({ where: { connectionId: connection.id }, order: { name: 'ASC', language: 'ASC' } }) };
    } catch (error: any) {
      const message = this.metaErrorMessage(error);
      connection.lastError = message;
      await this.connectionRepository.save(connection);
      throw new BadRequestException(message);
    }
  }

  async listTemplatesForUser(userId: string, organizationId?: string, options: { connectionId?: string; storeId?: string; scope?: MetaConnectionScope } = {}) {
    const connection = await this.findForUser(userId, organizationId, { ...options, required: true }) as MetaWhatsAppConnection;
    return this.templateRepository.find({ where: { connectionId: connection.id }, order: { name: 'ASC', language: 'ASC' } });
  }

  async sendTemplateForUser(userId: string, templateId: string, dto: SendWhatsAppTemplateDto, organizationId?: string) {
    const { connection, template, organization } = await this.getOwnedTemplate(userId, organizationId, templateId);
    const store = await this.resolveOutboundStore(userId, organization.id, connection, dto.storeId);
    if ((template.status || '').toUpperCase() !== 'APPROVED') throw new BadRequestException('Only APPROVED WhatsApp templates can be sent');
    return this.sendOneTemplate(store, connection, template, dto.to, dto);
  }

  async sendTemplateBulkForUser(userId: string, templateId: string, dto: SendWhatsAppTemplateBulkDto, organizationId?: string) {
    const { connection, template, organization } = await this.getOwnedTemplate(userId, organizationId, templateId);
    if ((template.status || '').toUpperCase() !== 'APPROVED') throw new BadRequestException('Only APPROVED WhatsApp templates can be sent');

    let customers: any[];
    if (connection.scope === MetaConnectionScope.STORE) {
      if (!connection.storeId) throw new BadRequestException('Store-scoped Meta connection is missing its branch');
      if (dto.storeId && dto.storeId !== connection.storeId) throw new BadRequestException('This WhatsApp number belongs to a different branch');
      await this.organizationsService.assertStoreAccessibleByUser(userId, organization.id, connection.storeId);
      customers = await this.customersService.getCustomersByIdsForStore(connection.storeId, dto.customerIds);
    } else {
      const selectedStoreIds = [...new Set((dto.storeIds?.length ? dto.storeIds : dto.storeId ? [dto.storeId] : []).filter(Boolean))] as string[];
      const access = await this.organizationsService.assertRequestedStoresAccessible(userId, organization.id, selectedStoreIds);
      if (!access.storeIds.length) throw new BadRequestException('No accessible branches are available for this send');
      customers = await this.customersService.getCustomersByIdsForOrganization(organization.id, dto.customerIds, access.storeIds);
    }

    const deduped = this.customersService.deduplicateWhatsAppCustomers(customers);
    const results: any[] = [];
    const queue = [...deduped.unique];
    const workers = Array.from({ length: Math.min(5, queue.length) }, async () => {
      while (queue.length) {
        const recipient = queue.shift();
        if (!recipient) return;
        const customer = recipient.customer;
        try {
          const store = await this.organizationsService.assertStoreBelongsToOrganization(organization.id, customer.storeId);
          const personalized = this.personalizeTemplateDto(dto, customer);
          const response = await this.sendOneTemplate(store, connection, template, recipient.phone, personalized);
          results.push({
            customerId: customer.id,
            duplicateCustomerIds: recipient.duplicateCustomerIds,
            storeIds: recipient.storeIds,
            phoneNumber: recipient.phone,
            success: true,
            whatsappMessageId: response?.message?.metadata?.whatsappMessageId,
          });
        } catch (error: any) {
          results.push({ customerId: customer.id, phoneNumber: recipient.phone, success: false, error: error?.message || 'Send failed' });
        }
      }
    });
    await Promise.all(workers);

    return {
      connectionId: connection.id,
      scope: connection.scope,
      sourceRecords: deduped.sourceRecords,
      duplicatesRemoved: deduped.duplicateRecords,
      total: deduped.uniqueRecipients,
      sent: results.filter((item) => item.success).length,
      failed: results.filter((item) => !item.success).length,
      results,
    };
  }

  private async sendOneTemplate(
    store: Store,
    connection: MetaWhatsAppConnection,
    template: WhatsAppTemplate,
    to: string,
    dto: Pick<SendWhatsAppTemplateDto, 'bodyParameters' | 'headerParameters' | 'components'>,
  ) {
    const secretConnection = await this.getConnectionWithSecrets(connection.id);
    const accessToken = this.credentialEncryption.decryptSecret(secretConnection.accessToken)!;
    const components = dto.components?.length ? dto.components : this.buildTemplateComponents(dto as SendWhatsAppTemplateDto);
    const normalizedTo = this.normalizePhone(to);
    if (!normalizedTo) throw new BadRequestException('Invalid WhatsApp phone number');

    const payload: any = {
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to: normalizedTo,
      type: 'template',
      template: { name: template.name, language: { code: template.language } },
    };
    if (components.length) payload.template.components = components;

    const walletCharge = await this.billingService.chargeMetaUsageForStore(
      store.id,
      this.billingService.getTemplateUsageType(template.category),
      { referenceId: template.id, templateName: template.name, category: template.category || null, metaConnectionId: connection.id },
    );

    try {
      const { data } = await axios.post(
        `https://graph.facebook.com/${this.getGraphVersion()}/${connection.phoneNumberId}/messages`,
        payload,
        { headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' }, timeout: 20000 },
      );
      const customer = await this.customersService.findOrCreate(store, normalizedTo, {
        fullName: `WhatsApp ${normalizedTo}`,
        phoneNumber: normalizedTo,
        whatsappId: normalizedTo,
      }, 'whatsapp');
      const messageData = {
        from: 'me',
        text: this.renderTemplatePreview(template, dto as SendWhatsAppTemplateDto),
        type: 'template',
        isManual: true,
        timestamp: Date.now(),
        customerId: customer.id,
        metadata: {
          whatsappMessageId: data?.messages?.[0]?.id,
          metaConnectionId: connection.id,
          templateId: template.id,
          templateName: template.name,
          templateLanguage: template.language,
          templateParameters: { body: dto.bodyParameters || [], header: dto.headerParameters || [] },
          status: 'accepted',
          walletTransactionId: walletCharge?.id || null,
        },
      };
      await this.conversationsService.addMessage(normalizedTo, store.id, 'whatsapp', messageData);
      this.eventsGateway.server.to(`store_${store.id}`).emit('new_message', { ...messageData, customerPhone: normalizedTo, platform: 'whatsapp', storeId: store.id });
      this.eventsGateway.server.to(`organization_${connection.organizationId}`).emit('organization_message', { ...messageData, customerPhone: normalizedTo, platform: 'whatsapp', storeId: store.id, organizationId: connection.organizationId });
      return { success: true, meta: data, message: messageData };
    } catch (error: any) {
      if (walletCharge) await this.billingService.refundMetaUsage(walletCharge.id, 'Meta template send failed');
      throw new BadRequestException(this.metaErrorMessage(error));
    }
  }

  private personalizeTemplateDto(dto: SendWhatsAppTemplateBulkDto, customer: any) {
    const replace = (value: string) => String(value || '')
      .replace(/\{\{customer\.fullName\}\}/g, customer.fullName || '')
      .replace(/\{\{customer\.phoneNumber\}\}/g, customer.phoneNumber || customer.whatsappId || '')
      .replace(/\{\{customer\.email\}\}/g, customer.email || '')
      .replace(/\{\{customer\.branchName\}\}/g, customer.store?.name || '');
    return {
      bodyParameters: (dto.bodyParameters || []).map(replace),
      headerParameters: (dto.headerParameters || []).map(replace),
      components: dto.components,
    };
  }

  async getWebhookConnection(connectionId: string) {
    return this.getConnectionWithSecrets(connectionId);
  }

  async verifyWebhook(connectionId: string, mode: string, token: string, challenge: string) {
    const connection = await this.getConnectionWithSecrets(connectionId);
    const expected = this.credentialEncryption.decryptSecret(connection.verifyToken);
    if (mode === 'subscribe' && expected && this.safeEqual(token || '', expected)) return challenge;
    throw new UnauthorizedException('Webhook verification failed');
  }

  verifyWebhookSignature(connection: MetaWhatsAppConnection, signature?: string, rawBody?: Buffer, payload?: any) {
    const ownSecret = connection.appSecret ? this.credentialEncryption.decryptSecret(connection.appSecret) : undefined;
    const appSecret = ownSecret || this.configService.get<string>('META_APP_SECRET');
    if (!appSecret) throw new UnauthorizedException('Meta App Secret is not configured for this connection');
    if (!signature?.startsWith('sha256=')) throw new UnauthorizedException('Missing Meta webhook signature');
    const body = rawBody || Buffer.from(JSON.stringify(payload || {}));
    const expected = `sha256=${createHmac('sha256', appSecret).update(body).digest('hex')}`;
    if (!this.safeEqual(signature, expected)) throw new UnauthorizedException('Invalid Meta webhook signature');
  }

  async touchWebhook(connectionId: string) {
    await this.connectionRepository.update({ id: connectionId }, { lastWebhookAt: new Date(), lastError: null });
  }

  async resolveInboundStore(connection: MetaWhatsAppConnection, customerPhone: string) {
    if (connection.scope === MetaConnectionScope.STORE) {
      if (!connection.storeId) throw new NotFoundException('Meta branch connection has no branch');
      return this.organizationsService.assertStoreBelongsToOrganization(connection.organizationId, connection.storeId);
    }
    if (connection.inboundRouting === MetaInboundRouting.LAST_CUSTOMER_STORE) {
      const previous = await this.customersService.findMostRecentStoreForPhone(connection.organizationId, customerPhone);
      if (previous) return previous;
    }
    if (connection.defaultStoreId) return this.organizationsService.assertStoreBelongsToOrganization(connection.organizationId, connection.defaultStoreId);
    const stores = await this.organizationsService.listStoresByOrganization(connection.organizationId);
    if (!stores.length) throw new NotFoundException('No branch exists for this organization');
    return stores[0];
  }

  async getOrganizationStoreIds(connection: MetaWhatsAppConnection) {
    if (connection.scope === MetaConnectionScope.STORE) return connection.storeId ? [connection.storeId] : [];
    const stores = await this.organizationsService.listStoresByOrganization(connection.organizationId);
    return stores.map((store) => store.id);
  }

  async findChannelForConnection(connection: MetaWhatsAppConnection, storeId?: string) {
    const targetStoreId = storeId || connection.storeId || connection.defaultStoreId;
    if (!targetStoreId) throw new NotFoundException('No branch is available for this WhatsApp connection');
    const channel = await this.channelRepository.createQueryBuilder('channel')
      .leftJoinAndSelect('channel.store', 'store')
      .leftJoinAndSelect('store.owner', 'owner')
      .where('store.id = :storeId', { storeId: targetStoreId })
      .andWhere('channel.type = :type', { type: ChannelType.WHATSAPP })
      .andWhere("channel.credentials->>'metaConnectionId' = :connectionId", { connectionId: connection.id })
      .getOne();
    if (!channel) throw new NotFoundException('WhatsApp channel not found for connection and branch');
    return channel;
  }

  private async getOwnedTemplate(userId: string, organizationId: string | undefined, templateId: string) {
    const organization = await this.organizationsService.getForUser(userId, organizationId);
    const template = await this.templateRepository.findOne({ where: { id: templateId } });
    if (!template) throw new NotFoundException('WhatsApp template not found');
    const connection = await this.connectionRepository.findOne({ where: { id: template.connectionId, organizationId: organization.id } });
    if (!connection) throw new NotFoundException('WhatsApp template is not available in this organization');
    return { organization, connection, template };
  }

  private async resolveOutboundStore(userId: string, organizationId: string, connection: MetaWhatsAppConnection, requestedStoreId?: string) {
    if (connection.scope === MetaConnectionScope.STORE) {
      if (!connection.storeId) throw new BadRequestException('Store-scoped Meta connection is missing its branch');
      if (requestedStoreId && requestedStoreId !== connection.storeId) throw new BadRequestException('This WhatsApp number belongs to another branch');
      return (await this.organizationsService.getStoreForUser(userId, organizationId, connection.storeId)).store;
    }
    if (requestedStoreId) return (await this.organizationsService.getStoreForUser(userId, organizationId, requestedStoreId)).store;
    if (connection.defaultStoreId) {
      try { return (await this.organizationsService.getStoreForUser(userId, organizationId, connection.defaultStoreId)).store; } catch {}
    }
    return (await this.organizationsService.getStoreForUser(userId, organizationId)).store;
  }

  private async findForUser(
    userId: string,
    organizationId: string | undefined,
    options: { connectionId?: string; storeId?: string; scope?: MetaConnectionScope; required: boolean },
  ) {
    const organization = await this.organizationsService.getForUser(userId, organizationId);
    let connection: MetaWhatsAppConnection | null = null;
    if (options.connectionId) connection = await this.connectionRepository.findOne({ where: { id: options.connectionId, organizationId: organization.id } });
    else {
      const scope = options.scope || MetaConnectionScope.STORE;
      if (scope === MetaConnectionScope.STORE) {
        const { store } = await this.organizationsService.getStoreForUser(userId, organization.id, options.storeId);
        connection = await this.findByScope(organization.id, scope, store.id);
      } else connection = await this.findByScope(organization.id, scope, null);
    }
    if (!connection && options.required) throw new NotFoundException(options.scope === MetaConnectionScope.ORGANIZATION ? 'Organization Meta WhatsApp connection is not configured' : 'Meta WhatsApp connection is not configured for this branch');
    return connection;
  }

  private async findByScope(organizationId: string, scope: MetaConnectionScope, storeId: string | null) {
    const query = this.connectionRepository.createQueryBuilder('connection')
      .where('connection.organizationId = :organizationId', { organizationId })
      .andWhere('connection.scope = :scope', { scope });
    if (scope === MetaConnectionScope.ORGANIZATION) query.andWhere('connection.storeId IS NULL');
    else query.andWhere('connection.storeId = :storeId', { storeId });
    return query.getOne();
  }

  private async getConnectionWithSecrets(id: string) {
    const connection = await this.connectionRepository.createQueryBuilder('connection')
      .addSelect(['connection.accessToken', 'connection.verifyToken', 'connection.appSecret'])
      .leftJoinAndSelect('connection.store', 'store')
      .leftJoinAndSelect('connection.defaultStore', 'defaultStore')
      .where('connection.id = :id', { id })
      .getOne();
    if (!connection) throw new NotFoundException('Meta WhatsApp connection not found');
    return connection;
  }

  private async syncWhatsAppChannels(connection: MetaWhatsAppConnection, userId: string) {
    const secretConnection = await this.getConnectionWithSecrets(connection.id);
    const stores = connection.scope === MetaConnectionScope.STORE
      ? [await this.organizationsService.assertStoreBelongsToOrganization(connection.organizationId, connection.storeId!)]
      : await this.organizationsService.listStoresByOrganization(connection.organizationId);

    for (const store of stores) {
      let channel = await this.channelRepository.createQueryBuilder('channel')
        .leftJoin('channel.store', 'store')
        .where('store.id = :storeId', { storeId: store.id })
        .andWhere('channel.type = :type', { type: ChannelType.WHATSAPP })
        .andWhere("channel.credentials->>'metaConnectionId' = :connectionId", { connectionId: connection.id })
        .getOne();
      const credentials = {
        phoneNumberId: connection.phoneNumberId,
        displayPhoneNumber: connection.displayPhoneNumber,
        businessAccountId: connection.wabaId,
        accessToken: secretConnection.accessToken,
        metaConnectionId: connection.id,
        metaScope: connection.scope,
      };
      if (!channel) channel = this.channelRepository.create({ type: ChannelType.WHATSAPP, status: ChannelStatus.ACTIVE, credentials, store: { id: store.id } as Store });
      else { channel.status = ChannelStatus.ACTIVE; channel.credentials = credentials; }
      await this.channelRepository.save(channel);
    }
  }

  private toPublicConnection(connection: MetaWhatsAppConnection) {
    return {
      id: connection.id,
      organizationId: connection.organizationId,
      scope: connection.scope,
      storeId: connection.storeId,
      defaultStoreId: connection.defaultStoreId,
      inboundRouting: connection.inboundRouting,
      mode: connection.mode,
      appId: connection.appId,
      appSecret: connection.appSecret ? '********' : '',
      wabaId: connection.wabaId,
      phoneNumberId: connection.phoneNumberId,
      displayPhoneNumber: connection.displayPhoneNumber,
      accessToken: connection.accessToken ? '********' : '',
      verifyToken: this.credentialEncryption.decryptSecret(connection.verifyToken),
      webhookUrl: connection.webhookUrl || this.buildWebhookUrl(connection.id),
      status: connection.status,
      lastError: connection.lastError,
      webhookSubscribedAt: connection.webhookSubscribedAt,
      lastWebhookAt: connection.lastWebhookAt,
      templatesSyncedAt: connection.templatesSyncedAt,
      graphApiVersion: this.getGraphVersion(),
    };
  }

  private buildWebhookUrl(connectionId: string) {
    const base = (this.configService.get<string>('PUBLIC_API_URL') || this.configService.get<string>('WEBHOOK_BASE_URL') || `http://localhost:${this.configService.get<string>('PORT') || 3000}`).replace(/\/$/, '');
    return `${base}/webhooks/meta/whatsapp/${connectionId}`;
  }

  private getGraphVersion() {
    return this.configService.get<string>('META_GRAPH_API_VERSION') || 'v26.0';
  }

  private buildTemplateComponents(dto: SendWhatsAppTemplateDto) {
    const components: any[] = [];
    if (dto.headerParameters?.length) components.push({ type: 'header', parameters: dto.headerParameters.map((text) => ({ type: 'text', text })) });
    if (dto.bodyParameters?.length) components.push({ type: 'body', parameters: dto.bodyParameters.map((text) => ({ type: 'text', text })) });
    return components;
  }

  private renderTemplatePreview(template: WhatsAppTemplate, dto: SendWhatsAppTemplateDto) {
    const body = template.components.find((component: any) => String(component.type).toUpperCase() === 'BODY')?.text || template.name;
    let rendered = body;
    (dto.bodyParameters || []).forEach((value, index) => { rendered = rendered.split(`{{${index + 1}}}`).join(value); });
    return rendered;
  }

  private normalizePhone(value: string) {
    return String(value || '').replace(/[^0-9]/g, '');
  }

  private metaErrorMessage(error: any) {
    const meta = error?.response?.data?.error;
    if (meta?.message) return `Meta: ${meta.message}${meta.code ? ` (code ${meta.code})` : ''}${meta.error_subcode ? ` (subcode ${meta.error_subcode})` : ''}`;
    return error?.message || 'Meta request failed';
  }

  private safeEqual(a: string, b: string) {
    const left = Buffer.from(a);
    const right = Buffer.from(b);
    return left.length === right.length && timingSafeEqual(left, right);
  }

}