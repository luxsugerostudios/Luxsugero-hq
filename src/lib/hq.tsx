import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import {
  getRedirectResult,
  GoogleAuthProvider,
  onAuthStateChanged,
  signInWithPopup,
  signInWithRedirect,
  signOut,
  type User,
} from "firebase/auth";
import {
  collection,
  deleteDoc,
  doc,
  onSnapshot,
  writeBatch,
  type DocumentData,
} from "firebase/firestore";
import { FOUNDER_EMAIL, isFirebaseConfigured } from "../firebaseConfig";
import { getServices } from "./firebase";
import {
  loadSeed,
  mapAgent,
  mapBrand,
  mapDirective,
  mapLead,
  mapPerson,
  mapPrivateLead,
  mapTask,
} from "./map";
import type { DashboardData, Directive, Lead, PrivateLead, Task } from "./types";
import { EMPTY_DASHBOARD } from "./types";

export type Phase = "unconfigured" | "connecting" | "live" | "denied" | "unreachable";

const CONNECT_MS = 8000;

export type HqValue = {
  configured: boolean;
  phase: Phase;
  user: User | null;
  founderAccount: boolean;
  canEdit: boolean;
  viewOnly: boolean;
  data: DashboardData;
  actionError: string | null;
  clearActionError: () => void;
  signIn: () => Promise<void>;
  signOutUser: () => Promise<void>;
  saveTask: (task: Task) => Promise<void>;
  deleteTask: (id: string) => Promise<void>;
  saveLead: (lead: Lead, privateLead: PrivateLead | null) => Promise<void>;
  deleteLead: (code: string) => Promise<void>;
  saveDirective: (directive: Directive) => Promise<void>;
};

const HqContext = createContext<HqValue | null>(null);

export function useHqContext(): HqValue {
  const value = useContext(HqContext);
  if (!value) throw new Error("HQ context is missing");
  return value;
}

function codeOf(error: unknown): string {
  if (error && typeof error === "object" && "code" in error) {
    return String((error as { code: string }).code);
  }
  return "";
}

function readable(error: unknown): string {
  const code = codeOf(error);
  if (code.includes("unauthorized-domain")) {
    return "This domain is not authorized for Google sign-in yet.";
  }
  if (code.includes("permission-denied")) {
    return "Firestore refused the write. Publish firestore.rules, then try again.";
  }
  if (error && typeof error === "object" && "message" in error) {
    return String((error as { message: string }).message)
      .replace(/^Firebase:\s*/i, "")
      .slice(0, 280);
  }
  return "Something went wrong talking to Firebase.";
}

function mapped<T>(
  docs: Array<{ id: string; data: () => DocumentData }>,
  map: (id: string, raw: unknown) => T | null,
): T[] {
  const rows: T[] = [];
  for (const item of docs) {
    const row = map(item.id, item.data());
    if (row) rows.push(row);
  }
  return rows;
}

