package com.vitalii.messenger_hub_backend.model.enums;

/**
 * Metrics computed from archived messages with plain arithmetic, no model: exact, reproducible, and
 * fast enough to run on the whole archive before choosing which chats the model reads.
 */
public enum AnalysisMetric {

    /** How much was said, and by whom. */
    VOLUME("Обсяг і баланс"),

    /** Who starts a conversation after a long silence. */
    INITIATIVE("Ініціатива"),

    /** How long each side takes to answer the other. */
    RESPONSE_TIME("Час відповіді"),

    /** When the conversation happens — hour of day, day of week, share at night. */
    RHYTHM("Ритм"),

    /** Message length and how often each side asks something. */
    STYLE("Стиль"),

    /** How long the correspondence has run and how many days were active. */
    SPAN("Тривалість"),

    /** Whether the exchange is growing or fading, as a per-week slope. */
    TREND("Динаміка"),

    /** Whether the other side is still waiting for an answer, and for how long. */
    DEBT("Без відповіді");

    private final String label;

    AnalysisMetric(String label) {
        this.label = label;
    }

    public String getLabel() {
        return label;
    }
}
