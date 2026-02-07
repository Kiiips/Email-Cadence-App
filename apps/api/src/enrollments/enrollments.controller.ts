import { Controller, Post, Get, Param, Body } from '@nestjs/common';
import { EnrollmentsService } from './enrollments.service';

@Controller('enrollments')
export class EnrollmentsController {
  constructor(private readonly enrollmentsService: EnrollmentsService) {}

  @Post()
  create(@Body() body: { cadenceId: string; contactEmail: string }) {
    return this.enrollmentsService.create(body);
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.enrollmentsService.findById(id);
  }

  @Post(':id/update-cadence')
  updateCadence(@Param('id') id: string, @Body() body: { steps: any[] }) {
    return this.enrollmentsService.updateCadence(id, body.steps);
  }
}
