import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { App } from 'supertest/types';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';

describe('AuthController POST /auth/sso (validación de body)', () => {
  let app: INestApplication<App>;
  const authServiceMock = {
    login: jest.fn(),
    loginWithSsoTicket: jest.fn(),
  };

  beforeEach(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      controllers: [AuthController],
      providers: [{ provide: AuthService, useValue: authServiceMock }],
    }).compile();

    app = moduleFixture.createNestApplication();
    // Mismo ValidationPipe global que main.ts, para no asumir que rechaza sin probarlo.
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    );
    await app.init();
  });

  afterEach(async () => {
    jest.clearAllMocks();
    await app.close();
  });

  it('responde 400 cuando el body no trae "ticket"', async () => {
    await request(app.getHttpServer()).post('/auth/sso').send({}).expect(400);
    expect(authServiceMock.loginWithSsoTicket).not.toHaveBeenCalled();
  });

  it('responde 400 cuando "ticket" no es un string', async () => {
    await request(app.getHttpServer()).post('/auth/sso').send({ ticket: 12345 }).expect(400);
    expect(authServiceMock.loginWithSsoTicket).not.toHaveBeenCalled();
  });

  it('delega al servicio cuando el body es válido', async () => {
    authServiceMock.loginWithSsoTicket.mockResolvedValue({
      accessToken: 'tok',
      user: { id: '1', tenantId: 't1', email: 'a@mef.gob.pe', fullName: 'A', role: 'employee' },
    });

    await request(app.getHttpServer()).post('/auth/sso').send({ ticket: 'a.b.c' }).expect(201);
    expect(authServiceMock.loginWithSsoTicket).toHaveBeenCalledWith('a.b.c');
  });
});
