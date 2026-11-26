import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useRef,
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
  collectionGroup,
  deleteDoc,
  doc,
  onSnapshot,
  setDoc,
  updateDoc,
  writeBatch,
  type DocumentData,
} from "firebase/firestore";
import { FOUNDER_EMAIL, isFirebaseConfigured } from "../firebaseConfig";
import { getServices } from "./firebase";
import { kolkataDay } from "./dates";
import {
  loadSeed,
  mapAgent,
  mapBrand,
  mapDirective,
  mapHistory,
  mapInbox,
  mapLead,
  mapPerson,
  mapPrivateLead,
  mapTask,
} from "./map";
import { mapPipeline } from "./pipeline";
import { buildPublicSnapshot, snapshotContentKey } from "./publicSnapshot";
import type {
  DashboardData,
  Directive,
  InboxItem,
  Lane,
  Lead,
  PrivateLead,
  RolesDoc,
  Task,
} from "./types";
import { EMPTY_DASHBOARD } from "./types";

export type Access = "signed-out" | "pending" | "guest" | "member" | "admin";

function readPreviewRole(): { access: "admin" | "member"; personId: string } | null {
  if (!import.meta.env.DEV || typeof window === "undefined") return null;
  const value = new URLSearchParams(window.location.search).get("as");
  if (value === "admin") return { access: "admin", personId: "founder" };
  if (value === "member") return { access: "member", personId: "hari-om" };
  return null;
}

export type Phase = "unconfigured" | "connecting" | "live" | "denied" | "unreachable";

const CONNECT_MS = 8000;

