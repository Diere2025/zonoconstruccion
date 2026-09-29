export const FUTURE_DEVELOPMENTS_OWNER_ID = '381df0d1-183f-4ccb-aaf2-8147c76159a9';

export const futureDevelopmentStatuses = {
  idea: 'Idea',
  planned: 'Pendiente de desarrollo',
  in_progress: 'En desarrollo',
  done: 'Implementado',
} as const;

export type FutureDevelopmentStatus = keyof typeof futureDevelopmentStatuses;

export interface FutureDevelopmentDocument {
  id: string;
  slug: string;
  title: string;
  status: FutureDevelopmentStatus;
  content_md: string;
  version: number;
  created_at: string;
  updated_at: string;
}

export type FutureDevelopmentSummary = Omit<FutureDevelopmentDocument, 'content_md'>;
