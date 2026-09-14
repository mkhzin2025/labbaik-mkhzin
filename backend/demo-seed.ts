import { NestFactory } from '@nestjs/core';
import { getModelToken } from '@nestjs/mongoose';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Model } from 'mongoose';
import { Repository } from 'typeorm';
import { AppModule } from './src/app.module';
import { User } from './src/modules/users/entities/user.entity';
import { Store } from './src/modules/stores/entities/store.entity';
import { Channel, ChannelStatus, ChannelType } from './src/modules/channels/entities/channel.entity';
import { Customer } from './src/modules/customers/entities/customer.entity';
import { Review } from './src/modules/reviews/entities/review.entity';
import { Flow } from './src/modules/flows/entities/flow.entity';
import { Notification } from './src/modules/notifications/entities/notification.entity';
import { Conversation } from './src/modules/conversations/schemas/conversation.schema';

const DEMO_EMAIL = 'admin@labbaik.local';

const customerFixtures = [
  { fullName: 'سارة العتيبي', phoneNumber: '+966501234501', email: 'sara@example.com', tags: ['VIP', 'طلب_جديد'], notes: 'تفضّل التواصل عبر واتساب، مهتمة بغرف المعيشة.' },
  { fullName: 'محمد القحطاني', phoneNumber: '+966501234502', email: 'mohammed@example.com', tags: ['استفسار_سعر'], notes: 'عميل متكرر من الرياض.' },
  { fullName: 'نورة الحربي', phoneNumber: '+966501234503', email: 'noura@example.com', tags: ['طلب_جديد'], notes: 'طلبت تنسيق موعد للتوصيل.' },
  { fullName: 'عبدالله الشهري', phoneNumber: '+966501234504', email: 'abdullah@example.com', tags: ['VIP'], notes: 'مهتم بتجهيز مكتب متكامل.' },
  { fullName: 'ريم الدوسري', phoneNumber: '+966501234505', email: 'reem@example.com', tags: ['سؤال_عام'], notes: 'تتابع العروض الموسمية.' },
  { fullName: 'خالد المطيري', phoneNumber: '+966501234506', email: 'khaled@example.com', tags: ['شكوى'], notes: 'تم حل ملاحظة سابقة حول موعد التوصيل.' },
  { fullName: 'لولوة الغامدي', phoneNumber: '+966501234507', email: 'lulwa@example.com', tags: ['طلب_جديد', 'VIP'], notes: 'مصممة داخلية وتطلب بكميات.' },
  { fullName: 'فيصل العنزي', phoneNumber: '+966501234508', email: 'faisal@example.com', tags: ['موقع_المحل'], notes: 'استفسر عن فرع شمال الرياض.' },
  { fullName: 'هند الزهراني', phoneNumber: '+966501234509', email: 'hind@example.com', tags: ['استفسار_سعر'], notes: 'مهتمة بطاولات الطعام.' },
  { fullName: 'تركي السبيعي', phoneNumber: '+966501234510', email: 'turki@example.com', tags: ['طلب_جديد'], notes: 'طلب عرض سعر لشقة جديدة.' },
  { fullName: 'أمل المالكي', phoneNumber: '+966501234511', email: 'amal@example.com', tags: ['VIP', 'سؤال_عام'], notes: 'عميلة برنامج الولاء.' },
  { fullName: 'سلطان اليامي', phoneNumber: '+966501234512', email: 'sultan@example.com', tags: ['طلب_جديد'], notes: 'يفضل الاستلام من المعرض.' },
];

