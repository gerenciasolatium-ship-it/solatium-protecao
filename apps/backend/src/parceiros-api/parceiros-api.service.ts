import {
  ForbiddenException,
  GoneException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { ParceiroChaveApi, Prisma } from '@prisma/client';
import type { UsuarioAutenticado } from '../common/decorators/current-user.decorator';
import { normalizarCpf } from '../common/validators/cpf.util';
import { PrismaService } from '../prisma/prisma.service';
import { gerarChaveApi, gerarCodigoProposta, hashChaveApi, PREFIXO_CHAVE } from './chave-api.util';
import { CreateChaveApiDto } from './dto/create-chave-api.dto';
import { CreatePropostaExternaDto } from './dto/create-proposta-externa.dto';

/** Validade padrão do link pré-preenchido gerado pelo CRM do parceiro. */
const VALIDADE_PROPOSTA_DIAS = 7;

@Injectable()
export class ParceirosApiService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {}

  /* ----------------------- Chaves (admin/backoffice) ---------------------- */

  async criarChave(lojaId: string, dto: CreateChaveApiDto) {
    const loja = await this.prisma.loja.findUnique({ where: { id: lojaId } });
    if (!loja) throw new NotFoundException('Loja não encontrada.');

    const { chave, prefixo, hash } = gerarChaveApi();
    const criada = await this.prisma.parceiroChaveApi.create({
      data: { lojaId, nome: dto.nome, prefixo, chaveHash: hash },
    });
    // A chave completa aparece SÓ aqui — depois disso só existe o hash.
    return { id: criada.id, nome: criada.nome, prefixo: criada.prefixo, chave };
  }

  listarChaves(lojaId: string) {
    return this.prisma.parceiroChaveApi.findMany({
      where: { lojaId },
      select: {
        id: true,
        nome: true,
        prefixo: true,
        ativo: true,
        ultimoUsoEm: true,
        createdAt: true,
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async revogarChave(lojaId: string, id: string) {
    const chave = await this.prisma.parceiroChaveApi.findUnique({ where: { id } });
    if (!chave || chave.lojaId !== lojaId) throw new NotFoundException('Chave não encontrada.');
    return this.prisma.parceiroChaveApi.update({
      where: { id },
      data: { ativo: false },
      select: { id: true, nome: true, prefixo: true, ativo: true },
    });
  }

  /* ----------------------- Autenticação por x-api-key --------------------- */

  async autenticarChave(chave?: string): Promise<ParceiroChaveApi> {
    if (!chave || !chave.startsWith(PREFIXO_CHAVE)) {
      throw new UnauthorizedException('Informe a chave de API no header x-api-key.');
    }
    const registro = await this.prisma.parceiroChaveApi.findUnique({
      where: { chaveHash: hashChaveApi(chave) },
    });
    if (!registro || !registro.ativo) {
      throw new UnauthorizedException('Chave de API inválida ou revogada.');
    }
    void this.prisma.parceiroChaveApi
      .update({ where: { id: registro.id }, data: { ultimoUsoEm: new Date() } })
      .catch(() => undefined); // marcação de uso é best-effort
    return registro;
  }

  /* ----------------------- Propostas (CRM do parceiro) -------------------- */

  async criarProposta(chave: ParceiroChaveApi, dto: CreatePropostaExternaDto) {
    const payload = {
      cliente: { ...dto.cliente, cpf: normalizarCpf(dto.cliente.cpf) },
      aparelho: dto.aparelho ?? null,
    };
    const expiraEm = new Date(Date.now() + VALIDADE_PROPOSTA_DIAS * 24 * 60 * 60 * 1000);
    const proposta = await this.prisma.propostaExterna.create({
      data: {
        codigo: gerarCodigoProposta(),
        lojaId: chave.lojaId,
        chaveApiId: chave.id,
        referenciaExterna: dto.referenciaExterna,
        payload: payload as Prisma.InputJsonValue,
        expiraEm,
      },
    });
    return {
      id: proposta.id,
      status: proposta.status,
      link: this.linkProposta(proposta.codigo),
      expiraEm: proposta.expiraEm,
      referenciaExterna: proposta.referenciaExterna,
    };
  }

  async consultarProposta(chave: ParceiroChaveApi, id: string) {
    const proposta = await this.prisma.propostaExterna.findUnique({
      where: { id },
      include: {
        contrato: {
          select: {
            id: true,
            status: true,
            certificado: { select: { numero: true, status: true, vigenciaFim: true } },
          },
        },
      },
    });
    if (!proposta || proposta.lojaId !== chave.lojaId) {
      throw new NotFoundException('Proposta não encontrada.');
    }
    const expirada = proposta.status === 'ABERTA' && proposta.expiraEm < new Date();
    return {
      id: proposta.id,
      status: expirada ? 'EXPIRADA' : proposta.status,
      link: this.linkProposta(proposta.codigo),
      referenciaExterna: proposta.referenciaExterna,
      utilizadaEm: proposta.utilizadaEm,
      expiraEm: proposta.expiraEm,
      contrato: proposta.contrato,
      createdAt: proposta.createdAt,
    };
  }

  /* ----------------------- Consumo pelo app-loja -------------------------- */

  async abrirPropostaPorCodigo(codigo: string, usuario: UsuarioAutenticado) {
    const proposta = await this.prisma.propostaExterna.findUnique({ where: { codigo } });
    if (!proposta) throw new NotFoundException('Proposta não encontrada.');
    // Vendedor/admin de loja só abre proposta da própria loja.
    if (usuario.lojaId && usuario.lojaId !== proposta.lojaId) {
      throw new ForbiddenException('Esta proposta pertence a outra loja.');
    }
    if (proposta.status === 'EXPIRADA' || proposta.expiraEm < new Date()) {
      throw new GoneException('Proposta expirada — peça ao parceiro para gerar outra.');
    }
    if (proposta.status === 'ABERTA') {
      await this.prisma.propostaExterna.update({
        where: { id: proposta.id },
        data: { status: 'UTILIZADA', utilizadaEm: new Date() },
      });
    }
    return {
      codigo: proposta.codigo,
      referenciaExterna: proposta.referenciaExterna,
      payload: proposta.payload,
    };
  }

  /** Chamado pelo fluxo de contratos: proposta virou venda. */
  async concluirProposta(codigo: string, contratoId: string, lojaId: string) {
    await this.prisma.propostaExterna.updateMany({
      where: { codigo, lojaId, status: { in: ['ABERTA', 'UTILIZADA'] } },
      data: { status: 'CONCLUIDA', contratoId },
    });
  }

  private linkProposta(codigo: string): string {
    const base =
      this.config.get<string>('APP_LOJA_URL')?.replace(/\/$/, '') ?? 'http://localhost:5173';
    return `${base}/protecao/nova?proposta=${codigo}`;
  }
}
