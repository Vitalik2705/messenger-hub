package com.vitalii.messenger_hub_backend.model.enums;

import java.util.Map;

/**
 * What "interesting" means when scanning every chat at once.
 *
 * The point of a batch is not to read fifty analyses — nobody does — but to decide which
 * three are worth the model's time. Each ranking below turns a chat's metrics into a single
 * comparable number, and the top of that list is what gets read.
 *
 * Chats that cannot answer a given question score null and drop out rather than sorting to
 * one end: a chat with four replies has no median response time, and putting it first
 * because "0" sorts low would be the ranking lying about its own confidence.
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

    /**
     * The exchanges shrinking fastest. Scored as the negated slope, so the steepest
     * decline sorts first while chats that are growing fall to the bottom.
     */
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
