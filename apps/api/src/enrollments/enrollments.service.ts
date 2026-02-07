import { Injectable, NotFoundException, ServiceUnavailableException } from '@nestjs/common';
import { v4 as uuidv4 } from 'uuid';
import { CadencesService } from '../cadences/cadences.service';
import { TemporalService } from '../temporal/temporal.service';

interface Enrollment {
  id: string;
  cadenceId: string;
  contactEmail: string;
  workflowId: string;
}

@Injectable()
export class EnrollmentsService {
  private readonly enrollments = new Map<string, Enrollment>();

  constructor(
    private readonly cadencesService: CadencesService,
    private readonly temporalService: TemporalService,
  ) {}

  private ensureTemporal(): void {
    if (!this.temporalService.isConnected) {
      throw new ServiceUnavailableException(
        'Temporal server is not available. Enrollment features require Temporal to be running.',
      );
    }
  }

  async create(data: { cadenceId: string; contactEmail: string }) {
    this.ensureTemporal();
    const cadence = this.cadencesService.findById(data.cadenceId);

    const id = `enr_${uuidv4().substring(0, 8)}`;
    const workflowId = `cadence-workflow-${id}`;

    const enrollment: Enrollment = {
      id,
      cadenceId: data.cadenceId,
      contactEmail: data.contactEmail,
      workflowId,
    };

    await this.temporalService.startWorkflow(workflowId, {
      steps: cadence.steps,
      contactEmail: data.contactEmail,
      cadenceId: cadence.id,
    });

    this.enrollments.set(id, enrollment);
    return { id, cadenceId: data.cadenceId, contactEmail: data.contactEmail, workflowId };
  }

  async findById(id: string) {
    const enrollment = this.enrollments.get(id);
    if (!enrollment) {
      throw new NotFoundException(`Enrollment ${id} not found`);
    }

    if (!this.temporalService.isConnected) {
      return {
        id: enrollment.id,
        cadenceId: enrollment.cadenceId,
        contactEmail: enrollment.contactEmail,
        status: 'TEMPORAL_DISCONNECTED',
        statusDetail: 'Temporal server is not connected',
      };
    }

    try {
      const workflowState = await this.temporalService.getWorkflowState(enrollment.workflowId);
      return {
        id: enrollment.id,
        cadenceId: enrollment.cadenceId,
        contactEmail: enrollment.contactEmail,
        ...(workflowState as Record<string, unknown>),
      };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.warn(`Failed to query workflow ${enrollment.workflowId}: ${message}`);
      return {
        id: enrollment.id,
        cadenceId: enrollment.cadenceId,
        contactEmail: enrollment.contactEmail,
        status: 'UNKNOWN',
        statusDetail: message,
      };
    }
  }

  async updateCadence(id: string, steps: any[]) {
    this.ensureTemporal();
    const enrollment = this.enrollments.get(id);
    if (!enrollment) {
      throw new NotFoundException(`Enrollment ${id} not found`);
    }

    await this.temporalService.signalUpdateCadence(enrollment.workflowId, steps);
    return { success: true, enrollmentId: id };
  }
}