const scenarios = [
  ['السلام عليكم، هل طقم كنب لورا متوفر باللون البيج؟', 'وعليكم السلام ورحمة الله، نعم متوفر حالياً باللون البيج ويتسع لسبعة أشخاص. السعر 4,890 ر.س شامل الضريبة، والتوصيل داخل الرياض مجاني هذا الأسبوع.', 'ممتاز، أحتاجه قبل نهاية الأسبوع.', 'أبشري يا سارة، أقرب موعد متاح الخميس بين 4 و8 مساءً. أرسل لك رابط إتمام الطلب الآن؟'],
  ['كم سعر طاولة الطعام الرخام لستة كراسي؟', 'أهلاً محمد، سعر طاولة أوريانا مع ستة كراسي هو 3,250 ر.س، ومتوفر خيار تقسيط على أربع دفعات بدون رسوم.', 'هل يوجد ضمان؟', 'نعم، ضمان سنتين على الهيكل وسنة على الإكسسوارات، مع خدمة صيانة منزلية داخل المدن الرئيسية.'],
  ['أرغب بتأكيد موعد توصيل طلبي رقم 2841.', 'حياك الله نورة. طلبك جاهز، وموعد التوصيل المؤكد غداً من 10 صباحاً إلى 2 ظهراً. سيتواصل معك السائق قبل الوصول بنصف ساعة.', 'شكراً على سرعة الرد.', 'العفو، سعداء بخدمتك دائماً. تم إرسال تفاصيل الموعد أيضاً برسالة نصية.'],
  ['أحتاج تجهيز مكتب إداري كامل لمساحة 40 متر.', 'أهلاً عبدالله، نستطيع تجهيز المساحة بمكتب مدير، طاولة اجتماعات، وست وحدات عمل ابتداءً من 12,900 ر.س. يشمل العرض القياس والتصميم والتوصيل والتركيب.', 'أرسلوا لي موعد معاينة.', 'تم حجز طلب معاينة مبدئي الثلاثاء الساعة 6 مساءً، وسيؤكد معك مستشار المشاريع الموعد خلال دقائق.'],
  ['هل تخفيضات اليوم الوطني مستمرة؟', 'أهلاً ريم، العرض مستمر حتى نهاية السبت: خصم يصل إلى 30% على غرف النوم و20% على الإكسسوارات، مع توصيل مجاني للطلبات فوق 1,000 ر.س.', 'جميل جداً.', 'يسعدنا ذلك، وإذا أخبرتيني بالقطعة المطلوبة أتحقق لك من المخزون والسعر النهائي فوراً.'],
  ['وصلني الكرسي وفيه خدش بسيط.', 'نعتذر لك يا خالد عن هذه التجربة. سجلت طلب استبدال عاجل برقم 7315، وسيتواصل معك فريق الجودة اليوم لترتيب الاستلام والاستبدال دون أي تكلفة.', 'شكراً، أنتظر اتصالهم.', 'تم تصعيد الطلب ووضعه بالأولوية. سنبقى معك حتى استلام البديل بحالة ممتازة.'],
  ['عندي مشروع شقق مفروشة وأحتاج أسعار جملة.', 'مرحباً لولوة، نوفر برنامجاً خاصاً للمصممين والمشاريع يبدأ من خمس وحدات، مع خصومات كمية ومدير حساب مخصص وعينات خامات مجانية.', 'ممكن كتالوج المشاريع؟', 'بكل تأكيد. تم تسجيل اهتمامك وسيشارك معك فريق المشاريع الكتالوج وقائمة الأسعار الخاصة اليوم.'],
  ['وين موقع فرعكم في شمال الرياض؟', 'أهلاً فيصل، فرعنا على طريق الملك عبدالعزيز بحي الياسمين، مقابل مركز الياسمين. نعمل يومياً من 9 صباحاً حتى 11 مساءً.', 'هل يوجد مواقف؟', 'نعم، تتوفر مواقف مجانية أمام المعرض ومواقف إضافية في الجهة الخلفية.'],
  ['أبحث عن طاولة طعام عملية وسهلة التنظيف.', 'أهلاً هند، أنصحك بطاولة نوفا بسطح سيراميك مقاوم للحرارة والخدش. تتوفر بمقاسين وأسعارها تبدأ من 2,190 ر.س.', 'أرسلوا صور الألوان.', 'تتوفر بالأبيض الرخامي والرمادي الحجري. يمكنك مشاهدة العينات في صفحة المنتج أو زيارة أقرب فرع.'],
  ['أحتاج عرض سعر لتأثيث شقة ثلاث غرف.', 'حياك الله تركي، باقة الشقة المتكاملة تبدأ من 18,500 ر.س وتشمل غرفة نوم رئيسية، غرفة ضيوف، صالة وطاولة طعام، مع التصميم والتوصيل والتركيب.', 'هل يمكن تعديل محتويات الباقة؟', 'نعم، الباقة مرنة بالكامل ونضبطها حسب المساحات والميزانية. يمكننا ترتيب مكالمة مجانية مع المصمم.'],
  ['هل نقاط الولاء تنتهي؟', 'أهلاً أمل، نقاط الولاء صالحة لمدة 12 شهراً من تاريخ اكتسابها، ورصيدك الحالي يؤهلك لقسيمة خصم بقيمة 350 ر.س.', 'رائع، كيف أستخدمها؟', 'عند إتمام الطلب اختاري استخدام نقاطي، أو أعطي موظف المعرض رقم جوالك وسيطبق الخصم مباشرة.'],
  ['هل أقدر أستلم طلبي من المعرض؟', 'نعم يا سلطان، يتوفر الاستلام المجاني من مستودع السلي أو فرع الياسمين حسب توفر القطعة. تجهيز الطلب عادة يستغرق من ساعتين إلى أربع ساعات.', 'اختار فرع الياسمين.', 'تم اختيار فرع الياسمين. ستصلك رسالة بمجرد جاهزية الطلب مع رمز الاستلام.'],
];

