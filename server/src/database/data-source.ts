import * as dotenv from 'dotenv';
import { DataSource } from 'typeorm';

const env = process.env.NODE_ENV || process.env.APP_ENV || 'local';

dotenv.config({ path: '.env' });
dotenv.config({ path: `.env.${env}`, override: true });

const isProduction = process.env.NODE_ENV === 'production';

export default new DataSource({
  type: 'postgres',
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT || '5432', 10),
  username: process.env.DB_USERNAME || 'postgres',
  password: process.env.DB_PASSWORD || 'postgres',
  database: process.env.DB_DATABASE || 'family_care_dev',
  entities: [isProduction ? 'dist/**/*.entity.js' : 'src/**/*.entity.ts'],
  migrations: [
    isProduction
      ? 'dist/database/migrations/*.js'
      : 'src/database/migrations/*.ts',
  ],
});
