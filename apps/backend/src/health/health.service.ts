import { Injectable, Logger, OnModuleDestroy, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class HealthService implements OnModuleDestroy {
  private readonly logger = new Logger('Health');
  private redis: Redis | null = null;

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {
    const url = this.config.get<string>('REDIS_URL');
    if (url) {
      this.redis = new Redis(url, {
        lazyConnect: true,
        maxRetriesPerRequest: 1,
        enableOfflineQueue: false,
      });
      this.redis.on('error', (e) => this.logger.warn(`Redis: ${e.message}`));
    }
  }

  async check() {
    const [postgres, redis] = await Promise.all([this.checkPostgres(), this.checkRedis()]);
    const status = postgres && redis ? 'ok' : 'degraded';
    const body = {
      status,
      servicos: {
        postgres: postgres ? 'up' : 'down',
        redis: redis ? 'up' : this.redis ? 'down' : 'nao-configurado',
      },
      timestamp: new Date().toISOString(),
    };
    if (!postgres) throw new ServiceUnavailableException(body);
    return body;
  }

  private async checkPostgres(): Promise<boolean> {
    try {
      await this.prisma.$queryRaw`SELECT 1`;
      return true;
    } catch (e) {
      this.logger.error(`Postgres down: ${(e as Error).message}`);
      return false;
    }
  }

  private async checkRedis(): Promise<boolean> {
    if (!this.redis) return true; // Redis é opcional nesta sprint (filas entram na S5).
    try {
      if (this.redis.status !== 'ready') await this.redis.connect();
      const pong = await this.redis.ping();
      return pong === 'PONG';
    } catch (e) {
      this.logger.warn(`Redis down: ${(e as Error).message}`);
      return false;
    }
  }

  async onModuleDestroy() {
    if (this.redis) await this.redis.quit().catch(() => undefined);
  }
}
