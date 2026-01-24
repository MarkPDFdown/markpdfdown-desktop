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
    error?: string | null;
}