/**
 * bq-sink — Kafka (Redpanda) → BigQuery consumer
 *
 * Reads from the `limited_merch_transactions` Kafka topic and batch-writes
 * events to BigQuery `novapay_raw.limited_merch_events`.
 *
 * dd-trace is loaded via `-r dd-trace/init` at process start (see Dockerfile CMD).
 * With DD_DATA_STREAMS_ENABLED=true, dd-trace auto-instruments KafkaJS for
 * Datadog Data Streams Monitoring — no explicit instrumentation needed here.
 */

import { Kafka, Consumer, EachBatchPayload } from 'kafkajs';
import { BigQuery, InsertRowsOptions } from '@google-cloud/bigquery';
import { createLogger, format, transports } from 'winston';
import * as http from 'http';
import * as https from 'https';
import avsc from 'avsc';
import { readFileSync } from 'fs';
import { join } from 'path';
import { randomUUID } from 'crypto';

// ─── Logger ──────────────────────────────────────────────────────────────────
const logger = createLogger({
  level: 'info',
  format: format.combine(format.timestamp(), format.errors({ stack: true }), format.json()),
  defaultMeta: {
    service: process.env.DD_SERVICE ?? 'bq-sink',
    env: process.env.DD_ENV ?? 'prod',
  },
  transports: [new transports.Console()],
});

// ─── Config ───────────────────────────────────────────────────────────────────
const KAFKA_BROKERS = (process.env.KAFKA_BROKERS ?? 'localhost:9092').split(',');
const KAFKA_TOPIC   = process.env.KAFKA_TOPIC   ?? 'limited_merch_transactions';
const KAFKA_GROUP   = process.env.KAFKA_GROUP_ID ?? 'bq-sink-consumer';
const BQ_PROJECT    = process.env.BQ_PROJECT    ?? 'datadog-ese-sandbox';
const BQ_DATASET    = process.env.BQ_DATASET    ?? 'novapay_raw';
const BQ_TABLE      = process.env.BQ_TABLE      ?? 'limited_merch_events';
const BATCH_MAX     = parseInt(process.env.BATCH_MAX_MESSAGES ?? '100', 10);
const FLUSH_MS      = parseInt(process.env.BATCH_FLUSH_INTERVAL_MS ?? '5000', 10);
const HEALTH_PORT   = parseInt(process.env.HEALTH_PORT ?? '3001', 10);

// ─── Clients ──────────────────────────────────────────────────────────────────
const kafka = new Kafka({
  clientId: 'bq-sink',
  brokers: KAFKA_BROKERS,
  retry: { initialRetryTime: 500, retries: 10 },
});

const bq = new BigQuery({ projectId: BQ_PROJECT });
const table = bq.dataset(BQ_DATASET).table(BQ_TABLE);

// ─── Avro schema ──────────────────────────────────────────────────────────────
// Shared with lib/kafka-client.ts (producer). Used to deserialize Avro messages.
// Docs: https://docs.datadoghq.com/data_streams/schema_tracking/
const avroType = avsc.Type.forSchema(
  JSON.parse(readFileSync(join(__dirname, '..', 'merch-checkout-event.avsc'), 'utf-8'))
);

// ─── OpenLineage emitter ──────────────────────────────────────────────────────
//
// Emits START + COMPLETE OpenLineage events to Datadog Data Observability for
// every successful batch write, declaring:
//   Input  : Kafka topic  (namespace: kafka://<broker>, name: <topic>)
//   Output : BigQuery table (namespace: "bigquery", name: "{project}.{dataset}.{table}")
//
// This makes the Kafka → bq-sink → BigQuery edge visible in the lineage graph:
//   Data Observability > Lineage > anchor: novapay_raw.limited_merch_events
//
// Docs: https://docs.datadoghq.com/data_observability/jobs_monitoring/openlineage/
// Dataset naming: https://docs.datadoghq.com/data_observability/jobs_monitoring/openlineage/#dataset-naming-conventions

const OL_ENDPOINT  = 'data-obs-intake.datadoghq.com';
const OL_PATH      = '/api/v1/lineage';
const DD_API_KEY   = process.env.DD_API_KEY ?? '';
const DD_SITE_HOST = `data-obs-intake.${(process.env.DD_SITE ?? 'datadoghq.com')}`;
const OL_NAMESPACE = process.env.OPENLINEAGE_NAMESPACE ?? process.env.DD_ENV ?? 'prod';
const OL_PRODUCER  = 'https://github.com/DataDog/box-box-bits-ai/bq-sink';

