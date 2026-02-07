import { Injectable, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { Client, Connection } from '@temporalio/client';

@Injectable()
export class TemporalService implements OnModuleInit, OnModuleDestroy {
  private client: Client | null = null;
  private connection: Connection | null = null;
  private _connected = false;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;

  private get address(): string {
    return process.env.TEMPORAL_ADDRESS || 'localhost:7233';
  }

  private get namespace(): string {
    return process.env.TEMPORAL_NAMESPACE || 'default';
  }

  private get taskQueue(): string {
    return process.env.TEMPORAL_TASK_QUEUE || 'cadence-task-queue';
  }

  get isConnected(): boolean {
    return this._connected;
  }

  async onModuleInit(): Promise<void> {
    await this.connect();
  }

  private async connect(): Promise<void> {
    try {
      console.log(`Connecting to Temporal at ${this.address}, namespace=${this.namespace}`);
      this.connection = await Connection.connect({ address: this.address });
      this.client = new Client({ connection: this.connection, namespace: this.namespace });
      this._connected = true;
      console.log('Temporal client connected');
    } catch (err) {
      this._connected = false;
      console.warn(`Failed to connect to Temporal at ${this.address}: ${err}. API will continue without Temporal. Retrying in 10s...`);
      this.scheduleReconnect();
    }
  }

  private scheduleReconnect(): void {
    if (this.reconnectTimer) return;
    this.reconnectTimer = setTimeout(async () => {
      this.reconnectTimer = null;
      if (!this._connected) {
        await this.connect();
      }
    }, 10_000);
  }

  async onModuleDestroy(): Promise<void> {
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    await this.connection?.close();
  }

  private ensureConnected(): void {
    if (!this._connected || !this.client) {
      throw new Error('Temporal server is not available. Please ensure Temporal is running at ' + this.address);
    }
  }

  async startWorkflow(
    workflowId: string,
    params: { steps: any[]; contactEmail: string; cadenceId: string },
  ) {
    this.ensureConnected();
    const handle = await this.client!.workflow.start('executeCadence', {
      taskQueue: this.taskQueue,
      workflowId,
      args: [params],
    });
    return handle;
  }

  async getWorkflowState(workflowId: string) {
    this.ensureConnected();
    const handle = this.client!.workflow.getHandle(workflowId);
    return handle.query('getState');
  }

  async signalUpdateCadence(workflowId: string, steps: any[]) {
    this.ensureConnected();
    const handle = this.client!.workflow.getHandle(workflowId);
    await handle.signal('updateCadence', steps);
  }
}
