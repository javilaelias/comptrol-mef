import { ForbiddenException, Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import bcrypt from 'bcryptjs';
import { PrismaService } from '../../prisma/prisma.service';

const SSO_TICKET_AUDIENCE = 'comptrol-mef';
const SSO_TICKET_TYPE = 'app-launch';

type SsoTicketPayload = {
  sub?: string;
  email?: string;
  username?: string;
  name?: string;
  org_unit?: string;
  aud?: string;
  typ?: string;
  jti?: string;
};

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
  ) {}

  async login(email: string, password: string) {
    const user = await this.prisma.user.findFirst({
      where: { email: email.toLowerCase() },
      select: {
        id: true,
        tenantId: true,
        email: true,
        fullName: true,
        role: true,
        status: true,
        passwordHash: true,
      },
    });

    if (!user || user.status !== 'active' || !user.passwordHash) {
      throw new UnauthorizedException('Invalid credentials');
    }

    const ok = await bcrypt.compare(password, user.passwordHash);
    if (!ok) throw new UnauthorizedException('Invalid credentials');

    await this.prisma.user.update({
      where: { id: user.id },
      data: { lastLoginAt: new Date() },
    });

    const accessToken = await this.jwt.signAsync({
      sub: user.id,
      tenantId: user.tenantId,
      role: user.role,
      email: user.email,
    });

    return {
      accessToken,
      user: {
        id: user.id,
        tenantId: user.tenantId,
        email: user.email,
        fullName: user.fullName,
        role: user.role,
      },
    };
  }

  /**
   * Recibe el ticket SSO de 60s firmado por gti-app (portal OPDA Apps) y emite una
   * sesión propia de Comptrol-MEF. El ticket se verifica con un secreto dedicado
   * (GTI_SSO_SECRET, distinto de JWT_SECRET): se instancia un JwtService propio
   * (`new JwtService(...)`) en vez de registrar un segundo JwtModule en AuthModule,
   * que colisionaría con el ya registrado para JWT_SECRET.
   */
  async loginWithSsoTicket(ticket: string) {
    const ticketSecret = this.config.get<string>('GTI_SSO_SECRET');
    if (!ticketSecret) {
      // eslint-disable-next-line no-console
      console.error('GTI_SSO_SECRET no configurado: no se puede verificar el ticket SSO.');
      throw new UnauthorizedException('invalid_ticket');
    }
    const ticketJwt = new JwtService({ secret: ticketSecret });

    let payload: SsoTicketPayload;
    try {
      payload = await ticketJwt.verifyAsync<SsoTicketPayload>(ticket, {
        algorithms: ['HS256'],
      });
    } catch {
      throw new UnauthorizedException('invalid_ticket');
    }

    if (payload.typ !== SSO_TICKET_TYPE || payload.aud !== SSO_TICKET_AUDIENCE) {
      throw new UnauthorizedException('invalid_ticket');
    }

    const email = payload.email?.toLowerCase();
    if (!email) {
      throw new UnauthorizedException('invalid_ticket');
    }

    const tenant = await this.prisma.tenant.findFirst({ where: { slug: 'mef' } });
    if (!tenant) {
      throw new UnauthorizedException('invalid_ticket');
    }

    let user = await this.prisma.user.findFirst({
      where: { tenantId: tenant.id, email },
      select: {
        id: true,
        tenantId: true,
        email: true,
        fullName: true,
        role: true,
        status: true,
      },
    });

    if (user && user.status !== 'active') {
      throw new ForbiddenException('user_disabled');
    }

    if (!user) {
      user = await this.prisma.user.create({
        data: {
          tenantId: tenant.id,
          email,
          fullName: payload.name || email,
          role: 'employee',
          status: 'active',
          ssoProvider: 'gti-app',
          passwordHash: null,
        },
        select: {
          id: true,
          tenantId: true,
          email: true,
          fullName: true,
          role: true,
          status: true,
        },
      });
    }

    await this.prisma.user.update({
      where: { id: user.id },
      data: { lastLoginAt: new Date() },
    });

    const accessToken = await this.jwt.signAsync({
      sub: user.id,
      tenantId: user.tenantId,
      role: user.role,
      email: user.email,
    });

    return {
      accessToken,
      user: {
        id: user.id,
        tenantId: user.tenantId,
        email: user.email,
        fullName: user.fullName,
        role: user.role,
      },
    };
  }
}