// BigQuery output dataset — must use exact Datadog naming convention for BQ
const BQ_OL_NAMESPACE = 'bigquery';
const BQ_OL_NAME      = `${BQ_PROJECT}.${BQ_DATASET}.${BQ_TABLE}`;

// Kafka input dataset — use broker host:port as namespace, topic as name
const KAFKA_OL_NAMESPACE = `kafka://${KAFKA_BROKERS[0]}`;
const KAFKA_OL_NAME      = KAFKA_TOPIC;

function buildOLEvent(
  eventType: 'START' | 'COMPLETE' | 'FAIL',
  runId: string,
  startTime: string,
  rowsWritten?: number,
  errorMessage?: string,
): object {
  const now = new Date().toISOString();
  const event: Record<string, unknown> = {
    eventTime: eventType === 'START' ? startTime : now,
    eventType,
    run: { runId },
    job: {
      // Job namespace = DD service name so Datadog correlates the job to the running service.
      // "bq-sink" namespace + "kafka-to-bigquery" name → appears in lineage as service:bq-sink.
      namespace: process.env.DD_SERVICE ?? 'bq-sink',
      name: 'kafka-to-bigquery',
      facets: {
        jobType: {
          _producer: OL_PRODUCER,
          _schemaURL: 'https://openlineage.io/spec/facets/2-0-3/JobTypeJobFacet.json',
          processingType: 'STREAMING',
          integration: 'custom',
          jobType: 'JOB',
        },
        tags: {
          _producer: OL_PRODUCER,
          _schemaURL: 'https://openlineage.io/spec/facets/1-0-0/TagsJobFacet.json',
          tags: [
            { name: '_dd.ol_service', value: process.env.DD_SERVICE ?? 'bq-sink' },
            { name: 'env', value: process.env.DD_ENV ?? 'prod' },
            { name: 'kafka_topic', value: KAFKA_TOPIC },
          ],
        },
      },
    },
    inputs: [
      {
        namespace: KAFKA_OL_NAMESPACE,
        name: KAFKA_OL_NAME,
        facets: {
          // Record how many rows were read from Kafka in this batch
          ...(rowsWritten !== undefined && {
            inputStatistics: {
              _producer: OL_PRODUCER,
              _schemaURL: 'https://openlineage.io/spec/facets/1-0-3/InputStatisticsInputDatasetFacet.json',
              rowCount: rowsWritten,
            },
          }),
        },
      },
    ],
    outputs: [
      {
        namespace: BQ_OL_NAMESPACE,
        name: BQ_OL_NAME,
        facets: {
          ...(rowsWritten !== undefined && {
            outputStatistics: {
              _producer: OL_PRODUCER,
              _schemaURL: 'https://openlineage.io/spec/facets/1-0-3/OutputStatisticsOutputDatasetFacet.json',
              rowCount: rowsWritten,
            },
          }),
        },
      },
    ],
    producer: OL_PRODUCER,
  };

  if (errorMessage) {
    (event.job as Record<string, unknown>).facets = {
      ...(event.job as Record<string, unknown>).facets as object,
      errorMessage: {
        _producer: OL_PRODUCER,
        _schemaURL: 'https://openlineage.io/spec/facets/1-0-1/ErrorMessageRunFacet.json',
        message: errorMessage,
        programmingLanguage: 'NODE',
      },
    };
  }

  return event;
}

function emitOpenLineageEvent(event: object): void {
  if (!DD_API_KEY) return; // skip in local dev without API key

  const body = JSON.stringify(event);
  const options: https.RequestOptions = {
    hostname: DD_SITE_HOST,
    path: OL_PATH,
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Content-Length': Buffer.byteLength(body),
      Authorization: `Bearer ${DD_API_KEY}`,
    },
  };

  const req = https.request(options, res => {
    if (res.statusCode && res.statusCode >= 400) {
      logger.warn('openlineage_emit_failed', {
        status: res.statusCode,
        event_type: (event as Record<string, unknown>).eventType,
      });
    }
    res.resume(); // drain response body
  });

  req.on('error', err => {
    logger.warn('openlineage_emit_error', { error: err.message });
  });

  req.write(body);
  req.end();
}

// ─── Types ────────────────────────────────────────────────────────────────────
interface MerchEvent {
  event_id: string;
  product_id: string;
  user_id: string;
  quantity: number;
  price_thb: number;
  team?: string;
  category?: string;
  event_ts: string;
  kafka_offset?: number;
  ingested_at?: string;
}