const reviewFixtures = [
  ['دانة السالم', 5, 'تجربة ممتازة من أول زيارة حتى التركيب، والموظفون متعاونون جداً.', 'شكراً لكِ دانة، سعداء بأن التجربة نالت رضاك ونتطلع لخدمتك دائماً.', 'replied'],
  ['ماجد الرويلي', 5, 'جودة الأثاث أجمل من الصور والتوصيل كان في الموعد بالضبط.', 'يسعدنا رضاك يا ماجد، نبارك لك القطع الجديدة وبالهنا والعافية.', 'replied'],
  ['غادة العمري', 4, 'التشكيلة جميلة والأسعار مناسبة، أتمنى زيادة خيارات الألوان.', null, 'pending'],
  ['بدر الشمري', 5, 'خدمة ما بعد البيع ممتازة وتم حل ملاحظتي في نفس اليوم.', 'شكراً لثقتك يا بدر، رضاك هو أهم أولوياتنا.', 'replied'],
  ['مي الخالدي', 3, 'المنتجات رائعة لكن موعد التوصيل تأخر ساعة.', null, 'pending'],
  ['ناصر الدوسري', 5, 'أنصح بالمتجر، تعامل راقٍ وتركيب احترافي وسريع.', 'نعتز بتوصيتك يا ناصر، ونشرف بخدمتك في زيارتك القادمة.', 'replied'],
  ['شهد القحطاني', 4, 'المعرض مرتب والمستشارة ساعدتني أختار المقاسات المناسبة.', null, 'pending'],
  ['راكان الحربي', 5, 'أفضل متجر أثاث تعاملت معه في الرياض.', 'شكراً لك يا راكان على كلماتك الجميلة وثقتك الغالية.', 'replied'],
] as const;

function daysAgo(days: number, hour: number, minute = 0) {
  const value = new Date();
  value.setDate(value.getDate() - days);
  value.setHours(hour, minute, 0, 0);
  return value;
}

