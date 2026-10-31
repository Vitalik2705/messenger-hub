package com.vitalii.messenger_hub_backend.service;

import java.text.Normalizer;
import java.util.Arrays;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Set;

/**
 * How likely two display names belong to the same person. A pure function so it can be pinned down
 * by tests. Scores only ever produce suggestions the user confirms.
 */
public final class NameSimilarity {

    /** Below this, a pair is not worth showing to the user at all. */
    public static final double SUGGESTION_THRESHOLD = 0.6;

    /** Tokens this short are initials or noise, not evidence. */
    private static final int MIN_MEANINGFUL_TOKEN = 3;

    /** Fuzzy agreement never outranks a structural rule, however close the spelling. */
    private static final double MAX_FUZZY_SCORE = 0.7;

    private NameSimilarity() {
    }

    /**
     * @param score   0.0 (nothing in common) to 1.0 (identical after normalisation)
     * @param reasons human-readable grounds, shown to the user so the suggestion can be
     *                judged rather than trusted
     */
    public record Match(double score, List<String> reasons) {

        public boolean isSuggestable() {
            return score >= SUGGESTION_THRESHOLD;
        }

        static Match none() {
            return new Match(0.0, List.of());
        }
    }

    public static Match compare(String nameA, String nameB) {
        String normA = normalise(nameA);
        String normB = normalise(nameB);
        if (normA.isEmpty() || normB.isEmpty()) return Match.none();

        if (normA.equals(normB)) {
            return new Match(1.0, List.of("імена збігаються"));
        }

        Set<String> tokensA = meaningfulTokens(normA);
        Set<String> tokensB = meaningfulTokens(normB);
        if (tokensA.isEmpty() || tokensB.isEmpty()) return Match.none();

        if (tokensA.equals(tokensB)) {
            return new Match(0.95, List.of("ті самі слова в іншому порядку"));
        }

        // "Віталій" against "Віталій Яцків": one name is the other with more detail. Common
        // when one network shows a full name and another only a first name.
        if (tokensA.containsAll(tokensB) || tokensB.containsAll(tokensA)) {
            return new Match(0.78, List.of("одне ім'я є частиною іншого"));
        }

        return fuzzy(tokensA, tokensB);
    }

    /**
     * Allowed spelling distance between two words, in edits rather than a ratio: transliteration
     * errors are absolute ("Яцків" vs "Yatskiw" differ by two letters whatever the length).
     */
    private static int maxEdits(int wordLength) {
        return wordLength <= 6 ? 1 : 2;
    }

    /**
     * How well the smaller token set is covered by the larger one. Word order does not matter, but
     * every word must find a partner: "Vitalii Yatskiv" and "Oksana Yatskiv" share a surname and
     * are still two people.
     */
    private static Match fuzzy(Set<String> tokensA, Set<String> tokensB) {
        Set<String> smaller = tokensA.size() <= tokensB.size() ? tokensA : tokensB;
        Set<String> larger = smaller == tokensA ? tokensB : tokensA;

        double total = 0.0;
        for (String token : smaller) {
            double best = 0.0;
            boolean paired = false;
            for (String candidate : larger) {
                if (levenshtein(token, candidate)
                        <= maxEdits(Math.max(token.length(), candidate.length()))) {
                    paired = true;
                    best = Math.max(best, ratio(token, candidate));
                }
            }
            // One word that matches nothing is enough to call the pair off. The result
            // carries no score: a rejected pair has nothing to rank, and returning how
            // close the last word came would let it slip past the threshold unexplained.
            if (!paired) return Match.none();
            total += best;
        }

        double agreement = total / smaller.size();
        // Words present on only one side still weaken the case, just not fatally.
        double coverage = (double) smaller.size() / larger.size();
        double score = Math.min(MAX_FUZZY_SCORE, agreement * (0.7 + 0.3 * coverage));

        if (score < SUGGESTION_THRESHOLD) return new Match(score, List.of());
        return new Match(score, List.of("імена написані по-різному, але звучать однаково"));
    }

