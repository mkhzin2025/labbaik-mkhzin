// The Makhazin welcome flow (Arabic + English), rebuilt from the previous bot's conversation.
// Only base node types (start/message/buttons/list/handoff/end); "back to main menu" is an edge to the language node.
// Lines marked 【...】 are content we don't have yet; fill them in the editor before activating.

const BRANCHES = [
  { key: 'tuwaiq', ar: 'طويق', en: 'Tuwaiq', arAddress: 'الرياض - شارع الإخلاص', enAddress: 'Riyadh - Al-Ikhlas St.', map: 'https://maps.app.goo.gl/qpTvpFYJFRHqMXHx6' },
  { key: 'khaleej', ar: 'الخليج', en: 'Al-Khaleej' },
  { key: 'janadriyah', ar: 'الجنادرية', en: 'Al-Janadriyah' },
  { key: 'munsiyah', ar: 'المونسية', en: 'Al-Munsiyah' },
  { key: 'wholesale', ar: 'الجملة', en: 'Wholesale' },
  { key: 'rawabi', ar: 'الروابي', en: 'Al-Rawabi' },
  { key: 'marwah', ar: 'المروة', en: 'Al-Marwah' },
  { key: 'tabuk', ar: 'تبوك', en: 'Tabuk' },
  { key: 'buraydah', ar: 'بريدة', en: 'Buraydah' },
  { key: 'hafar', ar: 'حفر الباطن', en: 'Hafar Al-Batin' },
];

const RIYADH_OFFER_BRANCHES = [
  ['tuwaiq', 'فرع طويق', 'Tuwaiq branch'],
  ['khaleej', 'فرع الخليج', 'Al-Khaleej branch'],
  ['janadriyah', 'فرع الجنادرية', 'Al-Janadriyah branch'],
  ['munsiyah', 'فرع المونسية', 'Al-Munsiyah branch'],
  ['shifa', 'فرع الشفاء', 'Al-Shifa branch'],
];

const JEDDAH_OFFER_BRANCHES = [
  ['marwah', 'فرع حي المروة', 'Al-Marwah branch'],
  ['rawabi', 'فرع حي الروابي', 'Al-Rawabi branch'],
];

