import { useMemo, useState } from "react";
import { daysOpen, formatDay, kolkataDay } from "../lib/dates";
import { useHqContext } from "../lib/hq";
import { STAGE_LABEL, TEMPERATURE_LABEL } from "../lib/labels";
import {
  BRAND_IDS,
  BRAND_PREFIX,
  STAGES,
  TEMPERATURES,
  type BrandId,
  type Lead,
  type PrivateLead,
  type Stage,
  type Temperature,
} from "../lib/types";

const SHORT: Record<BrandId, string> = {
  skybox: "Skybox",
  stays: "Stays",
  fh: "F&H",
  braj: "Braj",
};

export function PipelinePanel() {
  const { data, canEdit, saveLead, deleteLead } = useHqContext();
  const today = kolkataDay();
  const brands = [...data.brands].sort((a, b) => a.order - b.order);
  const order = brands.length > 0 ? brands.map((brand) => brand.id) : [...BRAND_IDS];

  return (
    <section aria-labelledby="pipeline-heading">
      <div className="section-head">
        <h2 id="pipeline-heading">Sales pipeline</h2>
      </div>
      <div className="funnels">
        {order.map((brandId) => (
          <Funnel
            key={brandId}
            brandId={brandId}
            label={brands.find((brand) => brand.id === brandId)?.short || SHORT[brandId]}
            leads={data.leads.filter((lead) => lead.brand === brandId)}
          />
        ))}
      </div>
      {canEdit ? (
        <LeadForm leads={data.leads} onSave={saveLead} />
      ) : null}
      {order.map((brandId) => {
        const leads = data.leads
          .filter((lead) => lead.brand === brandId)
          .sort((a, b) => a.code.localeCompare(b.code));
        return (
          <div key={brandId} className="group">
            <h3 className="kicker">{SHORT[brandId]}</h3>
            {leads.length === 0 ? <p className="empty">No leads</p> : null}
            <div className="board">
              {leads.map((lead) => (
                <LeadCard
                  key={lead.code}
                  lead={lead}
                  today={today}
                  canEdit={canEdit}
                  privateLead={data.privateLeads[lead.code] ?? null}
                  onSave={saveLead}
                  onDelete={deleteLead}
                />
              ))}
            </div>
          </div>
        );
      })}
    </section>
  );
}

function Funnel({
  brandId,
  label,
  leads,
}: {
  brandId: BrandId;
  label: string;
  leads: Lead[];
}) {
  const counts = useMemo(() => {
    const tally = Object.fromEntries(STAGES.map((stage) => [stage, 0])) as Record<Stage, number>;
    for (const lead of leads) tally[lead.stage] += 1;
    return tally;
  }, [leads]);
  const summary = STAGES.map((stage) => `${STAGE_LABEL[stage]} ${counts[stage]}`).join(", ");

  return (
    <article className="funnel" aria-label={`${label} pipeline. ${summary}`}>
      <header>
        <h3>{label}</h3>
        <p className="meta">{leads.length} leads</p>
      </header>
      <div className="bar" aria-hidden="true">
        {leads.length === 0 ? <span className="bar-empty">No leads</span> : null}
        {STAGES.map((stage) =>
          counts[stage] > 0 ? (
            <span key={stage} className={`seg seg-${stage}`} style={{ flexGrow: counts[stage] }}>
              {counts[stage]}
            </span>
          ) : null,
        )}
      </div>
      <ol className="stage-nums">
        {STAGES.map((stage) => (
          <li key={`${brandId}-${stage}`}>
            <b>{counts[stage]}</b>
            <span>{STAGE_LABEL[stage]}</span>
          </li>
        ))}
      </ol>
    </article>
  );
}

function nextCode(brand: BrandId, country: string, leads: Lead[]): string {
  const prefix = BRAND_PREFIX[brand];
  const cc = country.toUpperCase();
  let max = 0;
  const pattern = new RegExp(`^${prefix}-${cc}-(\\d+)$`);
  for (const lead of leads) {
    const match = pattern.exec(lead.code);
    if (match) max = Math.max(max, Number(match[1]));
  }
  return `${prefix}-${cc}-${String(max + 1).padStart(2, "0")}`;
}

