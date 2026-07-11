import {
  Activity,
  CheckCircle2,
  Database,
  FileText,
  GitMerge,
  RotateCcw,
  ShieldCheck
} from "lucide-react";
import { buttonStyles } from "@/components/Primitives";
import type { EnterpriseTeamState } from "./enterprise-contracts";

type EnterpriseGovernanceNotificationsHandler = () => unknown | Promise<unknown>;
type EnterpriseNotificationReadHandler = (notificationId: string) => unknown | Promise<unknown>;

export type EnterpriseGovernanceNotificationsPanelProps = {
  disabled: boolean;
  busy: boolean;
  enterpriseTeamState: EnterpriseTeamState | null;
  enterpriseNotifications: EnterpriseTeamState["notifications"];
  unreadEnterpriseNotificationCount: number;
  onExportGovernanceHealthJson: EnterpriseGovernanceNotificationsHandler;
  onExportSecurityPostureJson: EnterpriseGovernanceNotificationsHandler;
  onExportAuditCsv: EnterpriseGovernanceNotificationsHandler;
  onExportBackupJson: EnterpriseGovernanceNotificationsHandler;
  onDeliverAuditLog: EnterpriseGovernanceNotificationsHandler;
  onDeliverBackup: EnterpriseGovernanceNotificationsHandler;
  onSyncDatabase: EnterpriseGovernanceNotificationsHandler;
  onRefreshNotifications: EnterpriseGovernanceNotificationsHandler;
  onDeliverNotifications: EnterpriseGovernanceNotificationsHandler;
  onDeliverEmails: EnterpriseGovernanceNotificationsHandler;
  onMarkNotificationRead: EnterpriseNotificationReadHandler;
};

