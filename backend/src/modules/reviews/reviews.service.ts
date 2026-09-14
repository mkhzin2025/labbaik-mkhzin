import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Review } from './entities/review.entity';
import { AiService } from '../ai/ai.service';
import { StoresService } from '../stores/stores.service';
import { NotificationsService } from '../notifications/notifications.service';

@Injectable()
export class ReviewsService {
  constructor(
    @InjectRepository(Review)
    private readonly reviewRepository: Repository<Review>,
    private readonly aiService: AiService,
    private readonly storesService: StoresService,
    private readonly notificationsService: NotificationsService,
  ) {}

  async findAllByStore(storeId: string) {
    return this.reviewRepository.find({
      where: { store: { id: storeId } },
      order: { createdAt: 'DESC' },
    });
  }

  async findOne(id: string) {
    const review = await this.reviewRepository.findOne({
      where: { id },
      relations: ['store'],
    });
    if (!review) throw new NotFoundException('Review not found');
    return review;
  }

  // Generate an AI suggestion for a review
  async getAiSuggestion(reviewId: string) {
    const review = await this.findOne(reviewId);
    
    return this.aiService.generateReviewReply(
      review.reviewerName,
      review.rating,
      review.comment,
      { name: review.store.name, knowledgeBase: review.store.knowledgeBase }
    );
  }

  // Submit a reply to a review
  async replyToReview(reviewId: string, replyText: string) {
    const review = await this.findOne(reviewId);
    
    // In production, this would call Google Business Profile API to post the reply
    // For now, we simulate success and save locally
    review.reply = replyText;
    review.status = 'replied';
    
    return this.reviewRepository.save(review);
  }

  // Simulator: Create a fake review for testing
  async simulateIncomingReview(storeId: string, data: any) {
    const store = await this.storesService.findByOwner(storeId); // Actually find by store context
    
    const review = this.reviewRepository.create({
      reviewerName: data.name || 'عميل تجريبي',
      reviewerPhotoUrl: data.photoUrl,
      rating: data.rating || 5,
      comment: data.comment || 'تجربة رائعة جداً، أنصح بالتعامل معهم!',
      store: store,
      status: 'pending'
    });

    const saved = await this.reviewRepository.save(review);

    // Notify the owner
    const ownerId = store.owner?.id || store.owner;
    if (ownerId) {
      this.notificationsService.create(String(ownerId), {
        type: 'new_review',
        title: 'تقييم جديد في جوجل ماب',
        message: `${saved.reviewerName} قيم متجرك بـ ${saved.rating} نجوم.`,
        link: '/dashboard/reviews'
      });
    }

    return saved;
  }
}
