import { CallHandler, ExecutionContext, Injectable, Logger, NestInterceptor } from '@nestjs/common';
import { Observable } from 'rxjs';
import { tap } from 'rxjs/operators';
import type { Request } from 'express';
import { PrismaService } from '../../prisma/prisma.service';
import type { UsuarioAutenticado } from '../decorators/current-user.decorator';

const ACAO_POR_METODO: Record<string, string> = {
  POST: 'CREATE',
  PUT: 'UPDATE',
  PATCH: 'UPDATE',
  DELETE: 'DELETE',
};

/**
 * Interceptor global que registra TODA mutação (POST/PUT/PATCH/DELETE) em audit_log:
 * quem (usuarioId), o quê (ação + entidade + id), quando e o payload resultante (depois).
 * Leituras (GET) não são auditadas. Falha de auditoria nunca quebra a requisição.
 */
@Injectable()
export class AuditInterceptor implements NestInterceptor {
  private readonly logger = new Logger('Audit');

  constructor(private readonly prisma: PrismaService) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const req = context.switchToHttp().getRequest<Request>();
    const acao = ACAO_POR_METODO[req.method];

    if (!acao) return next.handle();

    const usuario = req.user as UsuarioAutenticado | undefined;
    const entidade = this.extrairEntidade(req.path);
    const ip = req.ip;

    return next.handle().pipe(
      tap((resposta) => {
        const entidadeId = this.extrairId(req, resposta);
        this.prisma.auditLog
          .create({
            data: {
              usuarioId: usuario?.id ?? null,
              acao,
              entidade,
              entidadeId,
              depois: this.serializar(resposta),
              ip: ip ?? null,
            },
          })
          .catch((err) => this.logger.error(`Falha ao gravar audit_log: ${err.message}`));
      }),
    );
  }

  private extrairEntidade(path: string): string {
    // /api/lojas/123 -> "lojas"
    const partes = path.split('/').filter(Boolean);
    const idx = partes[0] === 'api' ? 1 : 0;
    return partes[idx] ?? 'desconhecida';
  }

  private extrairId(req: Request, resposta: unknown): string | null {
    if (req.params && typeof req.params.id === 'string') return req.params.id;
    if (resposta && typeof resposta === 'object' && 'id' in resposta) {
      const id = (resposta as { id: unknown }).id;
      return typeof id === 'string' ? id : null;
    }
    return null;
  }

  private serializar(valor: unknown): object | undefined {
    if (!valor || typeof valor !== 'object') return undefined;
    // Remove campos sensíveis antes de persistir.
    const clone = JSON.parse(JSON.stringify(valor));
    this.limparSensiveis(clone);
    return clone;
  }

  private limparSensiveis(obj: unknown): void {
    if (!obj || typeof obj !== 'object') return;
    for (const chave of Object.keys(obj as Record<string, unknown>)) {
      if (/senha|password|token|hash/i.test(chave)) {
        (obj as Record<string, unknown>)[chave] = '[REDACTED]';
      } else {
        this.limparSensiveis((obj as Record<string, unknown>)[chave]);
      }
    }
  }
}
