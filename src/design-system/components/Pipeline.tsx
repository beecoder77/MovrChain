export type PipelineStepState = "pending" | "active" | "done";

export type PipelineStep = {
  id: string;
  label: string;
  state: PipelineStepState;
};

type PipelineProps = {
  steps: PipelineStep[];
};

const STEP_STATE_LABEL: Record<PipelineStepState, string> = {
  pending: "Pending",
  active: "In progress",
  done: "Complete",
};

export function Pipeline({ steps }: PipelineProps) {
  return (
    <ol className="ds-pipeline" aria-label="Verification progress">
      {steps.map((step) => (
        <li
          key={step.id}
          className={`ds-pipeline__step ds-pipeline__step--${step.state}`}
          aria-current={step.state === "active" ? "step" : undefined}
        >
          <span className="ds-pipeline__dot" aria-hidden />
          <span className="ds-pipeline__label">{step.label}</span>
          <span className="sr-only"> — {STEP_STATE_LABEL[step.state]}</span>
        </li>
      ))}
    </ol>
  );
}