    /**
     * Normalises a display name for comparison: transliterates Cyrillic ("Віталій" → "vitalii") and
     * drops emoji, punctuation and diacritics.
     */
    static String normalise(String raw) {
        if (raw == null) return "";

        String lowered = raw.toLowerCase();
        StringBuilder transliterated = new StringBuilder(lowered.length());
        for (int i = 0; i < lowered.length(); i++) {
            transliterated.append(transliterate(lowered.charAt(i)));
        }

        // Splits accented letters into base + combining mark, so the marks can be dropped.
        String decomposed = Normalizer.normalize(transliterated.toString(), Normalizer.Form.NFD);

        StringBuilder cleaned = new StringBuilder(decomposed.length());
        boolean lastWasSpace = true;
        for (int i = 0; i < decomposed.length(); i++) {
            char c = decomposed.charAt(i);
            if (Character.isLetterOrDigit(c)) {
                cleaned.append(c);
                lastWasSpace = false;
            } else if (!lastWasSpace) {
                cleaned.append(' ');
                lastWasSpace = true;
            }
        }
        return cleaned.toString().trim();
    }

    private static Set<String> meaningfulTokens(String normalised) {
        Set<String> tokens = new LinkedHashSet<>();
        for (String token : normalised.split(" ")) {
            if (token.length() >= MIN_MEANINGFUL_TOKEN) tokens.add(token);
        }
        // A name that is nothing but initials still deserves a comparison.
        if (tokens.isEmpty()) tokens.addAll(Arrays.asList(normalised.split(" ")));
        return tokens;
    }

    /** Levenshtein distance expressed as agreement between 0 and 1. */
    static double ratio(String a, String b) {
        if (a.equals(b)) return 1.0;
        int longest = Math.max(a.length(), b.length());
        if (longest == 0) return 1.0;
        return 1.0 - (double) levenshtein(a, b) / longest;
    }

    static int levenshtein(String a, String b) {
        int[] previous = new int[b.length() + 1];
        int[] current = new int[b.length() + 1];

        for (int j = 0; j <= b.length(); j++) previous[j] = j;

        for (int i = 1; i <= a.length(); i++) {
            current[0] = i;
            for (int j = 1; j <= b.length(); j++) {
                int substitution = previous[j - 1] + (a.charAt(i - 1) == b.charAt(j - 1) ? 0 : 1);
                current[j] = Math.min(substitution, Math.min(previous[j] + 1, current[j - 1] + 1));
            }
            int[] swap = previous;
            previous = current;
            current = swap;
        }
        return previous[b.length()];
    }

    /**
     * Cyrillic to Latin, close to the Ukrainian national scheme. Both sides use the same mapping,
     * so consistency matters more than exactness.
     */
    private static String transliterate(char c) {
        return switch (c) {
            case 'а' -> "a";  case 'б' -> "b";  case 'в' -> "v";  case 'г' -> "h";
            case 'ґ' -> "g";  case 'д' -> "d";  case 'е' -> "e";  case 'є' -> "ie";
            case 'ж' -> "zh"; case 'з' -> "z";  case 'и' -> "y";  case 'і' -> "i";
            case 'ї' -> "i";  case 'й' -> "i";  case 'к' -> "k";  case 'л' -> "l";
            case 'м' -> "m";  case 'н' -> "n";  case 'о' -> "o";  case 'п' -> "p";
            case 'р' -> "r";  case 'с' -> "s";  case 'т' -> "t";  case 'у' -> "u";
            case 'ф' -> "f";  case 'х' -> "kh"; case 'ц' -> "ts"; case 'ч' -> "ch";
            case 'ш' -> "sh"; case 'щ' -> "shch";
            // Soft and hard signs carry no sound to match on.
            case 'ь', 'ъ', '\'', '’' -> "";
            case 'ю' -> "iu"; case 'я' -> "ia";
            // Russian letters turn up in names too and must fold the same way.
            case 'ы' -> "y";  case 'э' -> "e";  case 'ё' -> "e";
            default -> String.valueOf(c);
        };
    }
}
