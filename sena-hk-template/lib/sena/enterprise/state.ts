import type { SenaEnterpriseDb } from "../enterprise";

export type SenaEnterpriseStateStore = {
  kind: "synchronous-enterprise-state-store";
  read: () => SenaEnterpriseDb;
  write: (db: SenaEnterpriseDb) => void;
  save: (db: SenaEnterpriseDb) => void;
};

export function createEnterpriseStateStore(input: {
  read: () => SenaEnterpriseDb;
  write: (db: SenaEnterpriseDb) => void;
  save: (db: SenaEnterpriseDb) => void;
}): SenaEnterpriseStateStore {
  return {
    kind: "synchronous-enterprise-state-store",
    read: input.read,
    write: input.write,
    save: input.save
  };
}
