import { Worker, NativeConnection } from '@temporalio/worker';
import * as activities from './activities';

const MAX_RETRIES = 10;
const RETRY_DELAY_MS = 5_000;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function run(): Promise<void> {
  const address = process.env.TEMPORAL_ADDRESS || 'localhost:7233';
  const namespace = process.env.TEMPORAL_NAMESPACE || 'default';
  const taskQueue = process.env.TEMPORAL_TASK_QUEUE || 'cadence-task-queue';

  let connection: NativeConnection | null = null;

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      console.log(`Connecting to Temporal at ${address}, namespace=${namespace}, taskQueue=${taskQueue} (attempt ${attempt}/${MAX_RETRIES})`);
      connection = await NativeConnection.connect({ address });
      console.log('Connected to Temporal');
      break;
    } catch (err) {
      console.warn(`Failed to connect to Temporal (attempt ${attempt}/${MAX_RETRIES}): ${err}`);
      if (attempt === MAX_RETRIES) {
        throw new Error(`Could not connect to Temporal at ${address} after ${MAX_RETRIES} attempts`);
      }
      await sleep(RETRY_DELAY_MS);
    }
  }

  const worker = await Worker.create({
    connection: connection!,
    namespace,
    taskQueue,
    workflowsPath: require.resolve('./workflows'),
    activities,
  });

  console.log('Temporal worker started successfully');
  await worker.run();
}

run().catch((err) => {
  console.error('Worker failed to start:', err);
  process.exit(1);
});