export function EnterpriseGovernanceNotificationsPanel({
  disabled,
  busy,
  enterpriseTeamState,
  enterpriseNotifications,
  unreadEnterpriseNotificationCount,
  onExportGovernanceHealthJson,
  onExportSecurityPostureJson,
  onExportAuditCsv,
  onExportBackupJson,
  onDeliverAuditLog,
  onDeliverBackup,
  onSyncDatabase,
  onRefreshNotifications,
  onDeliverNotifications,
  onDeliverEmails,
  onMarkNotificationRead
}: EnterpriseGovernanceNotificationsPanelProps) {
  return (
    <>
      <div data-testid="enterprise-governance-exports" data-visual-role="enterprise-governance-artifact-exports" className="grid gap-3 rounded-lg border border-cardBorder/45 bg-background/35 p-3">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="text-xs font-black uppercase text-muted">Governance exports</div>
            <div className="mt-1 text-xs font-semibold leading-5 text-muted">
              sena-enterprise-governance/v1 · sena-enterprise-audit-delivery/v1 · sena-enterprise-backup-delivery/v1 · sena-enterprise-database-sync/v1
            </div>
          </div>
        </div>
        <div className="grid gap-2 sm:grid-cols-2">
          <button type="button" data-testid="enterprise-governance-health-export" onClick={() => void onExportGovernanceHealthJson()} disabled={disabled} className={buttonStyles({ variant: "secondary", size: "sm" })}>
            <ShieldCheck className="h-4 w-4" /> Health JSON
          </button>
          <button type="button" data-testid="enterprise-governance-security-export" onClick={() => void onExportSecurityPostureJson()} disabled={disabled} className={buttonStyles({ variant: "secondary", size: "sm" })}>
            <ShieldCheck className="h-4 w-4" /> Security JSON
          </button>
          <button type="button" data-testid="enterprise-governance-audit-csv-export" onClick={() => void onExportAuditCsv()} disabled={disabled} className={buttonStyles({ variant: "secondary", size: "sm" })}>
            <FileText className="h-4 w-4" /> Audit CSV
          </button>
          <button type="button" data-testid="enterprise-governance-backup-export" onClick={() => void onExportBackupJson()} disabled={disabled} className={buttonStyles({ variant: "secondary", size: "sm" })}>
            <Database className="h-4 w-4" /> Backup JSON
          </button>
          <button type="button" data-testid="enterprise-governance-audit-delivery" onClick={() => void onDeliverAuditLog()} disabled={disabled} className={buttonStyles({ variant: "secondary", size: "sm" })}>
            <Activity className="h-4 w-4" /> Audit delivery
          </button>
          <button type="button" data-testid="enterprise-governance-backup-delivery" onClick={() => void onDeliverBackup()} disabled={disabled} className={buttonStyles({ variant: "secondary", size: "sm" })}>
            <Database className="h-4 w-4" /> Backup delivery
          </button>
          <button type="button" data-testid="enterprise-governance-database-sync" onClick={() => void onSyncDatabase()} disabled={disabled} className={buttonStyles({ variant: "secondary", size: "sm" })}>
            <GitMerge className="h-4 w-4" /> Database sync
          </button>
        </div>
      </div>
      <div data-testid="enterprise-notification-center" data-visual-role="enterprise-notification-center" className="grid gap-3 rounded-lg border border-cardBorder/45 bg-background/35 p-3">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="text-xs font-black uppercase text-muted">Notifications</div>
            <div className="mt-1 text-xs font-semibold leading-5 text-muted">
              {enterpriseTeamState
                ? `${unreadEnterpriseNotificationCount} unread · ${enterpriseNotifications.length} visible · sena-enterprise-notifications/v1`
                : "Sign in to load in-app notifications and delivery evidence."}
            </div>
          </div>
          <button type="button" data-testid="enterprise-notification-refresh" onClick={() => void onRefreshNotifications()} disabled={disabled} className={buttonStyles({ variant: "secondary", size: "sm" })}>
            <RotateCcw className="h-4 w-4" /> Notifications
          </button>
        </div>
        <div className="grid gap-2 sm:grid-cols-2">
          <button type="button" data-testid="enterprise-notification-deliver" onClick={() => void onDeliverNotifications()} disabled={disabled} className={buttonStyles({ variant: "secondary", size: "sm" })}>
            <Activity className="h-4 w-4" /> Deliver webhook
          </button>
          <button type="button" data-testid="enterprise-notification-deliver-email" onClick={() => void onDeliverEmails()} disabled={disabled} className={buttonStyles({ variant: "secondary", size: "sm" })}>
            <FileText className="h-4 w-4" /> Deliver email
          </button>
        </div>
        <div className="grid gap-2">
          {enterpriseNotifications.length === 0 && (
            <div className="grid gap-2 rounded-lg border border-cardBorder/30 bg-background/30 p-2 text-xs font-semibold text-muted lg:grid-cols-[minmax(0,1fr)_auto] lg:items-center">
              <div>No visible notifications loaded.</div>
              <button data-testid="enterprise-notification-mark-read" type="button" disabled className={buttonStyles({ variant: "secondary", size: "sm" })}>
                <CheckCircle2 className="h-4 w-4" /> Mark read
              </button>
            </div>
          )}
          {enterpriseNotifications.slice(0, 4).map((notification) => (
            <div key={notification.id} className="grid gap-2 rounded-lg border border-cardBorder/30 bg-background/30 p-2 text-xs font-semibold text-muted lg:grid-cols-[minmax(0,1fr)_auto] lg:items-center">
              <div className="min-w-0">
                <div className="truncate font-black text-foreground">
                  {notification.title} · {notification.status}
                </div>
                <div className="truncate">
                  {notification.kind} · {new Date(notification.createdAt).toLocaleString()}
                </div>
              </div>
              <button
                data-testid="enterprise-notification-mark-read"
                type="button"
                onClick={() => void onMarkNotificationRead(notification.id)}
                disabled={busy || notification.status === "read"}
                className={buttonStyles({ variant: "secondary", size: "sm" })}
              >
                <CheckCircle2 className="h-4 w-4" /> {notification.status === "read" ? "Read" : "Mark read"}
              </button>
            </div>
          ))}
        </div>
      </div>
    </>
  );
}
