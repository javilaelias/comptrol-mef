import { Body, Controller, Post, UseGuards } from '@nestjs/common';
import { AgentKeyGuard } from './agent-key.guard';
import { AgentService } from './agent.service';
import { AgentHeartbeatDto } from './dto/agent-heartbeat.dto';

@Controller('agent')
export class AgentController {
  constructor(private readonly agent: AgentService) {}

  @Post('heartbeat')
  @UseGuards(AgentKeyGuard)
  async heartbeat(@Body() dto: AgentHeartbeatDto) {
    return this.agent.heartbeat(dto);
  }
}

