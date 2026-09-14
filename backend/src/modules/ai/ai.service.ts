import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import OpenAI from 'openai';
import { GoogleGenerativeAI } from '@google/generative-ai';

@Injectable()
export class AiService implements OnModuleInit {
  private readonly logger = new Logger(AiService.name);
  private openai: OpenAI;
  private groq: OpenAI;
  private deepseek: OpenAI;
  private gemini: any;

  constructor(private readonly configService: ConfigService) {}

  onModuleInit() {
    const openAiKey = this.configService.get<string>('OPENAI_API_KEY');
    if (openAiKey) this.openai = new OpenAI({ apiKey: openAiKey });

    const groqKey = this.configService.get<string>('GROQ_API_KEY');
    if (groqKey) this.groq = new OpenAI({ apiKey: groqKey, baseURL: 'https://api.groq.com/openai/v1' });

    const deepseekKey = this.configService.get<string>('DEEPSEEK_API_KEY');
    if (deepseekKey) {
      this.deepseek = new OpenAI({ apiKey: deepseekKey, baseURL: 'https://api.deepseek.com' });
    }

    const geminiKey = this.configService.get<string>('GEMINI_API_KEY');
    if (geminiKey) {
      const genAI = new GoogleGenerativeAI(geminiKey);
      this.gemini = genAI.getGenerativeModel({ model: 'gemini-1.5-flash' });
    }
  }

  async generateResponse(customerMessage: string, storeContext: any): Promise<string> {
    const systemPrompt = `
      أنت "لبيك"، مساعد ذكاء اصطناعي ذكي لمتجر "${storeContext.name}".
      
      قاعدة المعرفة الخاصة بالمتجر:
      """
      ${storeContext.knowledgeBase || "لا توجد معلومات محددة حالياً."}
      """

      قواعد صارمة للرد:
      1. المصدر الوحيد: اعتمد فقط على "قاعدة المعرفة" أعلاه للرد على أي استفسار.
      2. ممنوع التأليف (Hallucination): لا تخترع أي معلومات، أسعار، عروض، أو تفاصيل غير موجودة في قاعدة المعرفة.
      3. في حال عدم وجود إجابة: إذا سألك العميل عن شيء (مثل العروض أو أسعار معينة) وهو غير موجود في قاعدة المعرفة، قل بوضوح: "حالياً لا تتوفر لدينا معلومات عن هذا الطلب، لكن بإمكانك الانتظار قليلاً ليرد عليك الموظف المختص".
      4. اللهجة: تحدث بلهجة سعودية بيضاء، ودودة، ومحترمة.
      5. الاختصار: كن قصيراً ومباشراً في ردودك.
    `;

    const preferred = storeContext.preferredModel || 'groq';
    const order = this.getModelExecutionOrder(preferred);

    for (const model of order) {
      const response = await this.tryModelResponse(model, systemPrompt, customerMessage);
      if (response) return response;
    }

    return `أعتذر منك، واجهت مشكلة في معالجة طلبك حالياً. سأقوم بتحويلك للموظف المختص.`;
  }

  async analyzeSentiment(message: string): Promise<'positive' | 'neutral' | 'negative'> {
    const prompt = `Analyze sentiment of this Arabic message. Reply only with "positive", "neutral", or "negative".\n\nMessage: "${message}"`;
    const order = ['deepseek_groq', 'groq', 'deepseek', 'gemini'];
    for (const model of order) {
      const result = await this.tryModelResponse(model, '', prompt, true);
      if (result) {
        const text = result.toLowerCase();
        if (text.includes('positive')) return 'positive';
        if (text.includes('negative')) return 'negative';
        return 'neutral';
      }
    }
    return 'neutral';
  }

  async categorizeMessage(message: string): Promise<string[]> {
    const prompt = `
      Analyze the following Arabic message from a customer and return a list of appropriate tags (comma separated).
      Tags should be from this list if applicable: "استفسار_سعر", "طلب_جديد", "شكوى", "شكر_ومدح", "موقع_المحل", "سؤال_عام".
      If none apply, return "سؤال_عام". Return ONLY the tags.
      
      Message: "${message}"
      Tags:`;

    const order = ['deepseek_groq', 'groq', 'deepseek'];
    for (const model of order) {
      const result = await this.tryModelResponse(model, '', prompt, true);
      if (result) {
        return result.split(',').map(t => t.trim()).filter(t => t.length > 0);
      }
    }
    return ['سؤال_عام'];
  }

