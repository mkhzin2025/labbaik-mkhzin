import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { AppModule } from './app.module';
import { ValidationPipe } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule, { rawBody: true });
  // Campaign audiences can carry thousands of hand-picked customer ids.
  app.useBodyParser('json', { limit: '2mb' });

  // Enable CORS for frontend at localhost:5173
  app.enableCors({
    origin: true, // You can specify 'http://localhost:5173' for better security
    methods: 'GET,HEAD,PUT,PATCH,POST,DELETE,OPTIONS',
    credentials: true,
  });

  // Enable global validation pipe
  app.useGlobalPipes(new ValidationPipe({
    whitelist: true,
    forbidNonWhitelisted: true,
    transform: true,
  }));

  // Optional: Set global prefix for API
  // app.setGlobalPrefix('api');

  const swaggerConfig = new DocumentBuilder()
    .setTitle('Tael Bot API')
    .setDescription('API documentation for the Tael Bot customer service automation platform.')
    .setVersion('1.0')
    .addBearerAuth()
    .addSecurityRequirements('bearer')
    .build();
  const swaggerDocument = SwaggerModule.createDocument(app, swaggerConfig);
  SwaggerModule.setup('api-docs', app, swaggerDocument);

  await app.listen(process.env.PORT ?? 3000);
}
bootstrap();
