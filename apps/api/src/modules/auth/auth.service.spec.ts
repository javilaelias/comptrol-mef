import { ForbiddenException, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { AuthService } from './auth.service';

const TEST_SSO_SECRET = 'test-gti-sso-secret-0123456789';
const TENANT_ID = 'tenant-uuid-1';

function signTicket(
  overrides: Partial<Record<string, unknown>> = {},
  opts: { secret?: string; expiresIn?: string | number } = {},
) {
  const jwt = new JwtService({ secret: opts.secret ?? TEST_SSO_SECRET });
  return jwt.sign(
    {
      sub: 'gti-user-1',
      email: 'nuevo.usuario@mef.gob.pe',
      username: 'nuevo.usuario',
      name: 'Nuevo Usuario',
      org_unit: 'OGTI',
      aud: 'comptrol-mef',
      typ: 'app-launch',
      jti: 'ticket-jti-1',
      ...overrides,
    },
    { expiresIn: opts.expiresIn ?? '60s' },
  );
}

describe('AuthService.loginWithSsoTicket', () => {
  let prisma: {
    tenant: { findFirst: jest.Mock };
    user: { findFirst: jest.Mock; create: jest.Mock; update: jest.Mock };
  };
  let jwt: JwtService;
  let config: { get: jest.Mock };
  let service: AuthService;

  beforeEach(() => {
    prisma = {
      tenant: { findFirst: jest.fn() },
      user: { findFirst: jest.fn(), create: jest.fn(), update: jest.fn() },
    };
    jwt = new JwtService({ secret: 'app-own-jwt-secret-unrelated-000' });
    config = { get: jest.fn().mockReturnValue(TEST_SSO_SECRET) };
    // AuthService no depende de DI para este test: se instancia directo con los mocks.
    service = new AuthService(prisma as never, jwt, config as never);
  });

  it('crea un usuario nuevo con role employee cuando el ticket es válido y el email no existe', async () => {
    prisma.tenant.findFirst.mockResolvedValue({ id: TENANT_ID, slug: 'mef' });
    prisma.user.findFirst.mockResolvedValue(null);
    prisma.user.create.mockResolvedValue({
      id: 'user-1',
      tenantId: TENANT_ID,
      email: 'nuevo.usuario@mef.gob.pe',
      fullName: 'Nuevo Usuario',
      role: 'employee',
      status: 'active',
    });
    prisma.user.update.mockResolvedValue({});

    const ticket = signTicket();
    const result = await service.loginWithSsoTicket(ticket);

    expect(prisma.user.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          tenantId: TENANT_ID,
          email: 'nuevo.usuario@mef.gob.pe',
          role: 'employee',
          status: 'active',
          ssoProvider: 'gti-app',
          passwordHash: null,
        }),
      }),
    );
    expect(prisma.user.update).toHaveBeenCalledWith({
      where: { id: 'user-1' },
      data: { lastLoginAt: expect.any(Date) },
    });
    expect(result.user).toEqual({
      id: 'user-1',
      tenantId: TENANT_ID,
      email: 'nuevo.usuario@mef.gob.pe',
      fullName: 'Nuevo Usuario',
      role: 'employee',
    });
    expect(typeof result.accessToken).toBe('string');
  });

  it('reusa el usuario existente por email y no duplica', async () => {
    prisma.tenant.findFirst.mockResolvedValue({ id: TENANT_ID, slug: 'mef' });
    prisma.user.findFirst.mockResolvedValue({
      id: 'user-2',
      tenantId: TENANT_ID,
      email: 'existente@mef.gob.pe',
      fullName: 'Existente',
      role: 'it_admin',
      status: 'active',
    });
    prisma.user.update.mockResolvedValue({});

    const ticket = signTicket({ email: 'existente@mef.gob.pe' });
    const result = await service.loginWithSsoTicket(ticket);

    expect(prisma.user.create).not.toHaveBeenCalled();
    expect(result.user.id).toBe('user-2');
    expect(result.user.role).toBe('it_admin');
  });

  it('rechaza con 401 cuando aud del ticket no es comptrol-mef', async () => {
    const ticket = signTicket({ aud: 'otra-app' });
    await expect(service.loginWithSsoTicket(ticket)).rejects.toBeInstanceOf(UnauthorizedException);
    expect(prisma.user.findFirst).not.toHaveBeenCalled();
  });

  it('rechaza con 401 cuando el ticket está firmado con un secreto incorrecto', async () => {
    const ticket = signTicket({}, { secret: 'secreto-equivocado-000000000000' });
    await expect(service.loginWithSsoTicket(ticket)).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('rechaza con 401 cuando el ticket está expirado', async () => {
    const ticket = signTicket({}, { expiresIn: -10 });
    await expect(service.loginWithSsoTicket(ticket)).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('rechaza con 401 y sin filtrar el nombre de la env var cuando GTI_SSO_SECRET no está seteado', async () => {
    config.get.mockReturnValue(undefined);
    const ticket = signTicket();

    const caught = await service.loginWithSsoTicket(ticket).catch((err) => err);

    expect(caught).toBeInstanceOf(UnauthorizedException);
    expect(caught.message).toBe('invalid_ticket');
    expect(caught.message).not.toMatch(/GTI_SSO_SECRET/i);
    expect(prisma.tenant.findFirst).not.toHaveBeenCalled();
  });

  it('rechaza con 403 cuando el usuario existe pero su status no es active', async () => {
    prisma.tenant.findFirst.mockResolvedValue({ id: TENANT_ID, slug: 'mef' });
    prisma.user.findFirst.mockResolvedValue({
      id: 'user-3',
      tenantId: TENANT_ID,
      email: 'suspendido@mef.gob.pe',
      fullName: 'Suspendido',
      role: 'employee',
      status: 'suspended',
    });

    const ticket = signTicket({ email: 'suspendido@mef.gob.pe' });
    await expect(service.loginWithSsoTicket(ticket)).rejects.toBeInstanceOf(ForbiddenException);
    expect(prisma.user.update).not.toHaveBeenCalled();
  });
});
