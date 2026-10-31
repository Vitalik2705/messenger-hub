package com.vitalii.messenger_hub_backend.model.enums;

import java.util.Map;

/**
 * Ways to rank chats in a batch, each turning a chat's metrics into one comparable score. Chats
 * that cannot answer the question score null and drop out rather than sorting to an end.
 */
public enum BatchRanking {

    /** Where the other side is waiting longest — the debt list. */
    UNANSWERED("Найдовше без відповіді") {
        @Override
        public Double score(Map<String, Object> metrics) {
            return number(metrics, "debt", "hoursWaiting");
        }
    },

    /** Where the user is slowest to answer, in seconds. */
    MY_RESPONSE("Я відповідаю найдовше") {
        @Override
        public Double score(Map<String, Object> metrics) {
            return number(metrics, "responseTime", "myMedianSeconds");
        }
    },

    /** The busiest conversations. */
    VOLUME("Найбільше повідомлень") {
        @Override
        public Double score(Map<String, Object> metrics) {
            return number(metrics, "volume", "total");
        }
    },

    /** Conversations shrinking fastest: the negated slope, so the steepest decline comes first. */
    FADING("Найшвидше згасають") {
        @Override
        public Double score(Map<String, Object> metrics) {
            Double slope = number(metrics, "trend", "messagesPerWeekSlope");
            return slope == null ? null : -slope;
        }
    },

    /** Where the user carries the conversation — highest share of messages written by them. */
    MY_SHARE("Пишу переважно я") {
        @Override
        public Double score(Map<String, Object> metrics) {
            return number(metrics, "volume", "myShare");
        }
    },

    /** The most nocturnal correspondence. */
    NIGHT("Найбільше нічного") {
        @Override
        public Double score(Map<String, Object> metrics) {
            return number(metrics, "rhythm", "nightShare");
        }
    };

    private final String label;

    BatchRanking(String label) {
        this.label = label;
    }

    public String getLabel() {
        return label;
    }

    /** Higher is more interesting. Null means this chat cannot answer this question. */
    public abstract Double score(Map<String, Object> metrics);

    @SuppressWarnings("unchecked")
    protected static Double number(Map<String, Object> metrics, String group, String key) {
        Object section = metrics.get(group);
        if (!(section instanceof Map)) return null;
        Object value = ((Map<String, Object>) section).get(key);
        return value instanceof Number n ? n.doubleValue() : null;
    }
}
