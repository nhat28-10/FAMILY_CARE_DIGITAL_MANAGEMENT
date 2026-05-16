import { ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';

import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  const configService = app.get(ConfigService);
  const port = configService.get<number>('app.port') || 3000;
  const prefix = configService.get<string>('app.prefix') || 'api/v1';

  app.setGlobalPrefix(prefix);

  app.enableCors({
    origin: true,
    credentials: true,
  });

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      forbidNonWhitelisted: true,
    }),
  );
  function parseCorsOrigins(value?: string): boolean | string[] {
    if (!value || value.trim() === '') {
      return true;
    }

    if (value.trim() === '*') {
      return true;
    }

    return value
      .split(',')
      .map((origin) => origin.trim())
      .filter(Boolean);
  }

  const swaggerConfig = new DocumentBuilder()
    .setTitle('Family Care API')
    .setDescription(
      'Backend API for Family Care Digital Family Management Solution',
    )
    .setVersion('1.0')
    .addBearerAuth()
    .build();

  const document = SwaggerModule.createDocument(app, swaggerConfig);
  SwaggerModule.setup('api/docs', app, document);

  await app.listen(port, '0.0.0.0');

  const corsOrigins = parseCorsOrigins(
    configService.get<string>('cors.origins'),
  );

  const swaggerEnabled = configService.get<boolean>('swagger.enabled') ?? true;

  app.enableCors({
    origin: corsOrigins,
    credentials: true,
  });

  if (swaggerEnabled) {
    const swaggerConfig = new DocumentBuilder()
      .setTitle('Family Care API')
      .setDescription(
        'Backend API for Family Care Digital Family Management Solution',
      )
      .setVersion('1.0')
      .addBearerAuth()
      .build();

    const document = SwaggerModule.createDocument(app, swaggerConfig);
    SwaggerModule.setup('api/docs', app, document);
  }
}

bootstrap().catch((error) => {
  console.error('Failed to start application:', error);
  process.exit(1);
});
