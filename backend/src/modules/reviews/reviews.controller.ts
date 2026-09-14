import { Controller, Get, Post, Body, Param, UseGuards, Request, Patch } from '@nestjs/common';
import { ApiBearerAuth, ApiBody, ApiNotFoundResponse, ApiOperation, ApiParam, ApiResponse, ApiTags, ApiUnauthorizedResponse } from '@nestjs/swagger';
import { ReviewsService } from './reviews.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { StoresService } from '../stores/stores.service';
import { examples, ids } from '../../common/swagger/api-examples';

@ApiTags('Reviews')
@ApiBearerAuth()
@Controller('reviews')
@UseGuards(JwtAuthGuard)
export class ReviewsController {
  constructor(
    private readonly reviewsService: ReviewsService,
    private readonly storesService: StoresService,
  ) {}

  @Get()
  @ApiOperation({ summary: 'List reviews for the authenticated store' })
  @ApiResponse({ status: 200, description: 'Store reviews.', schema: { example: [examples.review.item] } })
  @ApiUnauthorizedResponse({ schema: { example: examples.errors.unauthorized } })
  @ApiNotFoundResponse({ schema: { example: examples.errors.storeNotFound } })
  async findAll(@Request() req) {
    const store = await this.storesService.findByOwner(req.user.id);
    return this.reviewsService.findAllByStore(store.id);
  }

  @Get(':id/suggestion')
  @ApiOperation({ summary: 'Generate an AI reply suggestion for one review' })
  @ApiParam({ name: 'id', example: ids.review })
  @ApiResponse({ status: 200, description: 'AI reply suggestion.', schema: { example: examples.review.suggestion } })
  @ApiUnauthorizedResponse({ schema: { example: examples.errors.unauthorized } })
  @ApiNotFoundResponse({ schema: { example: { message: 'Review not found', error: 'Not Found', statusCode: 404 } } })
  async getSuggestion(@Param('id') id: string) {
    const suggestion = await this.reviewsService.getAiSuggestion(id);
    return { suggestion };
  }

  @Post(':id/reply')
  @ApiOperation({ summary: 'Submit a reply for one review' })
  @ApiParam({ name: 'id', example: ids.review })
  @ApiBody({ schema: { type: 'object' }, examples: { default: { value: examples.review.reply } } })
  @ApiResponse({ status: 201, description: 'Review reply saved.', schema: { example: { ...examples.review.item, ...examples.review.reply, status: 'replied' } } })
  @ApiUnauthorizedResponse({ schema: { example: examples.errors.unauthorized } })
  @ApiNotFoundResponse({ schema: { example: { message: 'Review not found', error: 'Not Found', statusCode: 404 } } })
  async reply(@Param('id') id: string, @Body('reply') reply: string) {
    return this.reviewsService.replyToReview(id, reply);
  }

  // SIMULATOR ENDPOINT
  @Post('simulate')
  @ApiOperation({ summary: 'Simulate an incoming Google review' })
  @ApiBody({ schema: { type: 'object' }, examples: { default: { value: examples.review.simulate } } })
  @ApiResponse({ status: 201, description: 'Fake review created.', schema: { example: examples.review.item } })
  @ApiUnauthorizedResponse({ schema: { example: examples.errors.unauthorized } })
  @ApiNotFoundResponse({ schema: { example: examples.errors.storeNotFound } })
  async simulate(@Body() data: any, @Request() req) {
    return this.reviewsService.simulateIncomingReview(req.user.id, data);
  }
}
