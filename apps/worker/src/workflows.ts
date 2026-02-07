import {
  proxyActivities,
  defineSignal,
  defineQuery,
  setHandler,
  condition,
} from '@temporalio/workflow';
import type { SendEmailInput, SendEmailResult } from './activities';

// --- Types ---

export interface CadenceStep {
  id: string;
  type: 'SEND_EMAIL' | 'WAIT';
  subject?: string;
  body?: string;
  seconds?: number;
}

export interface WorkflowState {
  currentStepIndex: number;
  stepsVersion: number;
  status: 'RUNNING' | 'COMPLETED';
  steps: CadenceStep[];
  contactEmail: string;
  cadenceId: string;
}

// --- Signals & Queries ---

export const updateCadenceSignal = defineSignal<[CadenceStep[]]>('updateCadence');
export const getStateQuery = defineQuery<WorkflowState>('getState');

// --- Activities proxy ---

const { sendEmail } = proxyActivities<{
  sendEmail(input: SendEmailInput): Promise<SendEmailResult>;
}>({
  startToCloseTimeout: '30s',
});

// --- Workflow ---

export async function executeCadence(params: {
  steps: CadenceStep[];
  contactEmail: string;
  cadenceId: string;
}): Promise<WorkflowState> {
  const state: WorkflowState = {
    currentStepIndex: 0,
    stepsVersion: 1,
    status: 'RUNNING',
    steps: [...params.steps],
    contactEmail: params.contactEmail,
    cadenceId: params.cadenceId,
  };

  // Query handler – returns current workflow state
  setHandler(getStateQuery, () => ({ ...state }));

  // Track whether a signal interrupted the current step
  let stepInterrupted = false;

  // Signal handler – replaces steps at runtime, jumps to first changed step
  setHandler(updateCadenceSignal, (newSteps: CadenceStep[]) => {
    state.steps = [...newSteps];
    state.stepsVersion++;

    if (newSteps.length <= state.currentStepIndex) {
      state.status = 'COMPLETED';
      stepInterrupted = true;
    }
  });

  // Execute steps sequentially
  while (state.currentStepIndex < state.steps.length && state.status === 'RUNNING') {
    stepInterrupted = false;
    const step = state.steps[state.currentStepIndex];

    if (step.type === 'SEND_EMAIL') {
      await sendEmail({
        to: state.contactEmail,
        subject: step.subject ?? '',
        body: step.body ?? '',
      });
    } else if (step.type === 'WAIT') {
      // Use condition() so the wait can be interrupted by a signal
      await condition(() => stepInterrupted, (step.seconds ?? 1) * 1000);
    }

    // If a signal interrupted this step, restart the loop from the new position
    if (stepInterrupted) continue;

    state.currentStepIndex++;
  }

  state.status = 'COMPLETED';
  return state;
}
