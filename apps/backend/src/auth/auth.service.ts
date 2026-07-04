import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import * as argon2 from 'argon2';
import type { LoginResponse, Role, UsuarioPublico } from '@solatium/shared';
import { PrismaService } from '../prisma/prisma.service';
import type { JwtPayload } from './strategies/jwt.strategy';

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
  ) {}

  async login(email: string, senha: string): Promise<LoginResponse> {
    const usuario = await this.prisma.usuario.findUnique({ where: { email } });
    if (!usuario || !usuario.ativo) {
      throw new UnauthorizedException('Credenciais inválidas.');
    }
    const senhaOk = await argon2.verify(usuario.senhaHash, senha);
    if (!senhaOk) {
      throw new UnauthorizedException('Credenciais inválidas.');
    }
    return this.emitirTokens({
      id: usuario.id,
      nome: usuario.nome,
      email: usuario.email,
      role: usuario.role as Role,
      lojaId: usuario.lojaId,
    });
  }

  async refresh(refreshToken: string): Promise<LoginResponse> {
    let payload: JwtPayload;
    try {
      payload = await this.jwt.verifyAsync<JwtPayload>(refreshToken, {
        secret: this.config.get<string>('JWT_REFRESH_SECRET') ?? 'dev-refresh-secret',
      });
    } catch {
      throw new UnauthorizedException('Refresh token inválido ou expirado.');
    }

    const usuario = await this.prisma.usuario.findUnique({ where: { id: payload.sub } });
    if (!usuario || !usuario.ativo || !usuario.refreshTokenHash) {
      throw new UnauthorizedException('Sessão inválida.');
    }
    const confere = await argon2.verify(usuario.refreshTokenHash, refreshToken);
    if (!confere) {
      throw new UnauthorizedException('Sessão inválida.');
    }
    return this.emitirTokens({
      id: usuario.id,
      nome: usuario.nome,
      email: usuario.email,
      role: usuario.role as Role,
      lojaId: usuario.lojaId,
    });
  }

  async logout(usuarioId: string): Promise<void> {
    await this.prisma.usuario.update({
      where: { id: usuarioId },
      data: { refreshTokenHash: null },
    });
  }

  async perfil(usuarioId: string): Promise<UsuarioPublico> {
    const usuario = await this.prisma.usuario.findUnique({ where: { id: usuarioId } });
    if (!usuario) throw new UnauthorizedException('Usuário não encontrado.');
    return {
      id: usuario.id,
      nome: usuario.nome,
      email: usuario.email,
      role: usuario.role as Role,
      lojaId: usuario.lojaId,
    };
  }

  private async emitirTokens(usuario: UsuarioPublico): Promise<LoginResponse> {
    const payload: JwtPayload = {
      sub: usuario.id,
      email: usuario.email,
      role: usuario.role,
      lojaId: usuario.lojaId,
    };

    const accessToken = await this.jwt.signAsync(payload, {
      secret: this.config.get<string>('JWT_SECRET') ?? 'dev-secret',
      expiresIn: this.config.get<string>('JWT_ACCESS_TTL') ?? '15m',
    });
    const refreshToken = await this.jwt.signAsync(payload, {
      secret: this.config.get<string>('JWT_REFRESH_SECRET') ?? 'dev-refresh-secret',
      expiresIn: this.config.get<string>('JWT_REFRESH_TTL') ?? '7d',
    });

    const refreshTokenHash = await argon2.hash(refreshToken);
    await this.prisma.usuario.update({
      where: { id: usuario.id },
      data: { refreshTokenHash },
    });

    return { accessToken, refreshToken, usuario };
  }
}
