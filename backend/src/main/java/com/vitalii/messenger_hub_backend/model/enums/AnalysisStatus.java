package com.vitalii.messenger_hub_backend.model.enums;

/** Where an analysis run has got to. */
public enum AnalysisStatus {
    /** Accepted and queued; nothing has been computed yet. */
    PENDING,
    /** Metrics are done or in progress, the model may be generating. */
    RUNNING,
    /** Finished with a result. */
    DONE,
    /**
     * Finished without a model result; the reason is kept on the run. Expected whenever Ollama is
     * not running.
     */
    FAILED
}
