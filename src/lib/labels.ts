import type { BrandStatus, DirectiveStatus, Stage, Temperature } from "./types";

export const STAGE_LABEL: Record<Stage, string> = {
  new: "New",
  contacted: "Contacted",
  meet_booked: "Meet booked",
  proposal: "Proposal",
  deposit: "Deposit",
  won: "Won",
  lost: "Lost",
};

export const TEMPERATURE_LABEL: Record<Temperature, string> = {
  hot: "Hot",
  warm: "Warm",
  cold: "Cold",
};

export const BRAND_STATUS_LABEL: Record<BrandStatus, string> = {
  active: "Active",
  paused: "Paused",
  "founder-led": "Founder-led",
};

export const DIRECTIVE_STATUS_LABEL: Record<DirectiveStatus, string> = {
  queued: "Queued",
  picked_up: "Picked up",
  done: "Done",
};
