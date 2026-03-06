import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class AgentKeyGuard implements CanActivate {
  constructor(private readonly config: ConfigService) {}

  canActivate(ctx: ExecutionContext): boolean {
    const req = ctx.switchToHttp().getRequest<Request & { headers: any }>();
    const key = String(req.headers['x-agent-key'] ?? '').trim();
    const expected = String(this.config.get<string>('AGENT_API_KEY') ?? '').trim();

    if (!expected) throw new UnauthorizedException('Agent key not configured');
    if (!key || key !== expected) throw new UnauthorizedException('Invalid agent key');
    return true;
  }
}