export function HqProvider({ children }: { children: ReactNode }) {
  const configured = isFirebaseConfigured();
  const services = configured ? getServices() : null;
  const [user, setUser] = useState<User | null>(null);
  const [phase, setPhase] = useState<Phase>(configured ? "connecting" : "unconfigured");
  const [data, setData] = useState<DashboardData>(() => loadSeed());
  const [actionError, setActionError] = useState<string | null>(null);

  const founderAccount = Boolean(
    user?.email &&
      user.email.toLowerCase() === FOUNDER_EMAIL &&
      user.emailVerified,
  );
  const canEdit = founderAccount && phase === "live";
  const viewOnly = Boolean(user) && !founderAccount;

  useEffect(() => {
    if (!services) return;
    let active = true;
    void getRedirectResult(services.auth).catch((error: unknown) => {
      if (active) setActionError(readable(error));
    });
    const unsub = onAuthStateChanged(services.auth, (next) => {
      if (active) setUser(next);
    });
    return () => {
      active = false;
      unsub();
    };
  }, [services]);

  useEffect(() => {
    if (!services) return;
    const db = services.db;
    let failed = false;
    let settled = false;
    const seen = new Set<string>();
    const buffer: DashboardData = {
      ...EMPTY_DASHBOARD,
      people: [],
      tasks: [],
      agents: [],
      brands: [],
      leads: [],
    };

    const finish = () => {
      if (failed || settled || seen.size < 5) return;
      settled = true;
      setData((prev) => ({
        ...buffer,
        directives: prev.directives,
        privateLeads: prev.privateLeads,
      }));
      setPhase("live");
    };

    const fail = (error: unknown) => {
      if (failed) return;
      failed = true;
      const denied = codeOf(error).includes("permission-denied");
      setPhase(denied ? "denied" : "unreachable");
      setData(loadSeed());
    };

    const listen = (
      name: "people" | "tasks" | "agents" | "brands" | "leads",
      apply: (docs: Array<{ id: string; data: () => DocumentData }>) => void,
    ) =>
      onSnapshot(
        collection(db, name),
        (snap) => {
          if (failed) return;
          apply(snap.docs);
          seen.add(name);
          finish();
        },
        (error) => fail(error),
      );

    const unsubs = [
      listen("people", (docs) => {
        buffer.people = mapped(docs, mapPerson);
      }),
      listen("tasks", (docs) => {
        buffer.tasks = mapped(docs, mapTask);
      }),
      listen("agents", (docs) => {
        buffer.agents = mapped(docs, mapAgent);
      }),
      listen("brands", (docs) => {
        buffer.brands = mapped(docs, mapBrand);
      }),
      listen("leads", (docs) => {
        buffer.leads = mapped(docs, mapLead);
      }),
    ];

    const timer = window.setTimeout(() => {
      if (!settled && !failed) setPhase("unreachable");
    }, CONNECT_MS);

    return () => {
      window.clearTimeout(timer);
      for (const unsub of unsubs) unsub();
    };
  }, [services]);

  useEffect(() => {
    if (!services || !canEdit) {
      setData((prev) =>
        prev.directives.length === 0 && Object.keys(prev.privateLeads).length === 0
          ? prev
          : { ...prev, directives: [], privateLeads: {} },
      );
      return;
    }
    const db = services.db;
    const unsubDirectives = onSnapshot(
      collection(db, "directives"),
      (snap) => {
        const directives = mapped(snap.docs, mapDirective);
        setData((prev) => ({ ...prev, directives }));
      },
      (error) => setActionError(readable(error)),
    );
    const unsubPrivate = onSnapshot(
      collection(db, "private", "vault", "leads"),
      (snap) => {
        const privateLeads: Record<string, PrivateLead> = {};
        for (const item of snap.docs) {
          const lead = mapPrivateLead(item.id, item.data());
          if (lead) privateLeads[lead.code] = lead;
        }
        setData((prev) => ({ ...prev, privateLeads }));
      },
      (error) => setActionError(readable(error)),
    );
    return () => {
      unsubDirectives();
      unsubPrivate();
    };
  }, [services, canEdit]);

  const api = useMemo<HqValue>(() => {
    async function requireDb() {
      if (!services || !canEdit) {
        const message = "Editing is limited to the signed-in founder.";
        setActionError(message);
        throw new Error(message);
      }
      return services.db;
    }

    return {
      configured,
      phase,
      user,
      founderAccount,
      canEdit,
      viewOnly,
      data,
      actionError,
      clearActionError: () => setActionError(null),
      async signIn() {
        if (!services) return;
        const provider = new GoogleAuthProvider();
        provider.setCustomParameters({ prompt: "select_account" });
        try {
          await signInWithPopup(services.auth, provider);
        } catch (error) {
          const code = codeOf(error);
          if (code.includes("popup-blocked")) {
            await signInWithRedirect(services.auth, provider);
            return;
          }
          if (code.includes("popup-closed")) return;
          setActionError(readable(error));
        }
      },
      async signOutUser() {
        if (!services) return;
        await signOut(services.auth);
        setData((prev) => ({ ...prev, directives: [], privateLeads: {} }));
      },
      async saveTask(task) {
        const db = await requireDb();
        const ref = doc(db, "tasks", task.id);
        await writeBatch(db)
          .set(ref, {
            id: task.id,
            title: task.title,
            ownerId: task.ownerId,
            givenDate: task.givenDate,
            dueDate: task.dueDate,
            status: task.status,
            closedAt: task.closedAt,
            longTerm: task.longTerm,
            flagAfterDays: task.flagAfterDays,
            createdAt: task.createdAt,
            updatedAt: task.updatedAt,
          })
          .commit()
          .catch((error: unknown) => {
            setActionError(readable(error));
            throw error;
          });
      },
      async deleteTask(id) {
        const db = await requireDb();
        await deleteDoc(doc(db, "tasks", id)).catch((error: unknown) => {
          setActionError(readable(error));
          throw error;
        });
      },
      async saveLead(lead, privateLead) {
        const db = await requireDb();
        const batch = writeBatch(db);
        batch.set(doc(db, "leads", lead.code), {
          code: lead.code,
          brand: lead.brand,
          stage: lead.stage,
          temperature: lead.temperature,
          country: lead.country,
          lastContactAt: lead.lastContactAt,
          createdAt: lead.createdAt,
          updatedAt: lead.updatedAt,
        });
        if (privateLead) {
          batch.set(doc(db, "private", "vault", "leads", lead.code), {
            code: privateLead.code,
            name: privateLead.name,
            source: privateLead.source,
            note: privateLead.note,
            country: privateLead.country,
            email: privateLead.email,
            phone: privateLead.phone,
            updatedAt: lead.updatedAt,
          });
        }
        await batch.commit().catch((error: unknown) => {
          setActionError(readable(error));
          throw error;
        });
      },
      async deleteLead(code) {
        const db = await requireDb();
        const batch = writeBatch(db);
        batch.delete(doc(db, "leads", code));
        batch.delete(doc(db, "private", "vault", "leads", code));
        await batch.commit().catch((error: unknown) => {
          setActionError(readable(error));
          throw error;
        });
      },
      async saveDirective(directive) {
        const db = await requireDb();
        await writeBatch(db)
          .set(doc(db, "directives", directive.id), {
            id: directive.id,
            agentId: directive.agentId,
            text: directive.text,
            status: directive.status,
            response: directive.response,
            createdAt: directive.createdAt,
            updatedAt: directive.updatedAt,
          })
          .commit()
          .catch((error: unknown) => {
            setActionError(readable(error));
            throw error;
          });
      },
    };
  }, [
    actionError,
    canEdit,
    configured,
    data,
    founderAccount,
    phase,
    services,
    user,
    viewOnly,
  ]);

  return <HqContext.Provider value={api}>{children}</HqContext.Provider>;
}