  async generateReviewReply(reviewerName: string, rating: number, comment: string, storeContext: any): Promise<string> {
    const systemPrompt = `
      أنت "مدير السمعة الرقمية" لمتجر "${storeContext.name}". 
      مهمتك: الرد على مراجعة العميل "${reviewerName}" بذكاء، فخامة، وانضباط تام.

      البيانات المتاحة لك عن المتجر:
      """
      ${storeContext.knowledgeBase || "متجر سعودي متميز بخدمة عملاء احترافية."}
      """

      قواعد السلوك الصارمة (لا تخرج عنها أبداً):
      1. اللهجة: سعودية بيضاء، فخمة، وودودة جداً.
      2. الترحيب: ابدأ بذكر اسم العميل مرة واحدة فقط في بداية الرد باستخدام تحية واحدة فقط (مثلاً: "حياك الله يا ${reviewerName}" أو "أهلاً بك يا ${reviewerName}"). ممنوع تكرار التحية أو الاسم مرتين.
      3. التحليل الذكي: إذا مدح العميل شيئاً (مثل: جودة، توصيل، سعر)، اشكره عليه تحديداً بأسلوب طبيعي.
      4. ممنوع التكرار: لا تكرر نفس جمل العميل حرفياً، بل أعد صياغتها في سياق الشكر.
      5. الانضباط: لا تخترع أسماء موظفين، لا تذكر عروضاً غير موجودة، لا تعد بشيء لا نملكه.
      6. في حال التقييم السلبي (1-2 نجوم): اعتذر فوراً وبأسلوب يمتص الغضب، وأكد أن "رضاه هو غايتنا"، وادعه للتواصل معنا لحل المشكلة.
      7. الطول: (2-3 جمل كحد أقصى). كن مختصراً وبليغاً.
      8. الخاتمة: لا تضع توقيعاً مثل "فريق العمل"، اجعل الرد ينتهي بدعوة صادقة للزيارة.
    `;

    const userPrompt = `التقييم: ${rating} نجوم\nالتعليق: "${comment || 'بدون تعليق'}"\nالرد المقترح:`;
    
    const preferred = storeContext.preferredModel || 'groq';
    const order = this.getModelExecutionOrder(preferred);

    for (const model of order) {
      const response = await this.tryModelResponse(model, systemPrompt, userPrompt);
      if (response) return response;
    }
    return `شكراً لك يا ${reviewerName} على ثقتك بنا في ${storeContext.name}.`;
  }

  private getModelExecutionOrder(preferred: string): string[] {
    const all = ['deepseek_groq', 'groq', 'deepseek', 'gemini', 'openai'];
    return [preferred, ...all.filter(m => m !== preferred)];
  }

  private async tryModelResponse(model: string, system: string, user: string, short = false): Promise<string | null> {
    try {
      // 1. DeepSeek via Groq (Super Fast - Using existing Groq Key)
      if (model === 'deepseek_groq' && this.groq) {
        const res = await this.groq.chat.completions.create({
          model: 'deepseek-r1-distill-qwen-32b',
          messages: [{ role: 'system', content: system }, { role: 'user', content: user }],
          max_tokens: short ? 10 : 500,
          temperature: 0.3
        });
        return res.choices[0].message.content;
      }
      
      // 2. Standard Llama via Groq
      if (model === 'groq' && this.groq) {
        const res = await this.groq.chat.completions.create({
          model: 'llama-3.1-8b-instant',
          messages: [{ role: 'system', content: system }, { role: 'user', content: user }],
          max_tokens: short ? 10 : 500,
          temperature: 0.3
        });
        return res.choices[0].message.content;
      }

      // 3. Official DeepSeek API
      if (model === 'deepseek' && this.deepseek) {
        const res = await this.deepseek.chat.completions.create({
          model: 'deepseek-chat',
          messages: [{ role: 'system', content: system }, { role: 'user', content: user }],
          max_tokens: short ? 10 : 500,
          temperature: 0.3
        });
        return res.choices[0].message.content;
      }

      // 4. Google Gemini
      if (model === 'gemini' && this.gemini) {
        const res = await this.gemini.generateContent({
          contents: [{ role: 'user', parts: [{ text: `${system}\n\nUser: ${user}` }] }]
        });
        return (await res.response).text();
      }

      // 5. OpenAI
      if (model === 'openai' && this.openai) {
        const res = await this.openai.chat.completions.create({
          model: 'gpt-3.5-turbo',
          messages: [{ role: 'system', content: system }, { role: 'user', content: user }],
          max_tokens: short ? 10 : 500
        });
        return res.choices[0].message.content;
      }
    } catch (e) {
      this.logger.error(`Model ${model} failed: ${e.message}`);
    }
    return null;
  }
}