function build() {
  const nodes = [];
  const edges = [];
  const node = (id, type, data) => { nodes.push({ id, type, position: { x: 0, y: 0 }, data }); return id; };
  const link = (source, target, sourceHandle = null) => edges.push({ id: `e-${source}-${sourceHandle || 'out'}`, source, target, sourceHandle });
  const options = (prefix, labels) => labels.map(([key, label, description]) => ({ id: `${prefix}-${key}`, label, ...(description ? { description } : {}) }));

  node('start', 'start', { trigger: { type: 'new_conversation', match: 'exact', keywords: [] } });
  node('lang', 'buttons', {
    text: 'مرحبا بك\nعزيزنا العميل في مخازن سوبرماركت، للاستمرار يرجى اختيار اللغة المفضلة.\n\nTo Continue, Please choose your preferred language',
    buttons: options('lang', [['ar', 'العربية'], ['en', 'English'], ['contest', 'اشترك بالمسابقة']]),
  });
  link('start', 'lang');

  node('contest', 'message', { text: '🎉 مسابقة مخازن سوبرماركت\n\n【أكمل تفاصيل المسابقة وطريقة الاشتراك】' });
  link('lang', 'contest', 'lang-contest');

  for (const lang of ['ar', 'en']) {
    const ar = lang === 'ar';
    const p = (id) => `${lang}-${id}`;
    const t = (arText, enText) => (ar ? arText : enText);

    node(p('main'), 'buttons', {
      text: t('حياك الله عزيزنا العميل\n\nسعداء بخدمتك وتوفير كل ما تحتاجه.\n\nاختر احدى الخيارات الآتية حتى نتمكن من مساعدتك:',
        'Welcome to Makhazin Supermarket\n\nWe are happy to help and provide you with all what you need 24/7\n\nSelect from the following options so we know how to assist you'),
      buttons: options(p('main'), ar
        ? [['offers', 'العروض 🛍️'], ['branches', 'الفروع 📍'], ['cs', 'خدمة العملاء 📞']]
        : [['offers', '🛍️ Offers'], ['branches', '📍 Branches'], ['cs', '📞 Customer Service']]),
    });
    link('lang', p('main'), `lang-${lang}`);

    // --- After every answer ---
    node(p('help'), 'buttons', {
      text: t('نحن بالخدمة\n\nهل تحتاج إلى أي مساعدة أخرى؟', 'We are at your service.\n\nDo you need any further help?'),
      footer: t('شركة مخازن المملكة العالمية', 'Makhazin Al-Mamlaka Al-Alamia'),
      buttons: options(p('help'), [['menu', t('القائمة الرئيسية', 'Main Menu')], ['bye', t('إنهاء المحادثة', 'End conversation')]]),
    });
    link(p('help'), 'lang', `${p('help')}-menu`);
    node(p('bye'), 'message', { text: t('شكرًا لتواصلك مع مخازن سوبرماركت 🌷', 'Thank you for contacting Makhazin Supermarket 🌷') });
    link(p('help'), p('bye'), `${p('help')}-bye`);
    node(p('end'), 'end', {});
    link(p('bye'), p('end'));

    // --- Offers ---
    node(p('offers'), 'list', {
      text: t('🛍️ العروض\n\nتحرص مخازن سوبرماركت على تقديم أفضل العروض لعملائها بأسعار منافسة.\n\nاختر المدينة الأقرب لك',
        '🛍️ Offers\n\nMakhazin Supermarket is keen to offer the best deals to its customers at competitive prices.\n\nChoose the nearest city to you'),
      buttonText: t('اختر المدينة', 'Choose city'),
      buttons: options(p('offers'), [
        ['riyadh', t('🔸 عروض الرياض', '🔸 Riyadh Offers')],
        ['jeddah', t('🔸 عروض جدة', '🔸 Jeddah Offers')],
        ['tabuk', t('🔸 عروض تبوك', '🔸 Tabuk Offers')],
        ['qassim', t('🔸 عروض القصيم', '🔸 Al-Qassim Offers')],
        ['hafar', t('🔸 عروض حفر الباطن', '🔸 Hafar Al-Batin Offers')],
      ]),
    });
    link(p('main'), p('offers'), `${p('main')}-offers`);

    node(p('no-offers'), 'message', {
      text: t('لا توجد عروض متاحة حاليًا، ترقبوا عروضنا القادمة خلال الأيام المقبلة!',
        'There are no offers available at the moment, but stay tuned for our upcoming promotions in the next few days!'),
    });
    link(p('no-offers'), p('help'));

    node(p('offers-riyadh'), 'list', {
      text: t('عروض فروع الرياض\n\nلمخازن سوبرماركت عدد من الفروع في مدينة الرياض.\n\nاختر الفرع الأقرب لك',
        'Offers of Riyadh Branches\n\nMakhazin Supermarket has a number of branches in Riyadh City.\n\nSelect the nearest branch to you'),
      buttonText: t('اختر الفرع', 'Choose branch'),
      buttons: options(p('offers-riyadh'), RIYADH_OFFER_BRANCHES.map(([key, a, e]) => [key, t(a, e)])),
    });
    link(p('offers'), p('offers-riyadh'), `${p('offers')}-riyadh`);
    RIYADH_OFFER_BRANCHES.forEach(([key]) => link(p('offers-riyadh'), p('no-offers'), `${p('offers-riyadh')}-${key}`));

    node(p('offers-jeddah'), 'buttons', {
      text: t('عروض فروع جدة\n\nاختر الفرع الأقرب لك', 'Offers of Jeddah Branches\n\nSelect the nearest branch to you'),
      buttons: options(p('offers-jeddah'), JEDDAH_OFFER_BRANCHES.map(([key, a, e]) => [key, t(a, e)])),
    });
    link(p('offers'), p('offers-jeddah'), `${p('offers')}-jeddah`);
    JEDDAH_OFFER_BRANCHES.forEach(([key]) => link(p('offers-jeddah'), p('no-offers'), `${p('offers-jeddah')}-${key}`));

    // Single-branch cities go straight to that branch's offers.
    ['tabuk', 'qassim', 'hafar'].forEach((city) => link(p('offers'), p('no-offers'), `${p('offers')}-${city}`));

    // --- Branch locations ---
    node(p('branches'), 'list', {
      text: t('📍 الفروع\n\nتمتلك مخازن سوبر ماركت العديد من الفروع في أنحاء المملكة العربية السعودية.',
        "📍 Branches' locations\n\nMakhazin Supermarket has many branches across Saudi Arabia."),
      buttonText: t('اختر الفرع', 'Choose branch'),
      buttons: options(p('branches'), BRANCHES.map((b) => [b.key, t(`📍 فرع ${b.ar}`, `📍 ${b.en}`)])),
    });
    link(p('main'), p('branches'), `${p('main')}-branches`);
    for (const b of BRANCHES) {
      const address = t(b.arAddress, b.enAddress);
      const body = address && b.map ? `${address}\n\n${b.map}` : t('【أضف عنوان الفرع ورابط خرائط جوجل】', '【Add the branch address and Google Maps link】');
      node(p(`branch-${b.key}`), 'message', { text: `*${t(`فرع ${b.ar}`, `${b.en} branch`)}*\n${body}` });
      link(p('branches'), p(`branch-${b.key}`), `${p('branches')}-${b.key}`);
      link(p(`branch-${b.key}`), p('help'));
    }

    // --- Customer service: hand the conversation to the team ---
    node(p('cs'), 'buttons', {
      text: t('📞 خدمة العملاء\n\nيسعدنا تواصلك، اختر نوع طلبك:', '📞 Customer Service\n\nWe are glad to hear from you. Choose your request type:'),
      buttons: options(p('cs'), ar
        ? [['complaint', 'شكوى'], ['suggestion', 'اقتراح'], ['inquiry', 'استفسار']]
        : [['complaint', 'Complaint'], ['suggestion', 'Suggestion'], ['inquiry', 'Inquiry']]),
    });
    link(p('main'), p('cs'), `${p('main')}-cs`);
    for (const kind of ['complaint', 'suggestion', 'inquiry']) {
      node(p(`cs-${kind}`), 'handoff', {
        text: t('تم تحويلك لفريق خدمة العملاء، فضلًا اكتب تفاصيل طلبك وسنرد عليك في أقرب وقت.',
          'You have been transferred to our customer service team. Please write the details of your request and we will reply as soon as possible.'),
      });
      link(p('cs'), p(`cs-${kind}`), `${p('cs')}-${kind}`);
    }
  }

  link('contest', 'ar-help');
  return { nodes: layout(nodes, edges), edges };
}

// Layers by distance from the start; RTL like the editor's auto-arrange (first option on the right).
function layout(nodes, edges) {
  const depth = new Map([['start', 0]]);
  const order = ['start'];
  for (let i = 0; i < order.length; i++) {
    for (const e of edges.filter((x) => x.source === order[i])) {
      if (depth.has(e.target)) continue;
      depth.set(e.target, depth.get(order[i]) + 1);
      order.push(e.target);
    }
  }
  const layers = new Map();
  order.forEach((id) => layers.set(depth.get(id), [...(layers.get(depth.get(id)) || []), id]));
  const pos = new Map();
  for (const [d, ids] of layers) ids.forEach((id, i) => pos.set(id, { x: -i * 340, y: d * 520 }));
  return nodes.map((n) => ({ ...n, position: pos.get(n.id) || { x: 0, y: (layers.size + 1) * 520 } }));
}

module.exports = { build };
