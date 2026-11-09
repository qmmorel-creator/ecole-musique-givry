import type { DataSource } from './api.ts';
import { createDemoSource } from './demo/index.ts';
import { createSupabaseSource } from './supabase/index.ts';

const kind = (import.meta.env.VITE_DATA_SOURCE ?? 'demo') as string;

export const isDemo = kind !== 'supabase';

export const dataSource: DataSource = isDemo ? createDemoSource() : createSupabaseSource();

export * from './api.ts';
