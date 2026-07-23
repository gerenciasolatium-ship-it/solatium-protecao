import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  GoneException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomInt } from 'crypto';
import type { Prisma } from '@prisma/client';
import type { Paginacao } from '@solatium/shared';
import { PrismaService } from '../prisma/prisma.service';
import { PaginacaoQueryDto } from '../common/dto/paginacao.dto';
import { UsuarioAutenticado } from '../common/decorators/current-user.decorator';
import { AparelhosService } from '../aparelhos/aparelhos.service';
import {
  MESSAGING_PROVIDER,
  MessagingProvider,
  STORAGE_PROVIDER,
  StorageProvider,
} from '../integrations/interfaces';
import { CreateVistoriaDto } from './dto/create-vistoria.dto';
import { ConcluirVistoriaRemotaDto } from './dto/concluir-vistoria-remota.dto';
import {
  DISPOSITIVO_MAX,
  TOKEN_VALIDADE_MINUTOS,
  conferirDispositivo,
  gerarTokenPublico,
  hashFoto,
  identificarDispositivo,
  imeiConfere,
  normalizarImei,
  tokenExpirado,
  validarFotos,
} from './vistoria-remota.util';

const CODIGO_VALIDADE_MINUTOS = 10;

/**
 * Vistoria remota antifraude (M2): o link vai pro WhatsApp do CLIENTE, que
 * conclui a vistoria no próprio aparelho (IMEI + 3 fotos + geo + metadados).
 * IMEI confere → APROVADA automática; divergente → EM_ANALISE (backoffice).
 * A aprovação manual é EXCEÇÃO restrita a ADMIN/OPERADOR — o vendedor não
 * consegue mais liberar o checkout sem o cliente concluir a vistoria.
 */
@Injectable()
export class VistoriasService {
  private readonly logger = new Logger(VistoriasService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly aparelhos: AparelhosService,
    private readonly config: ConfigService,
    @Inject(MESSAGING_PROVIDER) private readonly whatsapp: MessagingProvider,
    @Inject(STORAGE_PROVIDER) private readonly storage: StorageProvider,
  ) {}

  async create(dto: CreateVistoriaDto, usuario: UsuarioAutenticado) {
    const aparelho = await this.prisma.aparelho.findUnique({
      where: { id: dto.aparelhoId },
      include: { cliente: true },
    });
    if (!aparelho) throw new NotFoundException('Aparelho não encontrado.');

    if (await this.aparelhos.imeiTemProtecaoAtiva(aparelho.imei)) {
      throw new ConflictException('Este IMEI já possui uma proteção ativa no sistema.');
    }

    const vendedor = await this.resolverVendedor(usuario);

    const vistoria = await this.prisma.vistoria.create({
      data: {
        aparelhoId: aparelho.id,
        clienteId: aparelho.clienteId,
        vendedorId: vendedor.id,
        lojaId: vendedor.lojaId,
        codigoDinamico: String(randomInt(0, 1_000_000)).padStart(6, '0'),
        codigoExpiraEm: new Date(Date.now() + CODIGO_VALIDADE_MINUTOS * 60_000),
        tokenPublico: gerarTokenPublico(),
        tokenExpiraEm: new Date(Date.now() + TOKEN_VALIDADE_MINUTOS * 60_000),
      },
      include: { aparelho: true, cliente: true },
    });

    await this.enviarLink(vistoria.id);
    return this.prisma.vistoria.findUniqueOrThrow({
      where: { id: vistoria.id },
      include: { aparelho: true, cliente: true },
    });
  }

  /** Link expirou ou o cliente não recebeu → novo token + reenvio (sem recomeçar). */
  async reenviarLink(id: string, usuario: UsuarioAutenticado) {
    const vistoria = await this.garantirExiste(id);
    this.autorizarLoja(vistoria.lojaId, usuario);
    if (vistoria.status === 'APROVADA' || vistoria.status === 'REPROVADA') {
      throw new ConflictException(`Vistoria já ${vistoria.status}; não há link para reenviar.`);
    }
    await this.prisma.vistoria.update({
      where: { id },
      data: {
        tokenPublico: gerarTokenPublico(),
        tokenExpiraEm: new Date(Date.now() + TOKEN_VALIDADE_MINUTOS * 60_000),
      },
    });
    await this.enviarLink(id);
    return this.prisma.vistoria.findUniqueOrThrow({
      where: { id },
      include: { aparelho: true, cliente: true },
    });
  }