function LeadForm({
  leads,
  onSave,
}: {
  leads: Lead[];
  onSave: (lead: Lead, privateLead: PrivateLead | null) => Promise<void>;
}) {
  const [open, setOpen] = useState(false);
  const [brand, setBrand] = useState<BrandId>("skybox");
  const [country, setCountry] = useState("PT");
  const [stage, setStage] = useState<Stage>("new");
  const [temperature, setTemperature] = useState<Temperature>("warm");
  const [lastContactAt, setLastContactAt] = useState(kolkataDay());
  const [code, setCode] = useState("");
  const [name, setName] = useState("");
  const [source, setSource] = useState("");
  const [note, setNote] = useState("");
  const preview = nextCode(brand, /^[A-Za-z]{2}$/.test(country) ? country : "XX", leads);

  if (!open) {
    return (
      <button type="button" className="primary" onClick={() => setOpen(true)}>
        Add lead
      </button>
    );
  }

  return (
    <form
      className="form"
      onSubmit={(event) => {
        event.preventDefault();
        const iso = country.trim().toUpperCase();
        const finalCode = (code.trim() || preview).toUpperCase();
        const now = new Date().toISOString();
        const lead: Lead = {
          code: finalCode,
          brand,
          stage,
          temperature,
          country: iso,
          lastContactAt,
          createdAt: now,
          updatedAt: now,
        };
        const hasPrivate = Boolean(name.trim() || source.trim() || note.trim());
        const privateLead: PrivateLead | null = hasPrivate
          ? {
              code: finalCode,
              name: name.trim(),
              source: source.trim(),
              note: note.trim(),
              country: "",
              email: "",
              phone: "",
            }
          : null;
        void onSave(lead, privateLead)
          .then(() => {
            setName("");
            setSource("");
            setNote("");
            setCode("");
            setOpen(false);
          })
          .catch(() => undefined);
      }}
    >
      <label>
        Brand
        <select value={brand} onChange={(event) => setBrand(event.target.value as BrandId)}>
          {BRAND_IDS.map((id) => (
            <option key={id} value={id}>
              {SHORT[id]}
            </option>
          ))}
        </select>
      </label>
      <label>
        Country
        <input
          value={country}
          onChange={(event) => setCountry(event.target.value.toUpperCase())}
          maxLength={2}
          pattern="[A-Za-z]{2}"
          required
        />
      </label>
      <label>
        Code
        <input
          value={code}
          placeholder={preview}
          onChange={(event) => setCode(event.target.value.toUpperCase())}
        />
      </label>
      <label>
        Stage
        <select value={stage} onChange={(event) => setStage(event.target.value as Stage)}>
          {STAGES.map((item) => (
            <option key={item} value={item}>
              {STAGE_LABEL[item]}
            </option>
          ))}
        </select>
      </label>
      <label>
        Heat
        <select
          value={temperature}
          onChange={(event) => setTemperature(event.target.value as Temperature)}
        >
          {TEMPERATURES.map((item) => (
            <option key={item} value={item}>
              {TEMPERATURE_LABEL[item]}
            </option>
          ))}
        </select>
      </label>
      <label>
        Last contact
        <input
          type="date"
          value={lastContactAt}
          onChange={(event) => setLastContactAt(event.target.value)}
          required
        />
      </label>
      <label>
        Name
        <input value={name} onChange={(event) => setName(event.target.value)} maxLength={120} />
      </label>
      <label>
        Source
        <input value={source} onChange={(event) => setSource(event.target.value)} maxLength={80} />
      </label>
      <label className="wide">
        Note
        <input value={note} onChange={(event) => setNote(event.target.value)} maxLength={2000} />
      </label>
      <p className="private-hint">Name, source, and note stay in the private collection.</p>
      <div className="row">
        <button type="submit" className="primary">
          Save {code.trim() || preview}
        </button>
        <button type="button" className="ghost" onClick={() => setOpen(false)}>
          Cancel
        </button>
      </div>
    </form>
  );
}

