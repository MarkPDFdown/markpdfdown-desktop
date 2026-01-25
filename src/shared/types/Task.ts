export interface Task {
    id?: string;
    filename?: string;
    type?: string;
    page_range?: string;
    pages?: number;
    provider?: number;
    model?: string;
    model_name?: string;
    progress?: number;
    status?: number;
    completed_count?: number;
    failed_count?: number;
    error?: string | null;
    worker_id?: string | null;
    merged_path?: string | null;
}
