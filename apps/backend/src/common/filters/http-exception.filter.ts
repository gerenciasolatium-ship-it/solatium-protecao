import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import type { Request, Response } from 'express';

/**
 * Padroniza os erros da API em português, com formato estável:
 * { statusCode, erro, mensagem, caminho, timestamp }
 */
@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger('HttpException');

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const res = ctx.getResponse<Response>();
    const req = ctx.getRequest<Request>();

    let status = HttpStatus.INTERNAL_SERVER_ERROR;
    let mensagem: string | string[] = 'Erro interno no servidor.';
    let erro = 'Erro interno';

    if (exception instanceof HttpException) {
      status = exception.getStatus();
      const resposta = exception.getResponse();
      if (typeof resposta === 'string') {
        mensagem = resposta;
      } else if (typeof resposta === 'object' && resposta !== null) {
        const r = resposta as Record<string, unknown>;
        mensagem = (r.message as string | string[]) ?? mensagem;
        erro = (r.error as string) ?? exception.name;
      }
    } else if (exception instanceof Error) {
      this.logger.error(exception.message, exception.stack);
    }

    res.status(status).json({
      statusCode: status,
      erro,
      mensagem,
      caminho: req.url,
      timestamp: new Date().toISOString(),
    });
  }
}
