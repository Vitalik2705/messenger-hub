package com.vitalii.messenger_hub_backend.service;

import org.junit.jupiter.api.Test;

import java.util.Comparator;
import java.util.List;

import static com.vitalii.messenger_hub_backend.service.SemanticSearchService.*;
import static org.junit.jupiter.api.Assertions.*;

/**
 * The arithmetic every semantic result rests on.
 *
 * Nothing here talks to a model — these are the four operations that decide which message
 * comes back, and each has a failure mode that produces plausible-looking nonsense rather
 * than an error: a byte order flipped in packing returns unrelated messages with confident
 * scores, and a missing normalisation ranks long messages above relevant ones.
 */
class SemanticVectorTest {

    /** Packing and unpacking must be exact — a vector is meaningless if it drifts. */
    @Test
    void survivesPackingUnchanged() {
        float[] original = {0.1f, -0.5f, 3.25f, 0f, -0.0001f, 12345.6f};
        float[] restored = unpack(pack(original));

        assertArrayEquals(original, restored, 0f,
                "a stored vector must come back bit-identical, or every score shifts");
        assertEquals(original.length * 4, pack(original).length,
                "float32 packing must be four bytes per dimension");
    }

    @Test
    void normalisesToUnitLength() {
        float[] unit = normalise(new float[]{3f, 4f});

        assertEquals(0.6f, unit[0], 1e-6);
        assertEquals(0.8f, unit[1], 1e-6);
        assertEquals(1.0, Math.sqrt(dot(unit, unit)), 1e-6);
    }

    /** A zero vector has no direction; dividing by its length would produce NaNs. */
    @Test
    void leavesAZeroVectorAlone() {
        float[] zero = normalise(new float[]{0f, 0f, 0f});
        for (float value : zero) assertEquals(0f, value);
    }

    /**
     * Cosine over unit vectors: identical direction scores 1, opposite −1, perpendicular 0.
     * These three anchor the whole ranking.
     */
    @Test
    void scoresDirectionRatherThanMagnitude() {
        float[] a = normalise(new float[]{1f, 1f});
        float[] same = normalise(new float[]{5f, 5f});      // same direction, longer
        float[] perpendicular = normalise(new float[]{1f, -1f});
        float[] opposite = normalise(new float[]{-1f, -1f});

        assertEquals(1.0, dot(a, same), 1e-6,
                "length must not affect similarity, or long messages outrank relevant ones");
        assertEquals(0.0, dot(a, perpendicular), 1e-6);
        assertEquals(-1.0, dot(a, opposite), 1e-6);
    }

    /** The end-to-end shape: pack, store, unpack, rank — nearest first. */
    @Test
    void ranksTheNearestVectorFirst() {
        record Candidate(String name, float[] vector) {}
        float[] query = normalise(new float[]{1f, 0f, 0f});

        List<Candidate> stored = List.of(
                new Candidate("майже те саме", normalise(unpack(pack(new float[]{0.9f, 0.1f, 0f})))),
                new Candidate("не про те", normalise(unpack(pack(new float[]{0f, 1f, 0f})))),
                new Candidate("зовсім інше", normalise(unpack(pack(new float[]{-1f, 0f, 0f})))));

        List<String> ranked = stored.stream()
                .sorted(Comparator.comparingDouble((Candidate c) -> dot(query, c.vector())).reversed())
                .map(Candidate::name)
                .toList();

        assertEquals(List.of("майже те саме", "не про те", "зовсім інше"), ranked);
    }

    /** Vectors of different sizes must not throw — a model change leaves old rows behind. */
    @Test
    void toleratesMismatchedDimensions() {
        assertDoesNotThrow(() -> dot(new float[]{1f, 0f}, new float[]{1f, 0f, 0f, 0f}));
    }
}