  /**
   * Aprovação MANUAL — exceção do backoffice (ADMIN/OPERADOR no controller),
   * ex.: cliente sem WhatsApp. Fica auditada; o fluxo normal é o link remoto.
   */
  async aprovar(id: string, usuario: UsuarioAutenticado) {
    const vistoria = await this.garantirExiste(id);
    this.autorizarLoja(vistoria.lojaId, usuario);
    if (vistoria.status === 'APROVADA') return vistoria;
    if (vistoria.status === 'REPROVADA') {
      throw new ConflictException('Vistoria reprovada não pode ser aprovada; inicie uma nova.');
    }
    return this.prisma.vistoria.update({
      where: { id },
      data: { status: 'APROVADA' },
      include: { aparelho: true, cliente: true },
    });
  }

  async reprovar(id: string, motivo: string, usuario: UsuarioAutenticado) {
    const vistoria = await this.garantirExiste(id);
    this.autorizarLoja(vistoria.lojaId, usuario);
    return this.prisma.vistoria.update({
      where: { id },
      data: { status: 'REPROVADA', motivoReprova: motivo },
    });
  }

  // ---------------------------------------------------------------------------
  // Fluxo público (cliente, via token do link — sem login)
  // ---------------------------------------------------------------------------

  /** Dados mínimos pra página pública (NUNCA expõe o IMEI esperado). */
  async consultarPorToken(token: string) {
    const vistoria = await this.buscarPorToken(token);
    const expirado = tokenExpirado(vistoria.tokenExpiraEm);
    return {
      status: expirado && vistoria.status === 'PENDENTE' ? 'EXPIRADO' : vistoria.status,
      expiraEm: vistoria.tokenExpiraEm,
      clientePrimeiroNome: vistoria.cliente.nome.trim().split(/\s+/)[0],
      aparelho: { marca: vistoria.aparelho.marca, modelo: vistoria.aparelho.modelo },
      loja: vistoria.loja.nome,
      concluidaEm: vistoria.concluidaEm,
    };
  }

