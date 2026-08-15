import { getReportsCopy } from '../domain/copy';
import type { ReportPayload } from '../domain/types';
import { formatReportGeneratedAt } from '../application/generate-report';

export function ReportPrintView({ payload }: { payload: ReportPayload }) {
  const copy = getReportsCopy(payload.locale);
  const generated = formatReportGeneratedAt(payload.generatedAt, payload.locale);

  return (
    <article className="report-print mx-auto max-w-3xl bg-white p-6 text-[15px] text-black" dir={payload.dir}>
      <h1 className="text-2xl font-semibold">{payload.title}</h1>
      <p className="mt-2 text-sm">
        <strong>{copy.generatedAt}:</strong> {generated}
      </p>
      <p className="mt-1 text-sm">{copy.snapshotNote}</p>
      <dl className="mt-4 grid gap-1 text-sm">
        <div>
          <dt className="inline font-medium">{copy.identity.company}: </dt>
          <dd className="inline">{payload.identity.companyName}</dd>
        </div>
        {payload.identity.projectName ? (
          <div>
            <dt className="inline font-medium">{copy.identity.project}: </dt>
            <dd className="inline">{payload.identity.projectName}</dd>
          </div>
        ) : null}
        {payload.identity.projectNumber ? (
          <div>
            <dt className="inline font-medium">{copy.identity.projectNumber}: </dt>
            <dd className="inline">{payload.identity.projectNumber}</dd>
          </div>
        ) : null}
        {payload.identity.clientName ? (
          <div>
            <dt className="inline font-medium">{copy.identity.client}: </dt>
            <dd className="inline">{payload.identity.clientName}</dd>
          </div>
        ) : null}
      </dl>
      {payload.notices.length > 0 ? (
        <ul className="mt-4 list-disc ps-5 text-sm">
          {payload.notices.map((notice) => (
            <li key={notice}>{notice}</li>
          ))}
        </ul>
      ) : null}
      {payload.sections.map((section) => (
        <section key={section.id} className="mt-6">
          <h2 className="border-b border-neutral-300 pb-1 text-lg font-semibold">{section.heading}</h2>
          {section.rows && section.rows.length > 0 ? (
            <table className="mt-3 w-full border-collapse text-sm">
              <tbody>
                {section.rows.map((row) => (
                  <tr key={`${section.id}-${row.label}`} className="border-b border-neutral-200">
                    <th className="w-[38%] py-1 pe-3 text-start font-medium">{row.label}</th>
                    <td className="py-1">
                      {row.value}
                      {row.nature ? (
                        <span className="ms-2 text-xs text-neutral-600">{copy.natures[row.nature]}</span>
                      ) : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : null}
          {section.tables?.map((table, tableIndex) => (
            <table key={`${section.id}-t${tableIndex}`} className="mt-3 w-full border-collapse text-sm">
              <thead>
                <tr>
                  {table.headers.map((header) => (
                    <th key={header} className="border border-neutral-300 bg-neutral-100 px-2 py-1 text-start">
                      {header}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {table.rows.map((row, rowIndex) => (
                  <tr key={`${section.id}-r${rowIndex}`}>
                    {row.map((cell, cellIndex) => (
                      <td key={`${rowIndex}-${cellIndex}`} className="border border-neutral-300 px-2 py-1">
                        {cell}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          ))}
          {section.paragraphs?.map((paragraph) => (
            <p key={paragraph} className="mt-2 text-sm text-neutral-700">
              {paragraph}
            </p>
          ))}
        </section>
      ))}
    </article>
  );
}
