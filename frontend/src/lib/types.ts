/** Shared API types. Keep in sync with backend pydantic schemas. */

export type Model = {
  id: number;
  public_name: string;
  upstream_model: string;
  provider_id: number;
  provider_name: string | null;
  display_provider: string | null;
  type: "text" | "image" | "video" | "multimodal";
  display_name: string | null;
  description: string | null;
  status: "active" | "disabled";
  visible: boolean;
  capabilities: Record<string, unknown> | null;
  max_input_tokens: number | null;
  pricing_mode: "per_token" | "per_image" | "per_second" | "per_generation";
  input_price: string | null;
  output_price: string | null;
  cache_write_price: string | null;
  cache_read_price: string | null;
  image_price: string | null;
  video_second_price: string | null;
  generation_price: string | null;
  created_at: string;
};

export type ApiKey = {
  id: number;
  name: string;
  key_prefix: string;
  status: "active" | "disabled";
  monthly_limit: string | null;
  rate_limit_rpm: number | null;
  rate_limit_tpm: number | null;
  max_concurrent_requests: number | null;
  mtd_cost: string;
  last_used_at: string | null;
  created_at: string;
};

export type Transaction = {
  id: number;
  user_id: number;
  type: "recharge" | "debit" | "refund" | "adjustment";
  amount: string;
  balance_before: string;
  balance_after: string;
  request_log_id: number | null;
  note: string | null;
  created_by_admin_id: number | null;
  created_at: string;
};

export type AdminUser = {
  id: number;
  email: string;
  display_name: string | null;
  role: "user" | "admin";
  status: "active" | "disabled";
  balance: string;
  email_verified_at: string | null;
  created_at: string;
};

export type Provider = {
  id: number;
  name: string;
  display_name: string;
  base_url: string;
  status: "active" | "disabled";
  created_at: string;
};

export type LogSummary = {
  id: number;
  user_id: number;
  api_key_id: number | null;
  api_key_prefix: string | null;
  provider_id: number | null;
  model_id: number | null;
  model_name: string | null;
  request_type: "text" | "image" | "video";
  upstream_model: string | null;
  status: "success" | "failed" | "running" | "queued";
  task_status: "queued" | "running" | "succeeded" | "failed" | null;
  prompt_tokens: number | null;
  completion_tokens: number | null;
  total_tokens: number | null;
  image_count: number | null;
  video_duration: string | null;
  cost: string;
  latency_ms: number | null;
  http_status: number | null;
  request_id: string | null;
  error_code?: string | null;
  error_message: string | null;
  asset_url: string | null;
  created_at: string;
};

export type LogDetail = LogSummary & {
  upstream_request_id: string | null;
  request_payload_json: any;
  response_payload_json: any;
};

export type HealthCheckResult = {
  model_id: number;
  public_name: string;
  upstream_model: string;
  type: string;
  ok: boolean;
  status_code: number | null;
  latency_ms: number;
  error: string | null;
  sample: string | null;
};

export type OAuthProvidersStatus = {
  google: boolean;
  github: boolean;
};

export type OAuthIdentity = {
  id: number;
  provider: "google" | "github";
  last_login_at: string | null;
  created_at: string;
};

export type PasswordChangeResponse = {
  access_token: string;
  refresh_token: string;
  token_type: "bearer";
  access_expires_in: number;
};

export type User = {
  id: number;
  email: string;
  display_name: string | null;
  role: "user" | "admin";
  status: "active" | "disabled";
  balance: string;
  has_password: boolean;
  email_verified_at: string | null;
  created_at: string;
};
