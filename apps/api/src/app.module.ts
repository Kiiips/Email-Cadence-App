import { Module, Controller, Get } from '@nestjs/common';
import { TemporalModule } from './temporal/temporal.module';
import { CadencesModule } from './cadences/cadences.module';
import { EnrollmentsModule } from './enrollments/enrollments.module';
import { TemporalService } from './temporal/temporal.service';

@Controller()
class HealthController {
  constructor(private readonly temporalService: TemporalService) {}

  @Get('health')
  health() {
    return {
      status: 'ok',
      temporal: this.temporalService.isConnected ? 'connected' : 'disconnected',
    };
  }
}

@Module({
  imports: [TemporalModule, CadencesModule, EnrollmentsModule],
  controllers: [HealthController],
})
export class AppModule {}
