export const AUTH_ROLES = ["admin", "operator", "viewer"] as const;

export type AuthRole = (typeof AUTH_ROLES)[number];

export interface AuthPrincipal {
  subject: string;
  role: AuthRole;
  tenant_id?: string;
}
