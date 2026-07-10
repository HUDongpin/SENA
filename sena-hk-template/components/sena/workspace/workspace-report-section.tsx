import type { ComponentProps } from "react";
import { FileText } from "lucide-react";
import { ReportGenerator } from "./report-generator";
import { Panel } from "./workspace-primitives";

export type WorkspaceReportSectionProps = ComponentProps<typeof ReportGenerator>;

export function WorkspaceReportSection(props: WorkspaceReportSectionProps) {
  return (
    <div className="mt-5">
      <Panel id="workflow-report" title="Report Generator" icon={FileText}>
        <ReportGenerator {...props} />
      </Panel>
    </div>
  );
}
