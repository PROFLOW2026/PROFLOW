/**
 * Isolated Flight serialization harness (no product writes).
 * Run: node --conditions=react-server docs/audits/evidence/.../flight-rsc-props.harness.mjs
 */
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import React from 'react';
import { renderToReadableStream, registerClientReference } from 'next/dist/compiled/react-server-dom-webpack/server.node.js';

const evidenceDir = path.dirname(fileURLToPath(import.meta.url));

function buildMonthReviewShape() {
  const now = new Date('2026-10-01T12:00:00.000Z');
  const month = {
    id: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
    organizationId: 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
    employeeId: 'cccccccc-cccc-cccc-cccc-cccccccccccc',
    yearMonth: '2026-10',
    currency: 'ILS',
    estimatedAmount: '8250.000000',
    actualAmount: null,
    knownAmount: '8250.000000',
    knownQuality: 'estimated',
    source: 'compensation_derived',
    recognitionSource: 'monthly_allocated',
    status: 'applied',
    notes: null,
    lockedAt: new Date('2026-10-15T08:00:00.000Z'),
    adjustsMonthId: null,
    createdAt: now,
    updatedAt: new Date('2026-10-02T06:00:00.000Z'),
  };
  return {
    available: true,
    employeeId: month.employeeId,
    yearMonth: month.yearMonth,
    month,
    run: {
      id: 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee',
      organizationId: month.organizationId,
      employeeMonthCostId: month.id,
      method: 'hours',
      status: 'applied',
      currency: 'ILS',
      allocatedAmount: '8250.000000',
      unallocatedAmount: '0.000000',
      companyOnlyAmount: '0.000000',
      explanation: null,
      supersedesRunId: null,
      appliedAt: new Date('2026-10-20T10:00:00.000Z'),
      createdAt: new Date('2026-10-18T10:00:00.000Z'),
      updatedAt: new Date('2026-10-20T10:00:00.000Z'),
    },
    lines: [],
    preview: {
      knownAmount: '8250.00',
      knownQuality: 'estimated',
      allocatedAmount: '8250.00',
      unallocatedAmount: '0.00',
      status: 'balanced',
    },
    months: [
      month,
      {
        ...month,
        id: 'dddddddd-dddd-dddd-dddd-dddddddddddd',
        yearMonth: '2026-09',
        createdAt: new Date('2026-09-01T12:00:00.000Z'),
        updatedAt: new Date('2026-09-02T12:00:00.000Z'),
      },
    ],
    pendingSubmittedHours: '0',
  };
}

function MonthlyEmployerCostReviewClient({ initialReview }) {
  return React.createElement('div', { 'data-testid': 'month-review' }, initialReview?.yearMonth ?? 'none');
}

const ClientRef = registerClientReference(
  MonthlyEmployerCostReviewClient,
  '',
  'MonthlyEmployerCostReviewClient',
);

const webpackMap = {
  '': {
    MonthlyEmployerCostReviewClient: {
      id: './monthly-employer-cost-review.tsx',
      name: 'MonthlyEmployerCostReviewClient',
      chunks: [],
    },
  },
};

function ServerEmployeeDetailPage({ initialReview }) {
  return React.createElement(ClientRef, { initialReview, payrollApprovalMode: true });
}

async function flightEncode(initialReview) {
  const errors = [];
  const stream = await renderToReadableStream(
    React.createElement(ServerEmployeeDetailPage, { initialReview }),
    {
      webpackMap,
      onError(error) {
        errors.push(error);
      },
    },
  );
  const reader = stream.getReader();
  const dec = new TextDecoder();
  let payload = '';
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    payload += dec.decode(value);
  }
  return { errors, payload };
}

const reviewWithDates = buildMonthReviewShape();
const result = await flightEncode(reviewWithDates);

const summary = {
  hypothesis: 'Date fields in initialReview break Flight RSC→client serialization',
  reviewHadDateInstances: reviewWithDates.month.createdAt instanceof Date,
  flightErrors: result.errors.map((e) => ({ message: e.message, stack: e.stack?.split('\n').slice(0, 6) })),
  flightSucceeded: result.errors.length === 0,
  payloadBytes: result.payload.length,
  payloadContainsFlightDateTag: result.payload.includes('"$D'),
  jsonStringifyCoercesDatesToStrings:
    typeof JSON.parse(JSON.stringify(reviewWithDates)).month.createdAt === 'string',
};

const logDir = path.join(evidenceDir, 'logs');
await mkdir(logDir, { recursive: true });
const logPath = path.join(logDir, 'flight-harness-output.json');
const payloadPath = path.join(logDir, 'flight-harness-payload.txt');
await writeFile(logPath, JSON.stringify(summary, null, 2));
await writeFile(payloadPath, result.payload.slice(0, 8000));

console.log(JSON.stringify(summary, null, 2));
