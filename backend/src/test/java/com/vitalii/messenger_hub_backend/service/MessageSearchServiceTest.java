package com.vitalii.messenger_hub_backend.service;

import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.*;

/**
 * Covers the translation from what a user types into a tsquery — the one place where user
 * input reaches SQL text rather than a bind parameter.
 */
class MessageSearchServiceTest {

    @Test
    void singleTermBecomesAPrefixMatch() {
        assertEquals("зустріч:*", MessageSearchService.toTsQuery("зустріч"));
    }

    @Test
    void termsAreCombinedConjunctively() {
        assertEquals("project:* & deadline:*",
                MessageSearchService.toTsQuery("project deadline"));
    }

    @Test
    void punctuationSeparatesTermsAndIsDiscarded() {
        assertEquals("hello:* & world:*",
                MessageSearchService.toTsQuery("  hello, world!  "));
    }

    @Test
    void digitsAndMixedScriptsSurvive() {
        assertEquals("zoom:* & 2026:* & квітня:*",
                MessageSearchService.toTsQuery("zoom 2026 квітня"));
    }

    @Test
    void nothingSearchableYieldsNull() {
        assertNull(MessageSearchService.toTsQuery(null));
        assertNull(MessageSearchService.toTsQuery(""));
        assertNull(MessageSearchService.toTsQuery("   "));
        assertNull(MessageSearchService.toTsQuery("!!! ??? ..."));
    }

    /**
     * tsquery operators typed by the user must end up as plain terms. If any survived,
     * to_tsquery would either raise a syntax error or run a query the user did not write.
     */
    @Test
    void tsqueryOperatorsAreNeutralised() {
        String result = MessageSearchService.toTsQuery("a & b | !c :* (d)");

        assertEquals("a:* & b:* & c:* & d:*", result);
        assertFalse(result.contains("|"), "alternation must not survive");
        assertFalse(result.contains("!"), "negation must not survive");
        assertFalse(result.contains("("), "grouping must not survive");
    }

    @Test
    void aLoneOperatorIsNotASearch() {
        assertNull(MessageSearchService.toTsQuery("&&&"));
    }

    @Test
    void tooManyTermsAreCapped() {
        String result = MessageSearchService.toTsQuery(
                "a b c d e f g h i j k l m n o p");

        assertEquals(10, result.split(" & ").length,
                "the term cap keeps a pathological query from reaching the planner");
    }

    @Test
    void anOverlongTermIsTruncatedRatherThanDropped() {
        String result = MessageSearchService.toTsQuery("x".repeat(200));

        assertEquals("x".repeat(50) + ":*", result);
    }
}