function LeadCard({
  lead,
  today,
  canEdit,
  privateLead,
  onSave,
  onDelete,
}: {
  lead: Lead;
  today: string;
  canEdit: boolean;
  privateLead: PrivateLead | null;
  onSave: (lead: Lead, privateLead: PrivateLead | null) => Promise<void>;
  onDelete: (code: string) => Promise<void>;
}) {
  const [editing, setEditing] = useState(false);
  const age = daysOpen(lead.lastContactAt, today);
  const savePublic = (next: Lead) => onSave({ ...next, updatedAt: new Date().toISOString() }, privateLead);

  return (
    <article className="lead">
      <header>
        <h4>{lead.code}</h4>
        <span className={`heat heat-${lead.temperature}`}>{TEMPERATURE_LABEL[lead.temperature]}</span>
      </header>
      {canEdit ? (
        <div className="row">
          <label>
            Stage
            <select
              aria-label={`Stage for ${lead.code}`}
              value={lead.stage}
              onChange={(event) =>
                void savePublic({ ...lead, stage: event.target.value as Stage }).catch(() => undefined)
              }
            >
              {STAGES.map((stage) => (
                <option key={stage} value={stage}>
                  {STAGE_LABEL[stage]}
                </option>
              ))}
            </select>
          </label>
          <label>
            Heat
            <select
              aria-label={`Heat for ${lead.code}`}
              value={lead.temperature}
              onChange={(event) =>
                void savePublic({
                  ...lead,
                  temperature: event.target.value as Temperature,
                }).catch(() => undefined)
              }
            >
              {TEMPERATURES.map((item) => (
                <option key={item} value={item}>
                  {TEMPERATURE_LABEL[item]}
                </option>
              ))}
            </select>
          </label>
        </div>
      ) : (
        <p className="focus">{STAGE_LABEL[lead.stage]}</p>
      )}
      <p className="age">
        <b>{age}</b>
        <span>{age === 1 ? "day since contact" : "days since contact"}</span>
      </p>
      <p className="meta">
        {lead.country} · Last contact {formatDay(lead.lastContactAt)}
      </p>
      {canEdit && privateLead ? (
        <div className="private">
          <span className="pill">Private</span>
          {privateLead.name ? <p>{privateLead.name}</p> : null}
          {privateLead.source ? <p>Source · {privateLead.source}</p> : null}
          {privateLead.note ? <p>{privateLead.note}</p> : null}
          {privateLead.email ? <p>{privateLead.email}</p> : null}
          {privateLead.phone ? <p>{privateLead.phone}</p> : null}
        </div>
      ) : null}
      {canEdit && editing ? (
        <PrivateEditor
          lead={lead}
          privateLead={privateLead}
          onClose={() => setEditing(false)}
          onSave={onSave}
        />
      ) : null}
      {canEdit ? (
        <div className="row">
          {!editing ? (
            <button type="button" className="ghost" onClick={() => setEditing(true)}>
              Edit
            </button>
          ) : null}
          <button
            type="button"
            className="warn"
            onClick={() => {
              if (window.confirm(`Delete ${lead.code}?`)) void onDelete(lead.code);
            }}
          >
            Delete
          </button>
        </div>
      ) : null}
    </article>
  );
}

function PrivateEditor({
  lead,
  privateLead,
  onSave,
  onClose,
}: {
  lead: Lead;
  privateLead: PrivateLead | null;
  onSave: (lead: Lead, privateLead: PrivateLead | null) => Promise<void>;
  onClose: () => void;
}) {
  const [lastContactAt, setLastContactAt] = useState(lead.lastContactAt);
  const [name, setName] = useState(privateLead?.name ?? "");
  const [source, setSource] = useState(privateLead?.source ?? "");
  const [note, setNote] = useState(privateLead?.note ?? "");
  const [email, setEmail] = useState(privateLead?.email ?? "");
  const [phone, setPhone] = useState(privateLead?.phone ?? "");

  return (
    <form
      className="stack"
      onSubmit={(event) => {
        event.preventDefault();
        const now = new Date().toISOString();
        void onSave(
          { ...lead, lastContactAt, updatedAt: now },
          {
            code: lead.code,
            name: name.trim(),
            source: source.trim(),
            note: note.trim(),
            country: privateLead?.country ?? "",
            email: email.trim(),
            phone: phone.trim(),
          },
        )
          .then(onClose)
          .catch(() => undefined);
      }}
    >
      <label>
        Last contact
        <input
          type="date"
          value={lastContactAt}
          onChange={(event) => setLastContactAt(event.target.value)}
          required
        />
      </label>
      <label>
        Name
        <input value={name} onChange={(event) => setName(event.target.value)} maxLength={120} />
      </label>
      <label>
        Source
        <input value={source} onChange={(event) => setSource(event.target.value)} maxLength={80} />
      </label>
      <label>
        Note
        <input value={note} onChange={(event) => setNote(event.target.value)} maxLength={2000} />
      </label>
      <label>
        Email
        <input value={email} onChange={(event) => setEmail(event.target.value)} maxLength={120} />
      </label>
      <label>
        Phone
        <input value={phone} onChange={(event) => setPhone(event.target.value)} maxLength={40} />
      </label>
      <p className="private-hint">Private fields are founder-only.</p>
      <div className="row">
        <button type="submit" className="primary">
          Save
        </button>
        <button type="button" className="ghost" onClick={onClose}>
          Cancel
        </button>
      </div>
    </form>
  );
}