async function seedDemo() {
  const app = await NestFactory.createApplicationContext(AppModule, { logger: ['error', 'warn'] });
  try {
    const users = app.get<Repository<User>>(getRepositoryToken(User));
    const stores = app.get<Repository<Store>>(getRepositoryToken(Store));
    const channels = app.get<Repository<Channel>>(getRepositoryToken(Channel));
    const customers = app.get<Repository<Customer>>(getRepositoryToken(Customer));
    const reviews = app.get<Repository<Review>>(getRepositoryToken(Review));
    const flows = app.get<Repository<Flow>>(getRepositoryToken(Flow));
    const notifications = app.get<Repository<Notification>>(getRepositoryToken(Notification));
    const conversations = app.get<Model<Conversation>>(getModelToken(Conversation.name));

    const owner = await users.findOne({ where: { email: DEMO_EMAIL } });
    if (!owner) throw new Error(`Run the base seed first; user ${DEMO_EMAIL} was not found.`);

    let store = await stores.findOne({ where: { owner: { id: owner.id } } });
    if (!store) store = stores.create({ owner });
    Object.assign(store, {
      name: 'روائع نجد للأثاث',
      description: 'أثاث عصري بلمسة سعودية وخدمة توصيل وتركيب في جميع المدن الرئيسية.',
      knowledgeBase: 'ضمان سنتين على الهياكل، توصيل مجاني داخل الرياض للطلبات فوق 1000 ريال، إرجاع خلال 14 يوماً، ودعم يومي من 9 صباحاً إلى 11 مساءً.',
      aiMode: 'always',
      preferredModel: 'groq',
      customTags: ['VIP', 'مشروع_تجاري', 'متابعة_عاجلة'],
      workingHours: { start: '09:00', end: '23:00', timezone: 'Asia/Riyadh', enabledDays: [0, 1, 2, 3, 4, 5, 6] },
      website: 'https://example.com',
      phoneNumber: '+966112345678',
      currency: 'SAR',
    });
    store = await stores.save(store);

    for (const type of Object.values(ChannelType)) {
      let channel = await channels.findOne({ where: { store: { id: store.id }, type } });
      if (!channel) {
        channel = channels.create({
          type,
          store,
          credentials: {
            accessToken: '',
            displayPhoneNumber: type === ChannelType.WHATSAPP ? '+966 11 234 5678' : undefined,
            accountName: 'روائع نجد للأثاث',
          },
        });
      }
      channel.status = ChannelStatus.ACTIVE;
      await channels.save(channel);
    }

    const savedCustomers: Customer[] = [];
    for (let index = 0; index < customerFixtures.length; index++) {
      const fixture = customerFixtures[index];
      let customer = await customers.findOne({ where: { store: { id: store.id }, phoneNumber: fixture.phoneNumber } });
      if (!customer) customer = customers.create({ store });
      Object.assign(customer, fixture, {
        whatsappId: fixture.phoneNumber.replace('+', ''),
        instagramId: `demo_${index + 1}`,
        createdAt: daysAgo(35 - index * 2, 12),
      });
      savedCustomers.push(await customers.save(customer));
    }

    for (let index = 0; index < savedCustomers.length; index++) {
      const customer = savedCustomers[index];
      const platform = ['whatsapp', 'instagram', 'facebook'][index % 3];
      const texts = scenarios[index];
      const dayOffset = index % 7;
      const startHour = 10 + (index % 8);
      const messages = texts.map((text, messageIndex) => ({
        from: messageIndex % 2 === 0 ? customer.phoneNumber : 'me',
        text,
        type: 'text',
        attachments: [],
        metadata: messageIndex % 2 === 1 ? { generatedBy: 'labbaik-ai', responseTimeSeconds: 3 } : {},
        timestamp: daysAgo(dayOffset, startHour, messageIndex * 4).getTime(),
      }));
      const lastMessageAt = new Date(messages[messages.length - 1].timestamp);
      await conversations.findOneAndUpdate(
        { storeId: store.id, customerPhone: customer.phoneNumber, platform },
        {
          $set: {
            customerId: customer.id,
            status: 'open',
            messages,
            unreadCount: index % 4 === 0 ? 2 : index % 3 === 0 ? 1 : 0,
            aiEnabled: index !== 5,
            lastSentiment: index === 5 ? 'negative' : index % 4 === 1 ? 'neutral' : 'positive',
            tags: customer.tags,
            lastMessage: messages[messages.length - 1].text,
            lastMessageAt,
          },
        },
        { upsert: true, returnDocument: 'after' },
      );
    }

    for (let index = 0; index < reviewFixtures.length; index++) {
      const [reviewerName, rating, comment, reply, status] = reviewFixtures[index];
      const platformReviewId = `DEMO-REVIEW-${index + 1}`;
      let review = await reviews.findOne({ where: { platformReviewId } });
      if (!review) review = reviews.create({ store, platformReviewId });
      Object.assign(review, { reviewerName, rating, comment, reply, status, store, createdAt: daysAgo(index * 2, 14) });
      await reviews.save(review);
    }

    const flowFixtures = [
      { name: 'الترحيب وخدمة العملاء', isDefault: true, isActive: true, nodes: [
        { id: 'start', type: 'start', position: { x: 100, y: 120 }, data: { text: 'أهلاً بك في روائع نجد 👋', isStart: true } },
        { id: 'menu', type: 'message', position: { x: 400, y: 120 }, data: { text: 'كيف نقدر نخدمك؟', buttons: [{ id: 'order', label: 'متابعة طلب' }, { id: 'sales', label: 'استفسار عن منتج' }] } },
        { id: 'agent', type: 'message', position: { x: 700, y: 120 }, data: { text: 'تمام، لحظات ونخدمك.' } },
      ], edges: [{ id: 'e1', source: 'start', target: 'menu' }, { id: 'e2', source: 'menu', target: 'agent' }] },
      { name: 'متابعة الطلبات والتوصيل', isDefault: false, isActive: true, nodes: [
        { id: 'start', type: 'start', position: { x: 100, y: 100 }, data: { text: 'فضلاً أرسل رقم الطلب', isStart: true } },
        { id: 'lookup', type: 'message', position: { x: 430, y: 100 }, data: { text: 'جاري التحقق من حالة طلبك...' } },
      ], edges: [{ id: 'e1', source: 'start', target: 'lookup' }] },
      { name: 'تقييم تجربة الشراء', isDefault: false, isActive: true, nodes: [
        { id: 'start', type: 'start', position: { x: 100, y: 100 }, data: { text: 'يسعدنا تقييم تجربتك من 1 إلى 5', isStart: true } },
      ], edges: [] },
    ];
    for (const fixture of flowFixtures) {
      let flow = await flows.findOne({ where: { store: { id: store.id }, name: fixture.name } });
      if (!flow) flow = flows.create({ store });
      Object.assign(flow, fixture, { store });
      await flows.save(flow);
    }

    const notificationFixtures = [
      { type: 'new_message', title: 'رسالة جديدة من سارة العتيبي', message: 'العميلة ترغب بإتمام طلب طقم كنب لورا.', link: '/dashboard/conversations', isRead: false },
      { type: 'new_review', title: 'تقييم جديد 5 نجوم', message: 'راكان الحربي: أفضل متجر أثاث تعاملت معه في الرياض.', link: '/dashboard/reviews', isRead: false },
      { type: 'system_alert', title: 'ملخص الأداء الأسبوعي', message: 'ارتفع معدل الرد الآلي هذا الأسبوع واستقرت رضا العملاء عند مستوى ممتاز.', link: '/dashboard', isRead: true },
    ] as const;
    for (const fixture of notificationFixtures) {
      let notification = await notifications.findOne({ where: { user: { id: owner.id }, title: fixture.title } });
      if (!notification) notification = notifications.create({ user: owner });
      Object.assign(notification, fixture, { user: owner });
      await notifications.save(notification);
    }

    const conversationCount = await conversations.countDocuments({ storeId: store.id });
    console.log(`Demo seed complete: ${savedCustomers.length} customers, ${conversationCount} conversations, ${reviewFixtures.length} reviews, ${flowFixtures.length} flows, and 4 channels.`);
  } finally {
    await app.close();
  }
}

seedDemo().catch((error) => {
  console.error('Demo seed failed:', error);
  process.exit(1);
});
