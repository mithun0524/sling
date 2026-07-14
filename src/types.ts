export interface SlingRequest {
  method: string;
  url: string;
  headers: Record<string, string>;
  body: string | null;
  vars: string[];
}

export type Store = Record<string, SlingRequest>;
