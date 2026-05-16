import 'dotenv/config';
import { DataSource } from 'typeorm';

const isProduction = process.env.NODE_ENV === 'production';

export default new DataSource({
  type: 'postgres',
  host: process.env.DB_HOST,
  port: parseInt(process.env.DB_PORT || '5432', 10),
  username: process.env.DB_USERNAME,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_DATABASE,
  entities: [isProduction ? 'dist/**/*.entity.js' : 'src/**/*.entity.ts'],
  migrations: [
    isProduction
      ? 'dist/database/migrations/*.js'
      : 'src/database/migrations/*.ts',
  ],
});

//chuẩn bị sẵn DataSource cho TypeORM migration. Khi dev thì đọc entity .ts, khi production/container build thì đọc entity .js trong dist.