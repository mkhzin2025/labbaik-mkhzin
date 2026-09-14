export const ids = {
  user: '8eabb82d-6d07-48a9-8c42-5ae7644593f4',
  store: '63ed7ec2-0bb7-4937-8ca2-c8a537f9a83b',
  channel: '9c24f582-6d29-42d8-80eb-8a98c6a7d0d1',
  customer: '2a1ce2db-23ea-438e-8215-77d8a819ce21',
  review: 'c5d4ea23-8d82-4b21-912f-8a44f8e2362a',
  notification: 'a841b991-ff7a-4ee0-9df3-0a9617f9959a',
  flow: '730dc62e-b6d6-4024-99c1-d32ad45e3b6f',
  conversation: '66364c881263b015ccb98429',
};

export const examples = {
  auth: {
    register: {
      email: 'admin@labbaik.local',
      password: 'Admin123!',
      fullName: 'Admin',
    },
    login: {
      email: 'admin@labbaik.local',
      password: 'Admin123!',
    },
    authResponse: {
      user: {
        id: ids.user,
        email: 'admin@labbaik.local',
        fullName: 'Admin',
        role: 'admin',
      },
      token: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.example.signature',
    },
  },
  user: {
    current: {
      id: ids.user,
      email: 'admin@labbaik.local',
      fullName: 'Admin',
      role: 'admin',
      createdAt: '2026-05-03T08:00:00.000Z',
      updatedAt: '2026-05-03T08:00:00.000Z',
    },
    update: {
      fullName: 'Admin User',
    },
  },
  store: {
    create: {
      name: 'Labbaik',
      description: 'Labbaik response and communication platform',
      knowledgeBase: 'We answer customer messages in Arabic and English.',
      phoneNumber: '+966500000000',
      website: 'https://labbaik.example',
      logoUrl: 'https://labbaik.example/logo.png',
    },
    update: {
      aiMode: 'always',
      preferredModel: 'deepseek_groq',
      workingHours: {
        start: '09:00',
        end: '18:00',
        timezone: 'Asia/Riyadh',
        enabledDays: [0, 1, 2, 3, 4],
      },
      customTags: ['VIP', 'Needs follow-up'],
    },
    current: {
      id: ids.store,
      name: 'Labbaik',
      description: 'Labbaik response and communication platform',
      aiMode: 'always',
      preferredModel: 'deepseek_groq',
      customTags: ['VIP', 'Needs follow-up'],
      currency: 'SAR',
      owner: { id: ids.user, email: 'admin@labbaik.local' },
    },
  },
  channel: {
    create: {
      type: 'whatsapp',
      credentials: {
        phoneNumberId: '123456789',
        accessToken: 'WHATSAPP_ACCESS_TOKEN',
      },
    },
    item: {
      id: ids.channel,
      type: 'whatsapp',
      status: 'pending',
      credentials: {
        phoneNumberId: '123456789',
      },
      createdAt: '2026-05-03T08:00:00.000Z',
    },
  },
  customer: {
    item: {
      id: ids.customer,
      fullName: 'محمد أحمد',
      email: 'customer@example.com',
      phoneNumber: '+966511111111',
      tags: ['VIP'],
      notes: 'Prefers WhatsApp support.',
    },
    update: {
      fullName: 'محمد أحمد',
      tags: ['VIP', 'Needs follow-up'],
      notes: 'Asked about delivery status.',
    },
  },
  review: {
    item: {
      id: ids.review,
      reviewerName: 'Sara',
      rating: 5,
      comment: 'خدمة ممتازة وسريعة',
      reply: null,
      status: 'pending',
    },
    reply: {
      reply: 'شكراً لتقييمك، يسعدنا خدمتك دائماً.',
    },
    suggestion: {
      suggestion: 'شكراً لك على تقييمك الجميل. نسعد دائماً بخدمتك.',
    },
    simulate: {
      name: 'Sara',
      rating: 5,
      comment: 'خدمة ممتازة وسريعة',
      photoUrl: 'https://example.com/customer.jpg',
    },
  },
  notification: {
    item: {
      id: ids.notification,
      type: 'new_message',
      title: 'رسالة جديدة',
      message: 'وصلت رسالة جديدة من عميل.',
      link: '/dashboard/conversations',
      isRead: false,
      createdAt: '2026-05-03T08:00:00.000Z',
    },
    updateResult: {
      generatedMaps: [],
      raw: [],
      affected: 1,
    },
  },
  flow: {
    create: {
      name: 'Welcome flow',
      isDefault: true,
      nodes: [
        {
          id: 'start',
          type: 'start',
          data: { text: 'Start' },
        },
        {
          id: 'welcome',
          type: 'message',
          data: {
            text: 'مرحباً بك في لبّيك. كيف نقدر نخدمك؟',
            buttons: [{ id: 'support', label: 'الدعم', value: 'support' }],
          },
        },
      ],
      edges: [{ id: 'edge-1', source: 'start', target: 'welcome' }],
      isActive: true,
    },
    item: {
      id: ids.flow,
      name: 'Welcome flow',
      isDefault: true,
      nodes: [],
      edges: [],
      isActive: true,
    },
    update: {
      name: 'Updated welcome flow',
      isActive: false,
    },
  },
  conversation: {
    item: {
      _id: ids.conversation,
      customerPhone: '+966511111111',
      storeId: ids.store,
      platform: 'whatsapp',
      messages: [
        {
          from: '+966511111111',
          text: 'السلام عليكم',
          type: 'text',
          timestamp: 1777795200000,
        },
      ],
      unreadCount: 1,
      aiEnabled: true,
      lastSentiment: 'positive',
      tags: ['VIP'],
      lastMessage: 'السلام عليكم',
    },
    stats: {
      totalConversations: 12,
      totalMessages: 84,
      aiReplies: 47,
      activeChannels: 3,
      hoursSaved: 2.4,
      avgHumanSpeed: 10,
      aiSpeed: 0.05,
      platformStats: [{ name: 'whatsapp', value: 8 }],
      sentimentStats: [{ name: 'إيجابي', value: 9, color: '#22c55e' }],
      timelineData: [{ date: '05/03', messages: 14 }],
    },
    toggleAi: {
      enabled: false,
    },
    tags: {
      tags: ['VIP', 'Needs follow-up'],
    },
    message: {
      text: 'مرحباً، كيف أقدر أساعدك؟',
    },
    sent: {
      status: 'sent',
      message: {
        from: 'me',
        text: 'مرحباً، كيف أقدر أساعدك؟',
        isManual: true,
        timestamp: 1777795200000,
      },
    },
  },
  webhook: {
    whatsappPayload: {
      entry: [
        {
          changes: [
            {
              value: {
                metadata: { phone_number_id: '123456789' },
                messages: [
                  {
                    from: '+966511111111',
                    timestamp: '1777795200',
                    text: { body: 'السلام عليكم' },
                  },
                ],
              },
            },
          ],
        },
      ],
    },
    simulatorPayload: {
      from: 'insta_user_123',
      text: 'هل التوصيل متاح اليوم؟',
    },
    success: {
      status: 'success',
    },
  },
  errors: {
    unauthorized: {
      message: 'Unauthorized',
      statusCode: 401,
    },
    storeNotFound: {
      message: 'Store profile not found',
      error: 'Not Found',
      statusCode: 404,
    },
  },
};
