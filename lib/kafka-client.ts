/**
 * lib/kafka-client.ts
 *
 * KafkaJS producer singleton connecting to Redpanda.
 *
 * Serialization: Apache Avro (avsc) for Datadog Schema Tracking.
 * Lineage: emits OpenLineage START+COMPLETE to Datadog Data Observability
 *   so the producer side of the pipeline appears in the lineage graph:
 *   box-box-bits-ai (checkout) → limited_merch_transactions (Kafka) → bq-sink → BigQuery
 *
 * Docs:
 *   Schema Tracking:  https://docs.datadoghq.com/data_streams/schema_tracking/
 *   OpenLineage:      https://docs.datadoghq.com/data_observability/jobs_monitoring/openlineage/
 */

import { Kafka, Producer, CompressionTypes } from 'kafkajs';
import avsc from 'avsc';
import { readFileSync } from 'fs';
import { join } from 'path';
import * as https from 'https';
import { randomUUID } from 'crypto';

// ─── Avro schema ──────────────────────────────────────────────────────────────

const SCHEMA_PATH = join(process.cwd(), 'lib/schemas/merch-checkout-event.avsc');
const avroType = avsc.Type.forSchema(
  JSON.parse(readFileSync(SCHEMA_PATH, 'utf-8'))
);

// ─── Kafka singleton ──────────────────────────────────────────────────────────

const BROKERS = process.env.REDPANDA_BROKERS?.split(',').filter(Boolean) ?? [];

let _producer: Producer | null = null;
let _connecting = false;
let _kafka: Kafka | null = null;

function getKafka(): Kafka | null {
  if (BROKERS.length === 0) return null;
  if (!_kafka) {
    _kafka = new Kafka({
      clientId: 'box-box-bits-ai',
      brokers: BROKERS,
      retry: { initialRetryTime: 300, retries: 5 },
    });
  }
  return _kafka;
}

export async function getProducer(): Promise<Producer | null> {
  const kafka = getKafka();
  if (!kafka) return null;

  if (_producer) return _producer;
  if (_connecting) return null;

  try {
    _connecting = true;
    _producer = kafka.producer({ allowAutoTopicCreation: true, transactionTimeout: 30000 });
    await _producer.connect();
    _connecting = false;
    return _producer;
  } catch {
    _connecting = false;
    _producer = null;
    return null;
  }
}

// ─── OpenLineage producer lineage ────────────────────────────────────────────
//
// Emits a START + COMPLETE event pair for each successful Kafka publish so
// Datadog Data Observability shows the full lineage:
//   box-box-bits-ai (checkout) → limited_merch_transactions → bq-sink → BigQuery
//
// Dataset naming per Datadog convention:
//   Kafka output: namespace = "kafka://{broker}", name = "{topic}"
//   No explicit input — the producer is the origin of the stream.
//
// Docs: https://docs.datadoghq.com/data_observability/jobs_monitoring/openlineage/#dataset-naming-conventions

const OL_DD_API_KEY  = process.env.DD_API_KEY ?? '';
const OL_DD_SITE     = process.env.DD_SITE    ?? 'datadoghq.com';
const OL_HOST        = `data-obs-intake.${OL_DD_SITE}`;
const OL_PATH        = '/api/v1/lineage';
const OL_PRODUCER    = 'https://github.com/DataDog/box-box-bits-ai/checkout';
const OL_NAMESPACE   = process.env.DD_ENV ?? 'prod';
const OL_TOPIC       = 'limited_merch_transactions';
// Use first broker for the Kafka namespace (must match bq-sink's consumer namespace)
const OL_KAFKA_NS    = `kafka://${BROKERS[0] ?? '10.148.0.65:9092'}`;

