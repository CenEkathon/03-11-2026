import { useId, useState, type ChangeEvent, type FormEvent } from "react";
import { Badge, Card, PageHeader } from "../components/ui";
import { SAMPLE_BRIEFS } from "../lib/sampleBriefs";
import { summariseWorkerCsv, type WorkerCsvSummary } from "../lib/workerCsv";

export interface IntakeInput {
  text: string;
  fileName: string;
  workers: WorkerCsvSummary;
}

interface Props {
  onSubmit: (input: IntakeInput) => void;
}

interface AttachedFile {
  name: string;
  summary: WorkerCsvSummary;
}

/**
 * First screen of the demo. The user types a brief and attaches a worker CSV, then sends them to the mock analysis.
 * Nothing is uploaded: the analysis is simulated in the app and the plan keeps using the synthetic workforce fixture.
 */
export function Intake({ onSubmit }: Props) {
  const [text, setText] = useState("");
  const [file, setFile] = useState<AttachedFile | null>(null);
  const [fileError, setFileError] = useState<string | null>(null);
  const [reading, setReading] = useState(false);
  const textId = useId();
  const fileId = useId();

  const canSubmit = text.trim().length > 0 && file !== null && !reading;

  const onFileChange = async (e: ChangeEvent<HTMLInputElement>) => {
    const picked = e.target.files?.[0];
    setFile(null);
    setFileError(null);
    if (!picked) return;
    if (!/\.csv$/i.test(picked.name)) {
      setFileError("Attach a .csv file.");
      return;
    }
    setReading(true);
    try {
      const result = summariseWorkerCsv(await picked.text());
      if (result.ok) setFile({ name: picked.name, summary: result.summary });
      else setFileError(result.error);
    } catch {
      setFileError("The file could not be read. Try attaching it again.");
    } finally {
      setReading(false);
    }
  };

  const submit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!canSubmit || !file) return;
    onSubmit({ text: text.trim(), fileName: file.name, workers: file.summary });
  };

  return (
    <>
      <PageHeader
        title="Describe the goal and attach the workers"
        lead={
          <>
            Add the context in your own words and attach the worker list as a CSV. The analysis step is mocked and takes about
            seven seconds. Nothing is uploaded, and the plan still uses the synthetic workforce data.
          </>
        }
      />

      <form className="intake-form" onSubmit={submit} noValidate>
        <Card
          title="1. Your brief"
          description="Free text. For example, the goal, the teams involved and any constraints you want the plan to respect."
          actions={<Badge kind="MOCK" />}
        >
          <div className="field">
            <div className="field-row">
              <label htmlFor={textId} className="field-label">
                Brief
              </label>
              <div className="sample-buttons" role="group" aria-label="Fill the brief with a sample (demo)">
                <span className="muted small">Demo samples:</span>
                {SAMPLE_BRIEFS.map((s) => (
                  <button key={s.label} type="button" className="btn btn-small" onClick={() => setText(s.text)}>
                    {s.label}
                  </button>
                ))}
              </div>
            </div>
            <textarea
              id={textId}
              className="field-textarea"
              rows={6}
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder="Type the context for the plan here…"
            />
          </div>
        </Card>

        <Card
          title="2. Workers (CSV)"
          description="Header row plus one row per worker. Only the column names and row count are read at this step."
          actions={<Badge kind="SYNTHETIC" />}
        >
          <div className="field">
            <label htmlFor={fileId} className="field-label">
              CSV file
            </label>
            <input
              id={fileId}
              className="field-file"
              type="file"
              accept=".csv,text/csv"
              onChange={onFileChange}
              aria-invalid={fileError ? true : undefined}
              aria-describedby={`${fileId}-status`}
            />
            <div id={`${fileId}-status`} className="field-status" role={fileError ? "alert" : "status"} aria-live="polite">
              {reading ? <span className="muted">Reading the file…</span> : null}
              {fileError ? <span className="field-error">{fileError}</span> : null}
              {file && !reading ? (
                <span>
                  <strong>{file.name}</strong>: {file.summary.rowCount} worker rows, {file.summary.headers.length} columns (
                  {file.summary.headers.join(", ")})
                </span>
              ) : null}
            </div>
          </div>
        </Card>

        <div className="intake-actions">
          <p className="muted small">The text and file stay in this browser tab. Refreshing the page starts again here.</p>
          <button type="submit" className="btn btn-primary" disabled={!canSubmit}>
            Send for analysis
          </button>
        </div>
      </form>
    </>
  );
}
