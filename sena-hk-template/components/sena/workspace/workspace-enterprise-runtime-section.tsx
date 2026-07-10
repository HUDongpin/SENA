import {
  EnterpriseRuntimePanel,
  type EnterpriseRuntimePanelProps
} from "./enterprise-runtime-panel";

export type WorkspaceEnterpriseRuntimeSectionProps = {
  runtimeProps: EnterpriseRuntimePanelProps;
};

export function WorkspaceEnterpriseRuntimeSection({ runtimeProps }: WorkspaceEnterpriseRuntimeSectionProps) {
  const panelProps = {
    ...runtimeProps
  } satisfies EnterpriseRuntimePanelProps;

  return <EnterpriseRuntimePanel {...panelProps} />;
}
