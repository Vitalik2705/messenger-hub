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
     * Finished without one. The reason is kept on the run: a failed model call is the
     * expected case here, not an exceptional one — Ollama is a separate process the user
     * controls and can simply not be running.
     */
    FAILED
}