  /**
   * Conclusão pelo cliente: valida token/fotos, confere o IMEI digitado com o
   * cadastrado na etapa Dados, guarda evidências (fotos com hash SHA-256,
   * geolocalização, metadados do navegador) e decide:
   * IMEI confere → APROVADA; divergente → EM_ANALISE (sinalizada pro backoffice).
   */
  async concluirPorToken(token: string, dto: ConcluirVistoriaRemotaDto) {
    const vistoria = await this.buscarPorToken(token);
    if (vistoria.status === 'APROVADA' || vistoria.concluidaEm) {
      return { status: vistoria.status, mensagem: 'Vistoria já concluída.' };
    }
    if (vistoria.status === 'REPROVADA') {
      throw new ConflictException('Esta vistoria foi reprovada. Procure o vendedor na loja.');
    }
    if (tokenExpirado(vistoria.tokenExpiraEm)) {
      throw new GoneException(
        'Este link expirou. Peça ao vendedor para reenviar o link de vistoria.',
      );
    }

    const problemas = validarFotos(dto.fotos);
    if (problemas.length) throw new BadRequestException(problemas.join(' '));

    // Evidências: R2 quando configurado; sem R2 as fotos ficam no banco
    // (base64) para não perder a prova da contratação.
    const fotos = [] as Array<Record<string, string>>;
    for (const foto of dto.fotos) {
      const hash = hashFoto(foto.base64);
      const { url } = await this.storage.upload({
        chave: `vistorias/${vistoria.id}/${foto.tipo}.jpg`,
        conteudo: Buffer.from(foto.base64, 'base64'),
        contentType: 'image/jpeg',
      });
      fotos.push(
        url.startsWith('stub://')
          ? { tipo: foto.tipo, url, hashSha256: hash, base64: foto.base64 }
          : { tipo: foto.tipo, url, hashSha256: hash },
      );
    }

    const confere = imeiConfere(dto.imei, vistoria.aparelho.imei);
    // Antifraude: a vistoria deve ser feita DO PRÓPRIO aparelho segurado —
    // plataforma trocada (Apple×Android) ou navegador de PC derruba pra análise.
    const dispositivo = identificarDispositivo(dto.dispositivo);
    const compat = conferirDispositivo(dispositivo, vistoria.aparelho);
    const aprovada = confere && compat.compativel !== false;
    const motivos: string[] = [];
    if (!confere) {
      motivos.push(
        `IMEI divergente na vistoria remota (final ...${normalizarImei(dto.imei).slice(-4)} ≠ cadastrado ...${vistoria.aparelho.imei.slice(-4)}).`,
      );
    }
    if (compat.compativel === false) {
      motivos.push(`Dispositivo divergente: ${compat.motivo}.`);
    }
    const atualizada = await this.prisma.vistoria.update({
      where: { id: vistoria.id },
      data: {
        imeiInformado: normalizarImei(dto.imei),
        fotos: fotos as unknown as Prisma.InputJsonValue,
        geolocalizacao: dto.geolocalizacao
          ? (dto.geolocalizacao as unknown as Prisma.InputJsonValue)
          : undefined,
        deviceFingerprint: JSON.stringify({
          identificado: dispositivo,
          compativel: compat.compativel,
          bruto: dto.dispositivo,
        }).slice(0, DISPOSITIVO_MAX * 2),
        concluidaEm: new Date(),
        status: aprovada ? 'APROVADA' : 'EM_ANALISE',
        motivoReprova: aprovada ? null : motivos.join(' '),
      },
    });
    await this.audit(vistoria.id, {
      evento: 'vistoria_remota_concluida',
      imeiConfere: confere,
      dispositivo: dispositivo as unknown as Prisma.InputJsonValue,
      dispositivoCompativel: compat.compativel,
      fotos: fotos.map((f) => ({ tipo: f.tipo, hashSha256: f.hashSha256 })),
      geolocalizacao: dto.geolocalizacao ?? null,
    });
    this.logger.log(
      `Vistoria ${vistoria.id} concluída pelo cliente — ${aprovada ? 'APROVADA' : `EM_ANALISE (${motivos.join(' ')})`}`,
    );
    return {
      status: atualizada.status,
      mensagem: aprovada
        ? 'Vistoria aprovada! Pode voltar ao balcão para concluir a contratação.'
        : !confere
          ? 'Vistoria recebida, mas o IMEI não confere com o cadastrado. Nossa equipe vai analisar — avise o vendedor.'
          : 'Vistoria recebida, mas precisa ser feita do próprio aparelho que está sendo protegido. Nossa equipe vai analisar — avise o vendedor.',
    };
  }

  async findAll(
    query: PaginacaoQueryDto,
    usuario: UsuarioAutenticado,
  ): Promise<Paginacao<unknown>> {
    const { pagina, porPagina, busca } = query;
    const where: Prisma.VistoriaWhereInput = {
      ...(usuario.lojaId ? { lojaId: usuario.lojaId } : {}),
      ...(busca
        ? {
            OR: [
              { cliente: { nome: { contains: busca, mode: 'insensitive' } } },
              { aparelho: { imei: { contains: busca } } },
            ],
          }
        : {}),
    };

    const [itens, total] = await this.prisma.$transaction([
      this.prisma.vistoria.findMany({
        where,
        skip: (pagina - 1) * porPagina,
        take: porPagina,
        orderBy: { createdAt: 'desc' },
        include: {
          aparelho: true,
          cliente: { select: { id: true, nome: true, cpf: true } },
          contrato: { select: { id: true, status: true } },
        },
      }),
      this.prisma.vistoria.count({ where }),
    ]);
    return { itens, total, pagina, porPagina };
  }

  async findOne(id: string, usuario: UsuarioAutenticado) {
    const vistoria = await this.prisma.vistoria.findUnique({
      where: { id },
      include: { aparelho: true, cliente: true, contrato: true },
    });
    if (!vistoria) throw new NotFoundException('Vistoria não encontrada.');
    this.autorizarLoja(vistoria.lojaId, usuario);
    return vistoria;
  }

