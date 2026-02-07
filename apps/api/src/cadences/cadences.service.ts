import { Injectable, NotFoundException } from '@nestjs/common';
import { v4 as uuidv4 } from 'uuid';

export interface CadenceStep {
  id: string;
  type: 'SEND_EMAIL' | 'WAIT';
  subject?: string;
  body?: string;
  seconds?: number;
}

export interface Cadence {
  id: string;
  name: string;
  steps: CadenceStep[];
}

@Injectable()
export class CadencesService {
  private readonly cadences = new Map<string, Cadence>();

  create(data: { name: string; steps: CadenceStep[] }): Cadence {
    const cadence: Cadence = {
      id: `cad_${uuidv4().substring(0, 8)}`,
      name: data.name,
      steps: data.steps,
    };
    this.cadences.set(cadence.id, cadence);
    return cadence;
  }

  findById(id: string): Cadence {
    const cadence = this.cadences.get(id);
    if (!cadence) {
      throw new NotFoundException(`Cadence ${id} not found`);
    }
    return cadence;
  }

  update(id: string, data: { name?: string; steps?: CadenceStep[] }): Cadence {
    const cadence = this.findById(id);
    if (data.name !== undefined) cadence.name = data.name;
    if (data.steps !== undefined) cadence.steps = data.steps;
    return cadence;
  }

  delete(id: string): void {
    if (!this.cadences.has(id)) {
      throw new NotFoundException(`Cadence ${id} not found`);
    }
    this.cadences.delete(id);
  }

  findAll(): Cadence[] {
    return Array.from(this.cadences.values());
  }
}
