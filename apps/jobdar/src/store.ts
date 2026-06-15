import { create } from 'zustand';
import {
  type Job, type Scored, type Verdict, type Tailored, type Draft, type Profile, type Lang,
  prescreen, preConfirm, evaluate, tailor, draftOutreach, CADENCE,
} from './engine';
import { SAMPLE_CV, SAMPLE_JOBS } from './data';

export interface Contact { url: string; person: string; date: string; kind: 'contact' | 'followup' }

interface State {
  profile: Profile;
  cv: string;
  scored: Scored[];                       // Search results (prescreen + pre-confirm)
  verdicts: Record<string, Verdict>;      // Apply: url → verdict
  tailored: Record<string, Tailored>;     // Apply: url → tailored CV/cover
  drafts: Record<string, Draft>;          // Follow-up: url → outreach draft
  ledger: Contact[];                      // Follow-up cadence ledger
  // actions
  setLang: (l: Lang) => void;
  toggleTransferable: () => void;
  setCv: (t: string) => void;
  loadSampleCv: () => void;
  runScan: () => void;
  scoreOne: (url: string) => void;
  tailorOne: (url: string, directives: string[]) => void;
  draftOne: (url: string, person: string) => void;
  logContact: (url: string, person: string) => { ok: boolean; reason?: string };
}

const today = () => new Date().toISOString().slice(0, 10);
const find = (jobs: Job[], url: string) => jobs.find((j) => j.url === url);

export const useStore = create<State>((set, get) => ({
  profile: { name: 'Jordan Rivera', language: 'en', regions: ['midwest'], levels: ['entry'], transferable: false },
  cv: '',
  scored: [],
  verdicts: {},
  tailored: {},
  drafts: {},
  ledger: [],

  setLang: (language) => set((s) => ({ profile: { ...s.profile, language } })),
  toggleTransferable: () => set((s) => ({ profile: { ...s.profile, transferable: !s.profile.transferable } })),
  setCv: (cv) => set({ cv }),
  loadSampleCv: () => set({ cv: SAMPLE_CV }),

  runScan: () => {
    const { cv, profile } = get();
    const text = cv.trim() || SAMPLE_CV;
    const scored = prescreen(SAMPLE_JOBS, text, profile).map((j) => ({ ...j, confirm: preConfirm(j) }));
    set({ cv: text, scored });
  },

  scoreOne: (url) => {
    const { cv, profile, verdicts } = get();
    const job = find(SAMPLE_JOBS, url);
    if (!job) return;
    set({ verdicts: { ...verdicts, [url]: evaluate(job, cv || SAMPLE_CV, profile) } });
  },

  tailorOne: (url, directives) => {
    const { cv, profile, tailored } = get();
    const job = find(SAMPLE_JOBS, url);
    if (!job) return;
    set({ tailored: { ...tailored, [url]: tailor(job, cv || SAMPLE_CV, profile, directives) } });
  },

  draftOne: (url, person) => {
    const { cv, drafts } = get();
    const job = find(SAMPLE_JOBS, url);
    if (!job) return;
    set({ drafts: { ...drafts, [url]: draftOutreach(job, cv || SAMPLE_CV, person || 'Alex Kim') } });
  },

  // Cadence enforced in code (mirrors the CLI): max 2 contacts/role, no duplicate person.
  logContact: (url, person) => {
    const { ledger } = get();
    const forRole = ledger.filter((e) => e.url === url && e.kind === 'contact');
    if (forRole.some((e) => e.person.trim().toLowerCase() === person.trim().toLowerCase()))
      return { ok: false, reason: 'duplicate_person' };
    if (forRole.length >= CADENCE.maxContactsPerRole) return { ok: false, reason: 'role_cap' };
    set({ ledger: [...ledger, { url, person, date: today(), kind: 'contact' }] });
    return { ok: true };
  },
}));
