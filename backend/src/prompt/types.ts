export interface PromptVersion {
  id: string;
  tenant_id: string;
  agent_id: string;
  version: number;
  template: string;
  is_active: boolean;
  created_at: string;
}

export interface BuiltContext {
  prompt_template: string;
  context_text: string;
  token_estimate: number;
  truncated: boolean;
  budget?: BudgetReport;
}

export interface SectionBudget {
  name: string;
  allocated: number;
  used: number;
  truncated: boolean;
}

export interface BudgetReport {
  total_budget: number;
  total_used: number;
  sections: SectionBudget[];
}
