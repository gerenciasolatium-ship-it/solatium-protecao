import { GetObjectCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { StorageProvider, UploadInput } from './interfaces';

/**
 * Cloudflare R2 (compatível S3). Se R2_PUBLIC_URL estiver setada (bucket com
 * domínio público), upload() devolve URL direta; senão, URL assinada de 7 dias.
 */
@Injectable()
export class R2Provider implements StorageProvider {
  private readonly cliente: S3Client;
  private readonly bucket: string;
  private readonly publicUrl?: string;

  constructor(config: ConfigService) {
    this.bucket = config.get<string>('R2_BUCKET') ?? '';
    this.publicUrl = config.get<string>('R2_PUBLIC_URL')?.replace(/\/$/, '');
    this.cliente = new S3Client({
      region: 'auto',
      endpoint: config.get<string>('R2_ENDPOINT'),
      credentials: {
        accessKeyId: config.get<string>('R2_ACCESS_KEY') ?? '',
        secretAccessKey: config.get<string>('R2_SECRET') ?? '',
      },
    });
  }

  async upload(input: UploadInput): Promise<{ url: string }> {
    await this.cliente.send(
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: input.chave,
        Body: input.conteudo,
        ContentType: input.contentType,
      }),
    );
    if (this.publicUrl) return { url: `${this.publicUrl}/${input.chave}` };
    return { url: await this.urlAssinada(input.chave, 7 * 24 * 3600) };
  }

  async urlAssinada(chave: string, expiraSegundos = 3600): Promise<string> {
    return getSignedUrl(this.cliente, new GetObjectCommand({ Bucket: this.bucket, Key: chave }), {
      expiresIn: expiraSegundos,
    });
  }
}
