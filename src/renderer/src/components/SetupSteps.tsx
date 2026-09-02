import { CopyableUrl } from '@/components/CopyableUrl'

export interface SetupStep {
  text: string
  /** A dashboard URL or exact value (redirect URI, ...) the step needs — shown as a copy-button row, same as a scene's Browser Source address in Scene Builder, rather than plain text easy to mistype. */
  link?: string
}

/** Numbered walkthrough for connecting a third-party integration — each step's own link/redirect URI is copyable rather than left as prose the user has to select by hand. */
export function SetupSteps({ steps }: { steps: SetupStep[] }) {
  return (
    <ol className="flex flex-col gap-2.5">
      {steps.map((step, index) => (
        <li key={index} className="flex gap-2.5">
          <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-medium text-foreground">
            {index + 1}
          </span>
          <div className="flex min-w-0 flex-1 flex-col gap-1 pt-0.5">
            <span className="text-sm text-muted-foreground">{step.text}</span>
            {step.link && <CopyableUrl url={step.link} />}
          </div>
        </li>
      ))}
    </ol>
  )
}
