import { Module } from '@nestjs/common';
import { AgentController } from './agent.controller';
import { AgentKeyGuard } from './agent-key.guard';
import { AgentService } from './agent.service';

@Module({
  controllers: [AgentController],
  providers: [AgentService, AgentKeyGuard],
})
export class AgentModule {}

