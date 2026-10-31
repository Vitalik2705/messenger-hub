package com.vitalii.messenger_hub_backend.model.enums;

/**
 * The measurable questions an analysis can be asked to answer.
 *
 * These are computed from the archived messages with plain arithmetic — no model is involved
 * and none is needed. They are exact, they are reproducible, and they run over the whole
 * archive in milliseconds, which is what makes it affordable to decide *afterwards* which
 * few chats are worth the cost of a language model.
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

    /**
     * Whether the other side is still waiting for an answer, and for how long.
     *
     * The one metric that is about now rather than about history — and the only thing here
     * that changes on its own between two runs of the same chat.
     */
    DEBT("Без відповіді");

    private final String label;

    AnalysisMetric(String label) {
        this.label = label;
    }

    public String getLabel() {
        return label;
    }
}