  // ---------------------------------------------------------------------------
  // Internos
  // ---------------------------------------------------------------------------

  /** Envia o link de vistoria pro WhatsApp do CLIENTE (nunca do vendedor). */
  private async enviarLink(vistoriaId: string) {
    const vistoria = await this.prisma.vistoria.findUniqueOrThrow({
      where: { id: vistoriaId },
      include: { cliente: true, aparelho: true },
    });
    const base = (this.config.get<string>('APP_LOJA_URL') ?? 'http://localhost:5173').replace(
      /\/$/,
      '',
    );
    const link = `${base}/vistoria/${vistoria.tokenPublico}`;
    const primeiroNome = vistoria.cliente.nome.trim().split(/\s+/)[0];
    const texto =
      `🛡️ ${primeiroNome}, para ativar a proteção do seu ${vistoria.aparelho.marca} ` +
      `${vistoria.aparelho.modelo}, faça a vistoria pelo próprio aparelho neste link ` +
      `(vale ${TOKEN_VALIDADE_MINUTOS} min):\n${link}\n` +
      `Você vai confirmar o IMEI (disque *#06#) e tirar 3 fotos do aparelho.`;

    let enviado = false;
    try {
      enviado = (
        await this.whatsapp.enviarWhatsapp({ telefone: vistoria.cliente.telefoneWhatsapp, texto })
      ).enviado;
    } catch (erro) {
      this.logger.warn(`Falha ao enviar link de vistoria ${vistoriaId}: ${erro}`);
    }
    await this.prisma.notificacaoLog
      .create({
        data: {
          canal: 'WHATSAPP',
          template: 'vistoria_remota_link',
          status: enviado ? 'ENVIADO' : 'FALHA',
          payload: { vistoriaId, telefone: vistoria.cliente.telefoneWhatsapp },
        },
      })
      .catch(() => undefined);
    if (enviado) {
      await this.prisma.vistoria.update({
        where: { id: vistoriaId },
        data: { linkEnviadoEm: new Date() },
      });
    }
  }

  private async buscarPorToken(token: string) {
    if (!/^[0-9a-f]{48}$/.test(token)) throw new NotFoundException('Link inválido.');
    const vistoria = await this.prisma.vistoria.findUnique({
      where: { tokenPublico: token },
      include: {
        aparelho: true,
        cliente: { select: { nome: true, telefoneWhatsapp: true } },
        loja: { select: { nome: true } },
      },
    });
    if (!vistoria) throw new NotFoundException('Link inválido.');
    return vistoria;
  }

  private async audit(vistoriaId: string, depois: Record<string, unknown>) {
    await this.prisma.auditLog
      .create({
        data: {
          acao: 'UPDATE',
          entidade: 'vistorias',
          entidadeId: vistoriaId,
          depois: depois as Prisma.InputJsonValue,
        },
      })
      .catch((erro) => this.logger.error(`Falha ao auditar vistoria: ${erro}`));
  }

  private async resolverVendedor(usuario: UsuarioAutenticado) {
    const vendedor = await this.prisma.vendedor.findFirst({ where: { usuarioId: usuario.id } });
    if (vendedor) return vendedor;
    // LOJA_ADMIN sem cadastro de vendedor: usa o primeiro vendedor ativo da loja.
    if (usuario.lojaId) {
      const daLoja = await this.prisma.vendedor.findFirst({
        where: { lojaId: usuario.lojaId, ativo: true },
      });
      if (daLoja) return daLoja;
    }
    throw new BadRequestException(
      'Usuário não está vinculado a um vendedor; cadastre um vendedor para a loja antes da vistoria.',
    );
  }

  private autorizarLoja(lojaId: string, usuario: UsuarioAutenticado) {
    if (usuario.lojaId && usuario.lojaId !== lojaId) {
      throw new ForbiddenException('Vistoria pertence a outra loja.');
    }
  }

  private async garantirExiste(id: string) {
    const vistoria = await this.prisma.vistoria.findUnique({ where: { id } });
    if (!vistoria) throw new NotFoundException('Vistoria não encontrada.');
    return vistoria;
  }
}
