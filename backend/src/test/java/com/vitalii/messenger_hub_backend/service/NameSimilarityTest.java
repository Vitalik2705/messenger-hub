package com.vitalii.messenger_hub_backend.service;

import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.*;

/**
 * Pins down when two display names are treated as the same person.
 *
 * Both directions matter and are tested: missing a real link costs the user a manual
 * search, but suggesting a wrong one invites them to merge two different people.
 */
class NameSimilarityTest {

    @Test
    void identicalNamesMatchExactly() {
        NameSimilarity.Match match = NameSimilarity.compare("Vitalii Yatskiv", "Vitalii Yatskiv");

        assertEquals(1.0, match.score());
        assertTrue(match.isSuggestable());
    }

    /** The case the whole feature exists for: the same person across two networks. */
    @Test
    void cyrillicAndLatinSpellingsOfTheSameNameMatch() {
        NameSimilarity.Match match = NameSimilarity.compare("Віталій Яцків", "Vitalii Yatskiv");

        assertTrue(match.isSuggestable(),
                "transliteration must bridge the two alphabets, score was " + match.score());
        assertFalse(match.reasons().isEmpty(), "a suggestion must explain itself");
    }

    @Test
    void aCyrillicFirstNameMatchesItsLatinForm() {
        assertTrue(NameSimilarity.compare("Віталій", "Vitalii").isSuggestable());
        assertTrue(NameSimilarity.compare("Оксана", "Oksana").isSuggestable());
    }

    @Test
    void wordOrderDoesNotMatter() {
        NameSimilarity.Match match = NameSimilarity.compare("Yatskiv Vitalii", "Vitalii Yatskiv");

        assertEquals(0.95, match.score());
    }

    @Test
    void aFirstNameMatchesTheFullNameItIsPartOf() {
        NameSimilarity.Match match = NameSimilarity.compare("Vitalii", "Vitalii Yatskiv");

        assertEquals(0.78, match.score());
        assertTrue(match.isSuggestable());
    }

    @Test
    void decorationInDisplayNamesIsIgnored() {
        assertEquals(1.0, NameSimilarity.compare("Оксана 🌸", "оксана!!!").score());
        assertEquals("vitalii yatskiv", NameSimilarity.normalise("  Vitalii   Yatskiv 🇺🇦 "));
    }

    @Test
    void unrelatedNamesAreNotSuggested() {
        assertFalse(NameSimilarity.compare("Vitalii Yatskiv", "Dmytro Kovalenko").isSuggestable());
        assertFalse(NameSimilarity.compare("Support Bot", "Оксана").isSuggestable());
    }

    /**
     * Relatives and colleagues share surnames. A shared surname alone must not be enough,
     * or every family in the address book gets merged into one contact.
     */
    @Test
    void aSharedSurnameAloneIsNotEnough() {
        NameSimilarity.Match match = NameSimilarity.compare("Vitalii Yatskiv", "Oksana Yatskiv");

        assertFalse(match.isSuggestable(),
                "a shared surname must not suggest a link, score was " + match.score());
    }

    @Test
    void namesWithNothingComparableScoreZero() {
        assertEquals(0.0, NameSimilarity.compare(null, "Vitalii").score());
        assertEquals(0.0, NameSimilarity.compare("Vitalii", "").score());
        assertEquals(0.0, NameSimilarity.compare("🎉🎉", "Vitalii").score());
    }

    @Test
    void aStructuralMatchAlwaysOutranksASpellingMatch() {
        double reordered = NameSimilarity.compare("Yatskiv Vitalii", "Vitalii Yatskiv").score();
        double misspelt = NameSimilarity.compare("Vitaliy Yatskiw", "Vitalii Yatskiv").score();

        assertTrue(reordered > misspelt,
                "certain evidence must rank above approximate evidence");
    }

    /**
     * The UI shows the reasons next to the score, so a suggestion without them asks the user
     * to decide on no stated grounds. This once slipped through: the "these names disagree"
     * path returned how close the last word came, and that number cleared the threshold.
     */
    @Test
    void everySuggestionCarriesItsGrounds() {
        String[][] pairs = {
                {"Віталій Яцків", "Vitaliy Yatskiw"},
                {"Vitalii Yatskiv", "Oksana Yatskiv"},
                {"Оксана", "Оксана Яцків"},
                {"Босс Дмитро", "Dmytro Kovalenko"},
                {"Support Bot", "Vitalii"},
                {"Ольга", "Olga"},
        };

        for (String[] pair : pairs) {
            NameSimilarity.Match match = NameSimilarity.compare(pair[0], pair[1]);
            if (match.isSuggestable()) {
                assertFalse(match.reasons().isEmpty(),
                        "«" + pair[0] + "» ↔ «" + pair[1] + "» scored "
                                + match.score() + " with nothing to show the user");
            }
        }
    }

    /**
     * Transliteration is lossy in both directions, so the same surname routinely differs by
     * two characters from however its owner spells it in Latin.
     */
    @Test
    void aTransliteratedSurnameStillMatchesItsOwnersOwnSpelling() {
        NameSimilarity.Match match = NameSimilarity.compare("Віталій Яцків", "Vitaliy Yatskiw");

        assertTrue(match.isSuggestable(), "score was " + match.score());
        assertFalse(match.reasons().isEmpty());
    }

    /** Ольга spells herself Olga as often as Olha; г maps to h, and both must still meet. */
    @Test
    void aSingleLetterTransliterationChoiceDoesNotBreakAMatch() {
        assertTrue(NameSimilarity.compare("Ольга", "Olga").isSuggestable());
        assertTrue(NameSimilarity.compare("Ольга Шевченко", "Olga Shevchenko").isSuggestable());
    }

    @Test
    void levenshteinCountsSingleCharacterEdits() {
        assertEquals(0, NameSimilarity.levenshtein("vitalii", "vitalii"));
        assertEquals(1, NameSimilarity.levenshtein("vitalii", "vitaliy"));
        assertEquals(3, NameSimilarity.levenshtein("kitten", "sitting"));
        assertEquals(7, NameSimilarity.levenshtein("", "vitalii"));
    }
}
