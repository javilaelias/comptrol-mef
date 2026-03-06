import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import type { JwtUserPayload } from '../../modules/auth/jwt.strategy';

export const CurrentUser = createParamDecorator((_: unknown, ctx: ExecutionContext): JwtUserPayload => {
  const request = ctx.switchToHttp().getRequest();
  return request.user as JwtUserPayload;
});