export type HqValue = {
  configured: boolean;
  phase: Phase;
  user: User | null;
  founderAccount: boolean;
  canEdit: boolean;
  isAdmin: boolean;
  isMember: boolean;
  access: Access;
  personId: string | null;
  viewOnly: boolean;
  data: DashboardData;
  actionError: string | null;
  clearActionError: () => void;
  signIn: () => Promise<void>;
  signOutUser: () => Promise<void>;
  saveTask: (task: Task, summary?: string) => Promise<void>;
  setTaskStatus: (task: Task, status: Task["status"]) => Promise<void>;
  placeTask: (task: Task, lane: Lane) => Promise<void>;
  setTaskNote: (task: Task, note: string) => Promise<void>;
  reassignTask: (task: Task, ownerId: string) => Promise<void>;
  deleteTask: (id: string) => Promise<void>;
  createInbox: (item: InboxItem) => Promise<void>;
  updateInbox: (id: string, patch: Partial<Pick<InboxItem, "status" | "response" | "note" | "assignees" | "taskId" | "dueDate">>) => Promise<void>;
  acceptInbox: (item: InboxItem) => Promise<void>;
  convertInbox: (item: InboxItem, ownerId: string) => Promise<void>;
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
  const [rolesDoc, setRolesDoc] = useState<RolesDoc | null>(null);
  const [rolesState, setRolesState] = useState<"idle" | "loading" | "ready" | "denied">("idle");

  const founderAccount = Boolean(
    user?.email &&
      user.email.toLowerCase() === FOUNDER_EMAIL &&
      user.emailVerified,
  );
  const email = user?.email?.toLowerCase() ?? "";
  const mappedPerson =
    email && rolesDoc && typeof rolesDoc.members?.[email] === "string"
      ? rolesDoc.members[email]
      : "";
  const listedAdmin = Boolean(
    email && rolesDoc?.admins?.some((item) => item.toLowerCase() === email),
  );
  let access: Access = "signed-out";
  let personId: string | null = null;
  if (!user) {
    access = "signed-out";
  } else if (!user.emailVerified) {
    access = "guest";
  } else if (phase !== "live") {
    access = founderAccount ? "admin" : "pending";
    personId = founderAccount ? mappedPerson || "founder" : null;
  } else if (founderAccount || listedAdmin) {
    access = "admin";
    personId = mappedPerson || (founderAccount ? "founder" : "admin");
  } else if (mappedPerson) {
    access = "member";
    personId = mappedPerson;
  } else if (rolesState === "loading" || rolesState === "idle") {
    access = "pending";
  } else {
    access = "guest";
  }
  const preview = readPreviewRole();
  if (preview) {
    access = preview.access;
    personId = preview.personId;
  }
  const canEdit = founderAccount && phase === "live";
  const isAdmin = (access === "admin" && phase === "live") || preview?.access === "admin";
  const isMember = (access === "member" && phase === "live") || preview?.access === "member";
  const viewOnly = access === "guest";

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

    // Called on every snapshot. The first complete set flips the phase to live;
    // every later snapshot must also reach the screen, or writes look like they
    // did nothing until a reload.
    const finish = () => {
      if (failed || seen.size < 5) return;
      const first = !settled;
      settled = true;
      setData((prev) => ({
        ...prev,
        people: buffer.people,
        tasks: buffer.tasks,
        agents: buffer.agents,
        brands: buffer.brands,
        leads: buffer.leads,
      }));
      if (first) setPhase("live");
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
    if (!services || phase !== "live") return;
    const db = services.db;
    const unsubInbox = onSnapshot(
      collection(db, "inbox"),
      (snap) => {
        setData((prev) => ({ ...prev, inbox: mapped(snap.docs, mapInbox) }));
      },
      () => {
        setData((prev) => ({ ...prev, inbox: [] }));
      },
    );
    const unsubHistory = onSnapshot(
      collectionGroup(db, "history"),
      (snap) => {
        const history: DashboardData["history"] = {};
        for (const item of snap.docs) {
          const taskId = item.ref.parent.parent?.id;
          if (!taskId) continue;
          const event = mapHistory(item.id, taskId, item.data());
          if (!event) continue;
          history[taskId] = [...(history[taskId] ?? []), event];
        }
        // Firestore returns events by random doc id; show them oldest first.
        for (const events of Object.values(history)) events.sort((a, b) => a.at.localeCompare(b.at));
        setData((prev) => ({ ...prev, history }));
      },
      () => {
        setData((prev) => ({ ...prev, history: {} }));
      },
    );
    return () => {
      unsubInbox();
      unsubHistory();
    };
  }, [services, phase]);

  useEffect(() => {
    if (!services || phase !== "live" || (!isAdmin && !isMember)) return;
    const db = services.db;
    const listen = (id: "skybox" | "fnh") =>
      onSnapshot(
        doc(db, "pipeline", id),
        (snap) => {
          const board = snap.exists() ? mapPipeline(id, snap.data()) : null;
          setData((prev) => {
            const rest = prev.pipelines.filter((item) => item.id !== id);
            return { ...prev, pipelines: board ? [...rest, board] : rest };
          });
        },
        () => {
          setData((prev) => ({ ...prev, pipelines: prev.pipelines.filter((item) => item.id !== id) }));
        },
      );
    const unsubs = [listen("skybox"), listen("fnh")];
    return () => {
      for (const unsub of unsubs) unsub();
    };
  }, [services, phase, isAdmin, isMember]);

  const publishedKey = useRef("");
  useEffect(() => {
    if (!services || phase !== "live" || !isAdmin) return;
    const snapshot = buildPublicSnapshot({
      people: data.people,
      tasks: data.tasks,
      agents: data.agents,
      brands: data.brands,
      pipelines: data.pipelines,
    });
    const key = snapshotContentKey(snapshot);
    if (key === publishedKey.current) return;
    const handle = window.setTimeout(() => {
      publishedKey.current = key;
      void setDoc(doc(services.db, "public", "snapshot"), snapshot).catch((error: unknown) => {
        publishedKey.current = "";
        setActionError(readable(error));
      });
    }, 1200);
    return () => window.clearTimeout(handle);
  }, [services, phase, isAdmin, data.people, data.tasks, data.agents, data.brands, data.pipelines]);

  useEffect(() => {
    if (!services || !user || phase !== "live") {
      setRolesDoc(null);
      setRolesState(user && phase === "live" ? "loading" : "idle");
      return;
    }
    setRolesState("loading");
    return onSnapshot(
      doc(services.db, "config", "roles"),
      (snap) => {
        if (!snap.exists()) {
          setRolesDoc({ admins: [], members: {} });
          setRolesState("ready");
          return;
        }
        const raw = snap.data() as { admins?: unknown; members?: unknown };
        const admins = Array.isArray(raw.admins)
          ? raw.admins.filter((item): item is string => typeof item === "string")
          : [];
        const members: Record<string, string> = {};
        if (raw.members && typeof raw.members === "object") {
          for (const [key, value] of Object.entries(raw.members)) {
            members[key.toLowerCase()] = typeof value === "string" ? value : "";
          }
        }
        setRolesDoc({ admins, members });
        setRolesState("ready");
      },
      (error) => {
        setRolesDoc(null);
        setRolesState(codeOf(error).includes("permission-denied") ? "denied" : "ready");
      },
    );
  }, [services, user, phase]);

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

    function actorId() {
      return personId || (founderAccount ? "founder" : "admin");
    }

    async function writeHistory(taskId: string, action: string, summary: string) {
      if (!services || !personId) return;
      await setDoc(doc(services.db, "tasks", taskId, "history", crypto.randomUUID()), {
        personId: actorId(),
        action,
        summary,
        at: new Date().toISOString(),
      }).catch((error: unknown) => {
        setActionError(readable(error));
      });
    }

    function taskPayload(task: Task) {
      return {
        id: task.id,
        title: task.title,
        ownerId: task.ownerId,
        givenDate: task.givenDate,
        dueDate: task.dueDate,
        status: task.status,
        lane: task.lane,
        closedAt: task.closedAt,
        longTerm: task.longTerm,
        flagAfterDays: task.flagAfterDays,
        note: task.note,
        brand: task.brand,
        inboxId: task.inboxId,
        createdAt: task.createdAt,
        updatedAt: task.updatedAt,
      };
    }

    return {
      configured,
      phase,
      user,
      founderAccount,
      canEdit,
      isAdmin,
      isMember,
      access,
      personId,
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
      async saveTask(task, summary = "Updated the task") {
        if (!services || !isAdmin) {
          const message = "Only an admin can assign or edit a task.";
          setActionError(message);
          throw new Error(message);
        }
        const creating = !data.tasks.some((item) => item.id === task.id);
        await setDoc(doc(services.db, "tasks", task.id), taskPayload(task)).catch((error: unknown) => {
          setActionError(readable(error));
          throw error;
        });
        await writeHistory(task.id, creating ? "created" : "updated", summary);
      },
      async setTaskStatus(task, status) {
        if (!services || (!isAdmin && !isMember)) {
          const message = "Sign in with a registered account to update a task.";
          setActionError(message);
          throw new Error(message);
        }
        const updatedAt = new Date().toISOString();
        const closedAt = status === "done" ? updatedAt : null;
        await updateDoc(doc(services.db, "tasks", task.id), {
          status,
          lane: status === "done" ? "done" : "todo",
          closedAt,
          updatedAt,
        }).catch((error: unknown) => {
          setActionError(readable(error));
          throw error;
        });
        await writeHistory(task.id, "status", status === "done" ? "Marked done" : "Reopened");
      },
      async placeTask(task, lane) {
        const mine = Boolean(personId && task.ownerId === personId);
        if (!services || (!isAdmin && !(isMember && mine))) {
          const message = "You can only move your own tasks.";
          setActionError(message);
          throw new Error(message);
        }
        const updatedAt = new Date().toISOString();
        const status = lane === "done" ? "done" : "open";
        await updateDoc(doc(services.db, "tasks", task.id), {
          status,
          lane,
          closedAt: status === "done" ? updatedAt : null,
          updatedAt,
        }).catch((error: unknown) => {
          setActionError(readable(error));
          throw error;
        });
        const label = lane === "todo" ? "To do" : lane === "doing" ? "Doing" : lane === "waiting" ? "Waiting" : "Done";
        await writeHistory(task.id, "status", `Moved to ${label}`);
      },
      async setTaskNote(task, note) {
        if (!services || (!isAdmin && !isMember)) {
          const message = "Sign in with a registered account to comment.";
          setActionError(message);
          throw new Error(message);
        }
        const updatedAt = new Date().toISOString();
        await updateDoc(doc(services.db, "tasks", task.id), { note, updatedAt }).catch(
          (error: unknown) => {
            setActionError(readable(error));
            throw error;
          },
        );
        await writeHistory(task.id, "noted", "Updated the note");
      },
      async reassignTask(task, ownerId) {
        if (!services || !isAdmin) {
          const message = "Only an admin can reassign a task.";
          setActionError(message);
          throw new Error(message);
        }
        const updatedAt = new Date().toISOString();
        await updateDoc(doc(services.db, "tasks", task.id), { ownerId, updatedAt }).catch(
          (error: unknown) => {
            setActionError(readable(error));
            throw error;
          },
        );
        await writeHistory(task.id, "reassigned", `Reassigned to ${ownerId}`);
      },
      async deleteTask(id) {
        if (!services || !isAdmin) {
          const message = "Only an admin can delete a task.";
          setActionError(message);
          throw new Error(message);
        }
        await writeHistory(id, "deleted", "Deleted the task");
        await deleteDoc(doc(services.db, "tasks", id)).catch((error: unknown) => {
          setActionError(readable(error));
          throw error;
        });
      },
      async createInbox(item) {
        if (!services || (!isAdmin && !isMember) || !personId) {
          const message = "Sign in with a registered account to add a request.";
          setActionError(message);
          throw new Error(message);
        }
        await setDoc(doc(services.db, "inbox", item.id), {
          title: item.title,
          details: item.details,
          raisedBy: personId,
          assignees: item.assignees,
          dueDate: item.dueDate,
          brand: item.brand,
          status: "new",
          response: null,
          note: null,
          taskId: null,
          createdAt: item.createdAt,
          updatedAt: item.updatedAt,
        }).catch((error: unknown) => {
          setActionError(readable(error));
          throw error;
        });
      },
      async updateInbox(id, patch) {
        if (!services || (!isAdmin && !isMember)) {
          const message = "Sign in with a registered account to update a request.";
          setActionError(message);
          throw new Error(message);
        }
        const next: Record<string, unknown> = { updatedAt: new Date().toISOString() };
        if (patch.status) next.status = patch.status;
        if ("response" in patch) next.response = patch.response;
        if ("note" in patch) next.note = patch.note;
        if (isAdmin && patch.assignees) next.assignees = patch.assignees;
        if (isAdmin && "taskId" in patch) next.taskId = patch.taskId;
        if (isAdmin && "dueDate" in patch) next.dueDate = patch.dueDate;
        await updateDoc(doc(services.db, "inbox", id), next).catch((error: unknown) => {
          setActionError(readable(error));
          throw error;
        });
      },
      async acceptInbox(item) {
        if (!services || !isMember || !personId) {
          const message = "Only a tagged member can accept a request.";
          setActionError(message);
          throw new Error(message);
        }
        if (item.status !== "new" || data.tasks.some((task) => task.inboxId === item.id)) {
          const message = "This request is already a task.";
          setActionError(message);
          throw new Error(message);
        }
        const now = new Date().toISOString();
        const taskId = crypto.randomUUID();
        const task: Task = {
          id: taskId,
          title: item.title,
          ownerId: personId,
          givenDate: kolkataDay(),
          dueDate: item.dueDate,
          status: "open",
          lane: "todo",
          closedAt: null,
          longTerm: false,
          flagAfterDays: null,
          note: "",
          brand: item.brand,
          inboxId: item.id,
          createdAt: now,
          updatedAt: now,
        };
        await setDoc(doc(services.db, "tasks", taskId), taskPayload(task)).catch((error: unknown) => {
          setActionError(readable(error));
          throw error;
        });
        await updateDoc(doc(services.db, "inbox", item.id), {
          status: "picked_up",
          updatedAt: now,
        }).catch((error: unknown) => {
          setActionError(readable(error));
          throw error;
        });
        await writeHistory(taskId, "accepted", "Accepted from the main bucket");
      },
      async convertInbox(item, ownerId) {
        if (!services || !isAdmin) {
          const message = "Only an admin can convert a request into a task.";
          setActionError(message);
          throw new Error(message);
        }
        if (item.taskId || data.tasks.some((task) => task.inboxId === item.id)) {
          const message = "This request is already a task.";
          setActionError(message);
          throw new Error(message);
        }
        const now = new Date().toISOString();
        const taskId = crypto.randomUUID();
        const task: Task = {
          id: taskId,
          title: item.title,
          ownerId,
          givenDate: kolkataDay(),
          dueDate: item.dueDate,
          status: "open",
          lane: "todo",
          closedAt: null,
          longTerm: false,
          flagAfterDays: null,
          note: "",
          brand: item.brand,
          inboxId: item.id,
          createdAt: now,
          updatedAt: now,
        };
        await setDoc(doc(services.db, "tasks", taskId), taskPayload(task)).catch((error: unknown) => {
          setActionError(readable(error));
          throw error;
        });
        await updateDoc(doc(services.db, "inbox", item.id), {
          status: "picked_up",
          taskId,
          updatedAt: now,
        }).catch((error: unknown) => {
          setActionError(readable(error));
          throw error;
        });
        await writeHistory(taskId, "created", `Converted from the main bucket for ${ownerId}`);
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
    access,
    configured,
    data,
    founderAccount,
    isAdmin,
    isMember,
    personId,
    phase,
    services,
    user,
    viewOnly,
  ]);

  return <HqContext.Provider value={api}>{children}</HqContext.Provider>;
}