// ─── Batch buffer ─────────────────────────────────────────────────────────────
let buffer: MerchEvent[] = [];
let flushTimer: NodeJS.Timeout | null = null;

async function flushBuffer(): Promise<void> {
  if (buffer.length === 0) return;
  const batch = buffer.splice(0, buffer.length);
  const ingestedAt = new Date().toISOString();
  const rows = batch.map(e => ({ ...e, ingested_at: ingestedAt }));

  // Each flush is a discrete lineage run: Kafka topic → BigQuery table
  const runId    = randomUUID();
  const startTime = new Date().toISOString();
  emitOpenLineageEvent(buildOLEvent('START', runId, startTime));

  try {
    const opts: InsertRowsOptions = { skipInvalidRows: false, ignoreUnknownValues: false };
    await table.insert(rows, opts);

    logger.info('batch_written', {
      event_type: 'bq_batch_write',
      rows_written: rows.length,
      topic: KAFKA_TOPIC,
      openlineage_run_id: runId,
    });

    // COMPLETE — tells Datadog the edge: Kafka topic → bq-sink → BQ table
    emitOpenLineageEvent(buildOLEvent('COMPLETE', runId, startTime, rows.length));
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    logger.error('batch_write_failed', {
      event_type: 'bq_batch_write_error',
      error: msg,
      rows_attempted: rows.length,
    });

    // FAIL — surfaces the error in Datadog Jobs Monitoring + lineage
    emitOpenLineageEvent(buildOLEvent('FAIL', runId, startTime, undefined, msg));
  }
}

function scheduleFlush(): void {
  if (flushTimer) return;
  flushTimer = setTimeout(async () => {
    flushTimer = null;
    await flushBuffer();
  }, FLUSH_MS);
}

// ─── Consumer ─────────────────────────────────────────────────────────────────
async function startConsumer(): Promise<void> {
  const consumer: Consumer = kafka.consumer({ groupId: KAFKA_GROUP });

  await consumer.connect();
  logger.info('kafka_connected', { brokers: KAFKA_BROKERS, group: KAFKA_GROUP });

  await consumer.subscribe({ topic: KAFKA_TOPIC, fromBeginning: false });

  await consumer.run({
    eachBatchAutoResolve: true,
    eachBatch: async ({ batch, resolveOffset, heartbeat }: EachBatchPayload) => {
      for (const message of batch.messages) {
        if (!message.value) continue;
        try {
          // Deserialize: Avro (new) or JSON (backward compat for pre-Avro events)
          const contentType = message.headers?.['content-type']?.toString() ?? '';
          let event: MerchEvent;

          if (contentType.includes('avro') && Buffer.isBuffer(message.value)) {
            event = avroType.fromBuffer(message.value) as MerchEvent;
          } else {
            event = JSON.parse(message.value.toString()) as MerchEvent;
          }

          event.kafka_offset = typeof message.offset === 'string'
            ? parseInt(message.offset, 10)
            : (message.offset as unknown as number);
          buffer.push(event);

          if (buffer.length >= BATCH_MAX) {
            await flushBuffer();
          } else {
            scheduleFlush();
          }

          resolveOffset(message.offset);
          await heartbeat();
        } catch (parseErr) {
          logger.warn('message_parse_failed', {
            offset: message.offset,
            error: parseErr instanceof Error ? parseErr.message : String(parseErr),
          });
        }
      }
    },
  });
}

// ─── Health endpoint (for Kubernetes liveness probe) ─────────────────────────
function startHealthServer(): void {
  const server = http.createServer((req, res) => {
    if (req.url === '/health' && req.method === 'GET') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ status: 'ok', service: 'bq-sink', buffer: buffer.length }));
    } else {
      res.writeHead(404);
      res.end();
    }
  });
  server.listen(HEALTH_PORT, () => {
    logger.info('health_server_started', { port: HEALTH_PORT });
  });
}

// ─── Graceful shutdown ────────────────────────────────────────────────────────
process.on('SIGTERM', async () => {
  logger.info('shutting_down', { reason: 'SIGTERM' });
  if (flushTimer) clearTimeout(flushTimer);
  await flushBuffer();
  process.exit(0);
});

// ─── Main ─────────────────────────────────────────────────────────────────────
(async () => {
  startHealthServer();
  await startConsumer();
  logger.info('bq_sink_started', { topic: KAFKA_TOPIC, dataset: `${BQ_PROJECT}.${BQ_DATASET}.${BQ_TABLE}` });
})().catch(err => {
  logger.error('startup_failed', { error: err.message, stack: err.stack });
  process.exit(1);
});
