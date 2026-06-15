import { create } from 'zustand';
import {
  type Job, type Scored, type Verdict, type Tailored, type Draft, type Profile, type Lang,
  prescreen, preConfirm, evaluate, tailor, draftOutreach, CADENCE,
} from './engine';
import { SAMPLE_CV, SAMPLE_JOBS, SAMPLE_RESUMES } from './data';

export interface Contact { url: string; person: string; date: string; kind: 'contact' | 'followup' }

interface State {
  profile: Profile;
  cv: string;
  sampleIdx: number;
  scored: Scored[];
  verdicts: Record<string, Verdict>;
  tailored: Record<string, Tailored>;
  drafts: Record<string, Draft>;
  ledger: Contact[];
  // actions
  setLang: (l: Lang) => void;
  toggleTransferable: () => void;
  setCv: (t: string) => void;
  loadResume: (text: string, name?: string) => void;   // upload or paste: replaces résumé, clears results
  loadSampleCv: () => void;                             // cycles to the NEXT sample persona each click
  runScan: () => void;
  scoreOne: (url: string) => void;
  tailorOne: (url: string, directives: string[]) => void;
  draftOne: (url: string, person: string) => void;
  logContact: (url: string, person: string) => { ok: boolean; reason?: string };
}

const today = () => new Date().toISOString().slice(0, 10);
const find = (jobs: Job[], url: string) => jobs.find((j) => j.url === url);
const firstLine = (t: string) => (t.split('\n').map((l) => l.trim()).find(Boolean) || '').slice(0, 60);

export const useStore = create<State>((set, get) => ({
  profile: { name: '', language: 'en', regions: ['midwest'], levels: ['entry'], transferable: false },
  cv: '',
  sampleIdx: -1,
  scored: [],
  verdicts: {},
  tailored: {},
  drafts: {},
  ledger: [],

  setLang: (language) => set((s) => ({ profile: { ...s.profile, language } })),
  toggleTransferable: () => set((s) => ({ profile: { ...s.profile, transferable: !s.profile.transferable } })),
  setCv: (cv) => set({ cv }),

  // A fresh résumé → clear any prior results so stale scores don't mislead.
  loadResume: (text, name) =>
    set((s) => ({
      cv: text,
      profile: { ...s.profile, name: (name && name.trim()) || firstLine(text) || s.profile.name },
      scored: [], verdicts: {}, tailored: {}, drafts: {},
    })),

  loadSampleCv: () => {
    const next = (get().sampleIdx + 1) % SAMPLE_RESUMES.length;
    const r = SAMPLE_RESUMES[next];
    set((s) => ({
      sampleIdx: next,
      cv: r.text,
      profile: { ...s.profile, name: r.name },
      scored: [], verdicts: {}, tailored: {}, drafts: {},
    }));
  },

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
