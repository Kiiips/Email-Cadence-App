import { Controller, Post, Get, Put, Delete, Param, Body, HttpCode } from '@nestjs/common';
import { CadencesService, CadenceStep } from './cadences.service';

@Controller('cadences')
export class CadencesController {
  constructor(private readonly cadencesService: CadencesService) {}

  @Post()
  create(@Body() body: { name: string; steps: CadenceStep[] }) {
    return this.cadencesService.create(body);
  }

  @Get()
  findAll() {
    return this.cadencesService.findAll();
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.cadencesService.findById(id);
  }

  @Put(':id')
  update(@Param('id') id: string, @Body() body: { name?: string; steps?: CadenceStep[] }) {
    return this.cadencesService.update(id, body);
  }

  @Delete(':id')
  @HttpCode(204)
  remove(@Param('id') id: string) {
    this.cadencesService.delete(id);
  }
}
