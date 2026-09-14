import { CanActivate, ExecutionContext, INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { AuthController } from '../src/modules/auth/auth.controller';
import { AuthService } from '../src/modules/auth/auth.service';
import { ChannelsController } from '../src/modules/channels/channels.controller';
import { ChannelsService } from '../src/modules/channels/channels.service';
import { ConversationsController } from '../src/modules/conversations/conversations.controller';
import { ConversationsService } from '../src/modules/conversations/conversations.service';
import { CustomersController } from '../src/modules/customers/customers.controller';
import { CustomersService } from '../src/modules/customers/customers.service';
import { FlowsController } from '../src/modules/flows/flows.controller';
import { FlowsService } from '../src/modules/flows/flows.service';
import { NotificationsController } from '../src/modules/notifications/notifications.controller';
import { NotificationsService } from '../src/modules/notifications/notifications.service';
import { ReviewsController } from '../src/modules/reviews/reviews.controller';
import { ReviewsService } from '../src/modules/reviews/reviews.service';
import { StoresController } from '../src/modules/stores/stores.controller';
import { StoresService } from '../src/modules/stores/stores.service';
import { UsersController } from '../src/modules/users/users.controller';
import { UsersService } from '../src/modules/users/users.service';
import { WebhooksController } from '../src/modules/webhooks/webhooks.controller';
import { WebhooksService } from '../src/modules/webhooks/webhooks.service';
import { JwtAuthGuard } from '../src/modules/auth/guards/jwt-auth.guard';

const user = {
  id: 'user-1',
  email: 'admin@labbaik.local',
  fullName: 'Admin',
  role: 'admin',
  password: 'hashed-password',
};

const store = {
  id: 'store-1',
  name: 'Labbaik',
  owner: user,
};

const channel = {
  id: 'channel-1',
  type: 'whatsapp',
  status: 'pending',
  credentials: { phoneNumberId: '123456789', accessToken: 'token' },
};

const customer = {
  id: 'customer-1',
  fullName: 'Customer',
  phoneNumber: '+966500000000',
  tags: [],
};

const review = {
  id: 'review-1',
  reviewerName: 'Reviewer',
  rating: 5,
  comment: 'Great',
  status: 'pending',
};

const notification = {
  id: 'notification-1',
  type: 'system_alert',
  title: 'Notice',
  message: 'Message',
  isRead: false,
};

const flow = {
  id: 'flow-1',
  name: 'Welcome flow',
  nodes: [],
  edges: [],
  isActive: true,
};

const conversation = {
  _id: 'conversation-1',
  customerPhone: '+966500000000',
  storeId: store.id,
  platform: 'whatsapp',
  messages: [],
  unreadCount: 1,
  tags: [],
};

const authGuard: CanActivate = {
  canActivate: (context: ExecutionContext) => {
    const req = context.switchToHttp().getRequest();
    req.user = { id: user.id, email: user.email, role: user.role };
    return true;
  },
};

const updated = (entity: Record<string, any>, patch: Record<string, any>) => ({
  ...entity,
  ...patch,
});

describe('API routes (e2e)', () => {
  let app: INestApplication;

  const authService = {
    register: jest.fn(),
    login: jest.fn(),
  };

  const usersService = {
    findById: jest.fn(),
    update: jest.fn(),
  };

  const storesService = {
    create: jest.fn(),
    findByOwner: jest.fn(),
    update: jest.fn(),
  };

  const channelsService = {
    create: jest.fn(),
    findAllByStore: jest.fn(),
    findOne: jest.fn(),
    remove: jest.fn(),
  };

  const customersService = {
    findAllByStore: jest.fn(),
    findOne: jest.fn(),
    update: jest.fn(),
  };

  const reviewsService = {
    findAllByStore: jest.fn(),
    getAiSuggestion: jest.fn(),
    replyToReview: jest.fn(),
    simulateIncomingReview: jest.fn(),
  };

  const notificationsService = {
    findAll: jest.fn(),
    markAsRead: jest.fn(),
    markAllAsRead: jest.fn(),
  };

  const flowsService = {
    findAllByStore: jest.fn(),
    findOne: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
  };

  const conversationsService = {
    findAllByStore: jest.fn(),
    getStats: jest.fn(),
    findOne: jest.fn(),
    markAsRead: jest.fn(),
    toggleAi: jest.fn(),
    updateTags: jest.fn(),
    sendMessage: jest.fn(),
  };

  const webhooksService = {
    verifyWhatsApp: jest.fn(),
    handleWhatsAppMessage: jest.fn(),
    handleGenericWebhook: jest.fn(),
  };

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      controllers: [
        AuthController,
        UsersController,
        StoresController,
        ChannelsController,
        CustomersController,
        ReviewsController,
        NotificationsController,
        FlowsController,
        ConversationsController,
        WebhooksController,
      ],
      providers: [
        { provide: AuthService, useValue: authService },
        { provide: UsersService, useValue: usersService },
        { provide: StoresService, useValue: storesService },
        { provide: ChannelsService, useValue: channelsService },
        { provide: CustomersService, useValue: customersService },
        { provide: ReviewsService, useValue: reviewsService },
        { provide: NotificationsService, useValue: notificationsService },
        { provide: FlowsService, useValue: flowsService },
        { provide: ConversationsService, useValue: conversationsService },
        { provide: WebhooksService, useValue: webhooksService },
      ],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue(authGuard)
      .compile();

    app = moduleFixture.createNestApplication();
    await app.init();
  });

  beforeEach(() => {
    jest.clearAllMocks();

    authService.register.mockResolvedValue({ user, token: 'jwt-token' });
    authService.login.mockResolvedValue({ user: { ...user, password: undefined }, token: 'jwt-token' });
    usersService.findById.mockResolvedValue(user);
    usersService.update.mockImplementation((_id, data) => Promise.resolve(updated(user, data)));
    storesService.create.mockResolvedValue(store);
    storesService.findByOwner.mockResolvedValue(store);
    storesService.update.mockImplementation((_id, data) => Promise.resolve(updated(store, data)));
    channelsService.create.mockResolvedValue(channel);
    channelsService.findAllByStore.mockResolvedValue([channel]);
    channelsService.findOne.mockResolvedValue(channel);
    channelsService.remove.mockResolvedValue(channel);
    customersService.findAllByStore.mockResolvedValue([customer]);
    customersService.findOne.mockResolvedValue(customer);
    customersService.update.mockImplementation((_id, _storeId, data) => Promise.resolve(updated(customer, data)));
    reviewsService.findAllByStore.mockResolvedValue([review]);
    reviewsService.getAiSuggestion.mockResolvedValue('Suggested reply');
    reviewsService.replyToReview.mockImplementation((_id, reply) => Promise.resolve(updated(review, { reply, status: 'replied' })));
    reviewsService.simulateIncomingReview.mockResolvedValue(review);
    notificationsService.findAll.mockResolvedValue([notification]);
    notificationsService.markAsRead.mockResolvedValue({ affected: 1 });
    notificationsService.markAllAsRead.mockResolvedValue({ affected: 2 });
    flowsService.findAllByStore.mockResolvedValue([flow]);
    flowsService.findOne.mockResolvedValue(flow);
    flowsService.create.mockImplementation((_store, data) => Promise.resolve(updated(flow, data)));
    flowsService.update.mockImplementation((_id, _storeId, data) => Promise.resolve(updated(flow, data)));
    flowsService.delete.mockResolvedValue(flow);
    conversationsService.findAllByStore.mockResolvedValue([conversation]);
    conversationsService.getStats.mockResolvedValue({ totalConversations: 1, totalMessages: 0 });
    conversationsService.findOne.mockResolvedValue(conversation);
    conversationsService.markAsRead.mockResolvedValue(updated(conversation, { unreadCount: 0 }));
    conversationsService.toggleAi.mockImplementation((_id, enabled) => Promise.resolve(updated(conversation, { aiEnabled: enabled })));
    conversationsService.updateTags.mockImplementation((_id, tags) => Promise.resolve(updated(conversation, { tags })));
    conversationsService.sendMessage.mockResolvedValue({ status: 'sent', message: { text: 'Hello' } });
    webhooksService.verifyWhatsApp.mockReturnValue('challenge-code');
    webhooksService.handleWhatsAppMessage.mockResolvedValue({ status: 'success' });
    webhooksService.handleGenericWebhook.mockResolvedValue({ status: 'success' });
  });

  afterAll(async () => {
    await app.close();
  });

  it('registers a user', async () => {
    await request(app.getHttpServer())
      .post('/auth/register')
      .send({ email: user.email, password: 'Admin123!', fullName: user.fullName })
      .expect(201)
      .expect(({ body }) => {
        expect(body.token).toBe('jwt-token');
        expect(authService.register).toHaveBeenCalledWith({
          email: user.email,
          password: 'Admin123!',
          fullName: user.fullName,
        });
      });
  });

  it('logs a user in', async () => {
    await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email: user.email, password: 'Admin123!' })
      .expect(200)
      .expect(({ body }) => {
        expect(body.token).toBe('jwt-token');
        expect(authService.login).toHaveBeenCalledWith({ email: user.email, password: 'Admin123!' });
      });
  });

  it('reads and updates the authenticated user', async () => {
    await request(app.getHttpServer()).get('/users/me').expect(200).expect(({ body }) => {
      expect(body.id).toBe(user.id);
      expect(body.password).toBeUndefined();
    });

    await request(app.getHttpServer())
      .patch('/users/me')
      .send({ fullName: 'Updated Admin' })
      .expect(200)
      .expect(({ body }) => {
        expect(body.fullName).toBe('Updated Admin');
        expect(body.password).toBeUndefined();
      });
  });

  it('creates, reads, and updates the current store', async () => {
    await request(app.getHttpServer()).post('/stores').send({ name: store.name }).expect(201).expect(store);
    await request(app.getHttpServer()).get('/stores/me').expect(200).expect(store);
    await request(app.getHttpServer())
      .patch('/stores/me')
      .send({ description: 'Updated' })
      .expect(200)
      .expect(({ body }) => expect(body.description).toBe('Updated'));
  });

  it('manages channels for the authenticated store', async () => {
    await request(app.getHttpServer()).post('/channels').send({ type: 'whatsapp' }).expect(201).expect(channel);
    await request(app.getHttpServer()).get('/channels').expect(200).expect([channel]);
    await request(app.getHttpServer()).get(`/channels/${channel.id}`).expect(200).expect(channel);
    await request(app.getHttpServer()).delete(`/channels/${channel.id}`).expect(200).expect(channel);
  });

  it('reads and updates customers for the authenticated store', async () => {
    await request(app.getHttpServer()).get('/customers').expect(200).expect([customer]);
    await request(app.getHttpServer()).get(`/customers/${customer.id}`).expect(200).expect(customer);
    await request(app.getHttpServer())
      .patch(`/customers/${customer.id}`)
      .send({ notes: 'VIP' })
      .expect(200)
      .expect(({ body }) => expect(body.notes).toBe('VIP'));
  });

  it('reads reviews, gets AI suggestions, replies, and simulates reviews', async () => {
    await request(app.getHttpServer()).get('/reviews').expect(200).expect([review]);
    await request(app.getHttpServer()).get(`/reviews/${review.id}/suggestion`).expect(200).expect({ suggestion: 'Suggested reply' });
    await request(app.getHttpServer())
      .post(`/reviews/${review.id}/reply`)
      .send({ reply: 'Thanks' })
      .expect(201)
      .expect(({ body }) => expect(body.reply).toBe('Thanks'));
    await request(app.getHttpServer()).post('/reviews/simulate').send({ rating: 5 }).expect(201).expect(review);
  });

  it('reads and marks notifications', async () => {
    await request(app.getHttpServer()).get('/notifications').expect(200).expect([notification]);
    await request(app.getHttpServer()).patch(`/notifications/${notification.id}/read`).expect(200).expect({ affected: 1 });
    await request(app.getHttpServer()).patch('/notifications/read-all').expect(200).expect({ affected: 2 });
  });

  it('manages automation flows for the authenticated store', async () => {
    await request(app.getHttpServer()).get('/flows').expect(200).expect([flow]);
    await request(app.getHttpServer()).get(`/flows/${flow.id}`).expect(200).expect(flow);
    await request(app.getHttpServer())
      .post('/flows')
      .send({ name: 'New flow' })
      .expect(201)
      .expect(({ body }) => expect(body.name).toBe('New flow'));
    await request(app.getHttpServer())
      .patch(`/flows/${flow.id}`)
      .send({ isActive: false })
      .expect(200)
      .expect(({ body }) => expect(body.isActive).toBe(false));
    await request(app.getHttpServer()).delete(`/flows/${flow.id}`).expect(200).expect(flow);
  });

  it('reads conversations, stats, and conversation actions', async () => {
    await request(app.getHttpServer()).get('/conversations').expect(200).expect([conversation]);
    await request(app.getHttpServer()).get('/conversations/stats').expect(200).expect({ totalConversations: 1, totalMessages: 0 });
    await request(app.getHttpServer()).get(`/conversations/${conversation._id}`).expect(200).expect(conversation);
    await request(app.getHttpServer()).patch(`/conversations/${conversation._id}/read`).expect(200).expect(({ body }) => {
      expect(body.unreadCount).toBe(0);
    });
    await request(app.getHttpServer()).patch(`/conversations/${conversation._id}/toggle-ai`).send({ enabled: false }).expect(200).expect(({ body }) => {
      expect(body.aiEnabled).toBe(false);
    });
    await request(app.getHttpServer()).patch(`/conversations/${conversation._id}/tags`).send({ tags: ['vip'] }).expect(200).expect(({ body }) => {
      expect(body.tags).toEqual(['vip']);
    });
    await request(app.getHttpServer()).post(`/conversations/${conversation._id}/messages`).send({ text: 'Hello' }).expect(201).expect({
      status: 'sent',
      message: { text: 'Hello' },
    });
  });

  it('handles public webhook endpoints', async () => {
    await request(app.getHttpServer())
      .get('/webhooks/whatsapp')
      .query({ 'hub.mode': 'subscribe', 'hub.verify_token': 'verify-token', 'hub.challenge': 'challenge-code' })
      .expect(200)
      .expect('challenge-code');
    await request(app.getHttpServer()).post('/webhooks/whatsapp').send({ entry: [] }).expect(200).expect({ status: 'success' });
    await request(app.getHttpServer()).post('/webhooks/instagram').send({ from: 'insta', text: 'Hello' }).expect(200).expect({ status: 'success' });
    await request(app.getHttpServer()).post('/webhooks/facebook').send({ from: 'fb', text: 'Hello' }).expect(200).expect({ status: 'success' });
  });
});