function emitOLEvent(payload: object): void {
  if (!OL_DD_API_KEY || BROKERS.length === 0) return;

  const body = JSON.stringify(payload);
  const req  = https.request({
    hostname: OL_HOST,
    path:     OL_PATH,
    method:   'POST',
    headers: {
      'Content-Type':   'application/json',
      'Content-Length': Buffer.byteLength(body),
      Authorization:    `Bearer ${OL_DD_API_KEY}`,
    },
  }, res => {
    res.resume();
  });
  req.on('error', () => { /* fire-and-forget: never fail checkout for lineage */ });
  req.write(body);
  req.end();
}

function buildProducerOLEvent(
  eventType: 'START' | 'COMPLETE' | 'FAIL',
  runId: string,
  startTime: string,
  msgCount?: number,
): object {
  return {
    eventTime: eventType === 'START' ? startTime : new Date().toISOString(),
    eventType,
    run: { runId },
    job: {
      // namespace = service name so Datadog links this job to the APM service
      namespace: process.env.DD_SERVICE ?? 'box-box-bits-ai',
      name:      'checkout.kafka-publish',
      facets: {
        jobType: {
          _producer:  OL_PRODUCER,
          _schemaURL: 'https://openlineage.io/spec/facets/2-0-3/JobTypeJobFacet.json',
          processingType: 'STREAMING',
          integration:    'custom',
          jobType:        'JOB',
        },
        tags: {
          _producer:  OL_PRODUCER,
          _schemaURL: 'https://openlineage.io/spec/facets/1-0-0/TagsJobFacet.json',
          tags: [
            { name: '_dd.ol_service', value: process.env.DD_SERVICE ?? 'box-box-bits-ai' },
            { name: 'env',            value: OL_NAMESPACE },
            { name: 'topic',          value: OL_TOPIC },
          ],
        },
      },
    },
    // No explicit inputs — this service is the data origin (user checkout)
    inputs: [],
    // Output = the Kafka topic this service publishes to
    outputs: [
      {
        namespace: OL_KAFKA_NS,
        name:      OL_TOPIC,
        facets: {
          ...(msgCount !== undefined && {
            outputStatistics: {
              _producer:  OL_PRODUCER,
              _schemaURL: 'https://openlineage.io/spec/facets/1-0-3/OutputStatisticsOutputDatasetFacet.json',
              rowCount: msgCount,
            },
          }),
        },
      },
    ],
    producer: OL_PRODUCER,
  };
}

// ─── Types ────────────────────────────────────────────────────────────────────

export interface MerchCheckoutEvent {
  event_id:   string;
  product_id: string;
  user_id:    string;
  quantity:   number;
  price_thb:  number;
  team?:      string | null;
  category?:  string | null;
  event_ts:   string;
}

// ─── Publish ──────────────────────────────────────────────────────────────────

/**
 * Publishes a merch checkout event to `limited_merch_transactions`.
 *
 * Emits OpenLineage START+COMPLETE so Data Observability shows:
 *   box-box-bits-ai (checkout) → Kafka limited_merch_transactions
 *
 * Fire-and-forget — checkout does not block on Kafka ack or lineage.
 */
export async function publishCheckoutEvent(event: MerchCheckoutEvent): Promise<void> {
  const producer = await getProducer();
  if (!producer) return;

  const runId    = randomUUID();
  const startTime = new Date().toISOString();

  // Emit START before the Kafka send
  emitOLEvent(buildProducerOLEvent('START', runId, startTime));

  try {
    const avroBuffer = avroType.toBuffer({
      ...event,
      team:     event.team     ?? null,
      category: event.category ?? null,
    });

    await producer.send({
      topic: OL_TOPIC,
      compression: CompressionTypes.None,
      messages: [
        {
          key:   event.product_id,
          value: avroBuffer,
          headers: {
            'content-type': 'avro/binary',
            'schema-name':  'com.novapay.merch.MerchCheckoutEvent',
            source:         'box-box-bits-ai',
          },
        },
      ],
    });

    // COMPLETE — declares the output: this service produced to the Kafka topic
    emitOLEvent(buildProducerOLEvent('COMPLETE', runId, startTime, 1));
  } catch (err) {
    emitOLEvent(buildProducerOLEvent('FAIL', runId, startTime));
    throw err;
  }
}
